// Acceso a Supabase: auth, categorías y gastos. Las vistas no llaman a supabase-js directamente.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const PAGE_SIZE = 1000; // máximo de filas por respuesta en Supabase

// [nombre, emoji, color]. Mismas que supabase/migracion-categorias.sql.
export const DEFAULT_CATEGORIES = [
  ['Comida', '🛒', '#16a34a'],          // súper, almuerzos
  ['Chatarra', '🍟', '#ea580c'],        // bajones: completos, papas fritas, snacks, dulces
  ['Transporte', '🚌', '#2563eb'],      // bencina, micro, metro, Uber
  ['Cuentas', '🧾', '#ca8a04'],         // arriendo, luz, agua, gas, internet, plan celular
  ['Entretenimiento', '🎮', '#9333ea'], // juegos, suscripciones, salidas
  ['Ropa', '👕', '#db2777'],
  ['Salud', '💊', '#0891b2'],
  ['Estudios', '📚', '#4f46e5'],
  ['Otros', '📦', '#64748b'],
];

let sb;

export function initClient({ supabaseUrl, supabaseAnonKey }) {
  sb = createClient(supabaseUrl, supabaseAnonKey); // sesión persistente en localStorage por defecto
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

export function errorMessage(err) {
  if (!navigator.onLine || /failed to fetch|network/i.test(err?.message ?? '')) {
    return 'Sin conexión. Intenta de nuevo.';
  }
  if (err?.code === '42501' || err?.code === 'LOCKED') {
    return 'Este gasto tiene más de 12 horas y ya no se puede modificar.';
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
    options: { emailRedirectTo: location.href.split('#')[0] },
  }));
}

export async function signOut() {
  check(await sb.auth.signOut());
}

// ---------- Categorías ----------

export async function listCategories() {
  return check(await sb.from('categories').select('id,name,icon,color,monthly_budget').order('name'));
}

// Crea las categorías iniciales si el usuario no tiene ninguna.
// ignoreDuplicates + unique(user_id, name) evita duplicados si dos dispositivos lo hacen a la vez.
export async function ensureCategories(userId) {
  const existing = await listCategories();
  if (existing.length) return existing;
  check(await sb.from('categories').upsert(
    DEFAULT_CATEGORIES.map(([name, icon, color]) => ({ user_id: userId, name, icon, color })),
    { onConflict: 'user_id,name', ignoreDuplicates: true },
  ));
  return listCategories();
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

// Inserta o actualiza por id (el id lo genera el cliente).
// Si el gasto tiene más de 12 h, RLS rechaza la actualización con 42501.
export async function saveExpense({ id, category_id, amount, spent_on, note }) {
  check(await sb.from('expenses').upsert({ id, category_id, amount, spent_on, note }));
}

// RLS no da error al borrar un gasto bloqueado: simplemente no borra nada. Por eso se verifica.
export async function deleteExpense(id) {
  const deleted = check(await sb.from('expenses').delete().eq('id', id).select('id'));
  if (!deleted.length) throw Object.assign(new Error('Gasto bloqueado'), { code: 'LOCKED' });
}
