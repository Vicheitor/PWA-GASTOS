// Acceso a Supabase: auth, categorías y gastos. Las vistas no llaman a supabase-js directamente.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const PAGE_SIZE = 1000; // máximo de filas por respuesta en Supabase
const REQUEST_TIMEOUT_MS = 15_000; // con mala señal ("lie-fi") una petición no queda colgada para siempre

// [nombre, emoji, color]. Mismas que supabase/migracion-categorias*.sql.
export const DEFAULT_CATEGORIES = [
  ['Comida', '🛒', '#16a34a'],          // súper, almuerzos
  ['Bajón', '🍟', '#ea580c'],           // completos, papas fritas, snacks, dulces
  ['Transporte', '🚌', '#2563eb'],      // bencina, micro, metro, Uber
  ['Cuentas', '🧾', '#ca8a04'],         // arriendo, luz, agua, gas, internet, plan celular
  ['Entretenimiento', '🎮', '#9333ea'], // juegos, suscripciones, salidas
  ['Ropa', '👕', '#db2777'],
  ['Salud', '💊', '#0891b2'],
  ['Otros', '📦', '#64748b'],
];

let sb;

function fetchWithTimeout(input, init = {}) {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = !init.signal ? timeout : AbortSignal.any ? AbortSignal.any([init.signal, timeout]) : init.signal;
  return fetch(input, { ...init, signal });
}

export function initClient({ supabaseUrl, supabaseAnonKey }) {
  // Sesión persistente en localStorage (por defecto en supabase-js).
  sb = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: fetchWithTimeout } });
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

// Error por falta de conexión (no llegó a Supabase), a diferencia de un rechazo del servidor.
export function isNetworkError(err) {
  return !navigator.onLine || err?.name === 'TimeoutError'
    || /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeouterror|timed out|aborterror/i
      .test(err?.message ?? '');
}

// Rechazo definitivo de Supabase (permisos/RLS, restricciones, datos inválidos): reintentar no sirve.
// Otros errores (caídas 5xx, límites 429, sesión vencida) pueden pasar solos y se reintentan.
export function isPermanentError(err) {
  return /^(42501|LOCKED|23\d{3}|22\d{3}|P0002)$/.test(err?.code ?? '');
}

export function errorMessage(err) {
  if (isNetworkError(err)) return 'Sin conexión. Intenta de nuevo.';
  if (err?.code === 'over_email_send_rate_limit' || err?.status === 429 || /rate limit/i.test(err?.message ?? '')) {
    return 'Se enviaron demasiados correos. Usa el último enlace que te llegó o espera cerca de una hora.';
  }
  if (err?.code === 'LOCKED') return 'Este gasto tiene más de 12 horas y ya no se puede modificar.';
  if (err?.code === '42501') {
    return 'No se permitió el cambio: el gasto tiene más de 12 horas o tu sesión expiró (vuelve a entrar).';
  }
  if (err?.code === '23503') return 'La categoría no existe o todavía tiene gastos asociados.';
  if (err?.code === '23514') return 'Algún dato no cumple las reglas (monto, fecha o largo).';
  if (err?.code === '23505') return 'Ya existe una categoría con ese nombre.';
  return err?.message || 'Ocurrió un error inesperado.';
}

// ---------- Auth ----------

export const onAuthChange = (cb) => sb.auth.onAuthStateChange((_event, session) => cb(session));

export async function sendMagicLink(email) {
  check(await sb.auth.signInWithOtp({
    email,
    // shouldCreateUser: false → la app solo deja entrar a cuentas que ya existen (es de uso personal).
    options: { emailRedirectTo: location.href.split('#')[0], shouldCreateUser: false },
  }));
}

// Usuario de la sesión guardada por supabase-js. Sin conexión, el token vencido no se puede
// renovar y supabase-js informa "sin sesión"; con esto la app igual abre con los datos locales.
export function storedUser() {
  try {
    const key = Object.keys(localStorage).find((k) => /^sb-.+-auth-token$/.test(k));
    return key ? JSON.parse(localStorage.getItem(key))?.user ?? null : null;
  } catch {
    return null;
  }
}

// Sin conexión no se puede avisar al servidor: se cierra igual la sesión en este dispositivo.
export async function signOut() {
  const { error } = await sb.auth.signOut();
  if (error && isNetworkError(error)) check(await sb.auth.signOut({ scope: 'local' }));
  else if (error) throw error;
}

// ---------- Categorías ----------

export async function listCategories() {
  return check(await sb.from('categories').select('id,name,icon,color,monthly_budget').order('name'));
}

// Crea las categorías iniciales si el usuario no tiene ninguna.
// ignoreDuplicates + unique(user_id, name) evita duplicados si dos dispositivos lo hacen a la vez.
export async function ensureCategories() {
  const existing = await listCategories();
  if (existing.length) return existing;
  check(await sb.from('categories').upsert(
    // user_id lo pone la base (default auth.uid()), no el cliente.
    DEFAULT_CATEGORIES.map(([name, icon, color]) => ({ name, icon, color })),
    { onConflict: 'user_id,name', ignoreDuplicates: true },
  ));
  return listCategories();
}

// Crea (sin id) o actualiza (con id) una categoría.
export async function saveCategory({ id, name, icon, color, monthly_budget }) {
  const row = { name: name.trim(), icon: icon || null, color, monthly_budget };
  if (id) check(await sb.from('categories').update(row).eq('id', id));
  else check(await sb.from('categories').insert(row));
}

// Varias a la vez (importación CSV). Devuelve las creadas con su id.
export async function createCategories(rows) {
  return check(await sb.from('categories').insert(rows).select('id,name,icon,color,monthly_budget'));
}

// Mueve sus gastos a moveTo (si tiene) y la elimina, todo en la base (ver delete_category en schema.sql).
export async function deleteCategory(id, moveTo) {
  check(await sb.rpc('delete_category', { p_category: id, p_move_to: moveTo || null }));
}

// ---------- Gastos ----------

// Gastos con spent_on en [fromDate, toDate), paginando para no cortar en 1000 filas.
export async function listExpenses(fromDate, toDate) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = check(await sb.from('expenses')
      .select('id,category_id,amount,spent_on,note,created_at')
      .gte('spent_on', fromDate)
      .lt('spent_on', toDate)
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1));
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

// Totales por mes agregados en SQL (no trae filas sueltas, así no choca con el límite de 1000).
export async function listMonthlyTotals(fromDate, toDate) {
  return check(await sb.rpc('monthly_totals', { p_from: fromDate, p_to: toDate }));
}

// Inserta o actualiza por id (el id lo genera el cliente).
// Si el gasto tiene más de 12 h, RLS rechaza la actualización con 42501.
export async function saveExpense({ id, category_id, amount, spent_on, note }) {
  check(await sb.from('expenses').upsert({ id, category_id, amount, spent_on, note }));
}

// Importación CSV: inserta en tandas para no mandar peticiones gigantes.
export async function insertExpenses(rows) {
  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    check(await sb.from('expenses').insert(rows.slice(i, i + PAGE_SIZE)));
  }
}

// RLS no da error al borrar un gasto bloqueado: simplemente no borra nada. Por eso se verifica.
export async function deleteExpense(id) {
  const deleted = check(await sb.from('expenses').delete().eq('id', id).select('id'));
  if (!deleted.length) throw Object.assign(new Error('Gasto bloqueado'), { code: 'LOCKED' });
}
