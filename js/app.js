// Arranque: configuración → sesión → app. También maneja el mes elegido, la carga de datos y las pestañas.
import { clearConfig, configError, readConfig, showSetup } from './setup.js';
import {
  ensureCategories, errorMessage, initClient, isNetworkError, listCategories, listExpenses, listMonthlyTotals,
  onAuthChange, sendMagicLink, signOut, storedUser,
} from './api.js';
import {
  clearLocalData, initOffline, loadSnapshot, pendingOps, saveSnapshot, syncPending, withPending,
} from './offline.js';
import { mountExpenses, openNewExpense, setCategories, showExpenses, showLoadError } from './views/gastos.js';
import { mountCategories, showCategories } from './views/categorias.js';
import { mountBackup } from './views/respaldo.js';
import { resizeCharts, showSummary } from './views/resumen.js';
import { addMonths, formatCLP, monthLabel, monthRange, todayISO } from './format.js';
import { $, h, toast } from './dom.js';
import { icon } from './icons.js';

const EMAIL_KEY = 'gastos.email';
const HISTORY_MONTHS = 12;

let currentUserId = null;
let categories = [];
let month = todayISO().slice(0, 7);
let loadSeq = 0;
let installPrompt = null; // evento de Chrome para ofrecer "Instalar app"
let mounted = false; // las vistas se montan una sola vez por carga de página
let syncProblems = []; // cambios que Supabase rechazó al sincronizar (se muestran hasta cerrarlos)

function show(screen) {
  for (const id of ['boot', 'setup', 'login', 'app']) $(`#${id}`).hidden = id !== screen;
}

// ---------- Aviso de conexión y sincronización ----------

function showStatus(offline, hasSnapshot) {
  const pending = pendingOps().length;
  const pendingText = pending ? ` ${pending} ${pending === 1 ? 'cambio' : 'cambios'} por enviar.` : '';
  let text = '';
  if (offline) {
    text = hasSnapshot
      ? `Sin conexión: ves lo guardado en este dispositivo.${pendingText}`
      : `Sin conexión: este mes no está guardado en este dispositivo.${pendingText}`;
  } else if (pending) {
    text = pendingText.trim();
  }
  $('#net-text').replaceChildren(...(text ? [icon(offline ? 'offline' : 'clock'), h('span', {}, text)] : []));
  $('#net-problems').replaceChildren(...syncProblems.map((p) => {
    const li = document.createElement('li');
    li.textContent = p;
    return li;
  }));
  $('#net-dismiss').hidden = !syncProblems.length;
  $('#net-status').hidden = !text && !syncProblems.length;
}

function reportSyncFailures(failed) {
  syncProblems = [...syncProblems, ...failed.map(({ op, err }) => (op.type === 'save'
    ? `No se pudo guardar ${formatCLP(op.row.amount)} del ${op.row.spent_on}: ${errorMessage(err)}`
    : `No se pudo eliminar un gasto: ${errorMessage(err)}`))];
  showStatus(!navigator.onLine, true);
}

// ---------- Datos del mes (compartidos por todas las vistas) ----------

async function fetchMonth(ym) {
  // Las categorías también se recargan: pueden cambiar en otra vista o en otro dispositivo.
  const [freshCategories, expenses, previous, monthly] = await Promise.all([
    listCategories(),
    listExpenses(...monthRange(ym)),
    listExpenses(...monthRange(addMonths(ym, -1))),
    listMonthlyTotals(`${addMonths(ym, 1 - HISTORY_MONTHS)}-01`, monthRange(ym)[1]),
  ]);
  return { categories: freshCategories, expenses, previous, monthly };
}

async function reload() {
  const seq = ++loadSeq;
  const ym = month; // el usuario puede cambiar de mes mientras esto espera la red
  showMonth(ym);
  await syncPending(); // primero lo pendiente, así lo que se lee ya lo incluye
  let data;
  let offline = false;
  let hasSnapshot = true;
  try {
    data = await fetchMonth(ym);
    saveSnapshot(ym, data);
  } catch (err) {
    if (seq !== loadSeq) return;
    if (!isNetworkError(err)) {
      showLoadError(`No se pudieron cargar los gastos: ${errorMessage(err)}`);
      return;
    }
    const saved = loadSnapshot(ym);
    offline = true;
    hasSnapshot = Boolean(saved.month);
    data = { expenses: [], previous: [], monthly: [], ...saved.month, categories: saved.categories ?? categories };
  }
  if (seq !== loadSeq) return; // el usuario ya cambió de mes
  categories = data.categories;
  const expenses = withPending(data.expenses, monthRange(ym));
  const previous = withPending(data.previous, monthRange(addMonths(ym, -1)));
  setCategories(categories);
  showExpenses(expenses);
  showSummary({ month: ym, expenses, previous, monthly: data.monthly, categories });
  showCategories({ categories, expenses });
  showStatus(offline, hasSnapshot);
}

// El nombre del mes se lee en voz alta al cambiar: solo se toca si cambió.
function showMonth(ym) {
  const label = monthLabel(ym);
  if ($('#month-label').textContent !== label) $('#month-label').textContent = label;
  $('#month-today').hidden = ym === todayISO().slice(0, 7);
}

function goToMonth(ym) {
  month = ym;
  showExpenses(null);
  showSummary(null);
  reload();
}

const changeMonth = (delta) => goToMonth(addMonths(month, delta));

// ---------- Menú: Inicio (gastos), Resumen y Ajustes ----------

const TABS = ['gastos', 'resumen', 'categorias', 'ajustes'];
const TAB_TITLES = { gastos: 'Inicio', resumen: 'Resumen', categorias: 'Categorías', ajustes: 'Ajustes' };
const wideLayout = matchMedia('(min-width: 64rem)'); // en PC, Resumen va junto a Inicio

function syncTab() {
  if (location.hash === '#nuevo') { // atajo del ícono instalado: "Agregar gasto"
    history.replaceState(null, '', '#gastos');
    if (currentUserId) openNewExpense();
  }
  const tab = TABS.find((t) => location.hash === `#${t}`) ?? 'gastos';
  $('#app').dataset.tab = tab;
  document.title = `${TAB_TITLES[tab]} · Mis Gastos`;
  const current = tab === 'resumen' && wideLayout.matches ? 'gastos' : tab;
  for (const link of document.querySelectorAll('.nav a')) {
    if (link.dataset.tab === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (tab === 'gastos' || tab === 'resumen') resizeCharts(); // los gráficos pudieron dibujarse ocultos (tamaño 0)
}

function wireInstall() {
  const standalone = matchMedia('(display-mode: standalone)').matches;
  if (standalone) $('#install-text').textContent = 'Ya la estás usando como app. ✅';
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    installPrompt = ev;
    $('#install').hidden = false;
  });
  $('#install').addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $('#install').hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    $('#install').hidden = true;
    $('#install-text').textContent = 'App instalada. Ábrela desde tu pantalla de inicio. ✅';
  });
}

// ---------- Sesión ----------

// Categorías al iniciar; sin conexión, las guardadas en el dispositivo (null si no hay).
async function startupCategories() {
  try {
    return await ensureCategories();
  } catch (err) {
    if (isNetworkError(err)) return loadSnapshot(month).categories;
    throw err;
  }
}

async function handleSession(session) {
  // Sin conexión supabase-js no puede renovar un token vencido y avisa "sin sesión":
  // si hay una sesión guardada en el dispositivo, se abre igual con los datos locales.
  const user = session?.user ?? (navigator.onLine ? null : storedUser());
  if (!user) {
    currentUserId = null;
    show('login');
    return;
  }
  if (user.id === currentUserId) return; // p. ej. TOKEN_REFRESHED
  currentUserId = user.id;
  initOffline(user.id, { onSyncFailures: reportSyncFailures });
  try {
    categories = await startupCategories();
    if (!categories) {
      currentUserId = null;
      show('login');
      $('#login-msg').textContent = 'Sin conexión. Abre la app con internet una vez para guardar tus datos en este dispositivo.';
      return;
    }
    $('#account-email').textContent = user.email ?? '';
    show('app');
    if (!mounted) {
      mounted = true;
      mountExpenses({ categories, onDataChange: reload });
      mountCategories({ onDataChange: reload });
      mountBackup({ onDataChange: reload });
    }
    syncTab();
    await reload();
  } catch (err) {
    currentUserId = null;
    show('login');
    $('#login-msg').textContent = `No se pudieron cargar tus datos: ${errorMessage(err)}`;
  }
}

function wireUi() {
  const form = $('#login-form');
  const msg = $('#login-msg');
  try { form.email.value = localStorage.getItem(EMAIL_KEY) ?? ''; } catch { /* almacenamiento bloqueado */ }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = form.email.value.trim();
    if (!email || !form.email.checkValidity()) {
      msg.textContent = 'Ingresa un correo válido.';
      return;
    }
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      await sendMagicLink(email);
      try { localStorage.setItem(EMAIL_KEY, email); } catch { /* opcional */ }
      msg.textContent = 'Listo. Abre en este dispositivo el enlace que llegó a tu correo.';
    } catch (err) {
      msg.textContent = errorMessage(err);
    } finally {
      btn.disabled = false;
    }
  });

  $('#logout').addEventListener('click', async () => {
    const pending = pendingOps().length;
    if (pending && !confirm(`Tienes ${pending} ${pending === 1 ? 'cambio' : 'cambios'} sin enviar (sin conexión). Si sales, se perderán. ¿Salir igual?`)) return;
    try {
      await signOut();
    } catch (err) {
      toast(errorMessage(err));
      return;
    }
    clearLocalData(); // en un dispositivo compartido no quedan tus gastos guardados
    location.reload();
  });

  $('#reset-config').addEventListener('click', async () => {
    if (!confirm('¿Desconectar este dispositivo? Tendrás que pegar la clave de nuevo.')) return;
    try { await signOut(); } catch { /* igual se olvida la clave */ }
    clearLocalData();
    clearConfig();
    location.reload();
  });

  $('#month-prev').addEventListener('click', () => changeMonth(-1));
  $('#month-next').addEventListener('click', () => changeMonth(1));
  $('#month-today').addEventListener('click', () => goToMonth(todayISO().slice(0, 7)));
  wideLayout.addEventListener('change', syncTab);
  window.addEventListener('hashchange', syncTab);
  // Sincronización entre dispositivos: recargar al volver a la app o al recuperar internet.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentUserId) reload();
  });
  window.addEventListener('online', () => { if (currentUserId) reload(); });
  window.addEventListener('offline', () => { if (currentUserId) showStatus(true, true); });
  $('#net-dismiss').addEventListener('click', () => {
    syncProblems = [];
    showStatus(!navigator.onLine, true);
  });
}

function main() {
  const cfg = readConfig();
  if (configError(cfg)) {
    show('setup');
    showSetup();
    return;
  }
  initClient(cfg);
  wireUi();
  wireInstall();
  // Diferido: llamar a Supabase dentro del callback de auth puede bloquearse (recomendación de supabase-js).
  onAuthChange((session) => setTimeout(() => handleSession(session), 0));
}

main();
