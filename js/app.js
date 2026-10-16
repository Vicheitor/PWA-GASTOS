// Arranque: configuración → sesión → app. También maneja el mes elegido, la carga de datos y las pestañas.
import { clearConfig, configError, readConfig, showSetup } from './setup.js';
import {
  ensureCategories, errorMessage, initClient, listCategories, listExpenses, listMonthlyTotals, onAuthChange,
  sendMagicLink, signOut,
} from './api.js';
import { mountExpenses, openNewExpense, setCategories, showExpenses } from './views/gastos.js';
import { mountCategories, showCategories } from './views/categorias.js';
import { mountBackup } from './views/respaldo.js';
import { resizeCharts, showSummary } from './views/resumen.js';
import { addMonths, monthLabel, monthRange, todayISO } from './format.js';
import { $, toast } from './dom.js';

const EMAIL_KEY = 'gastos.email';
const HISTORY_MONTHS = 12;

let currentUserId = null;
let categories = [];
let month = todayISO().slice(0, 7);
let loadSeq = 0;
let installPrompt = null; // evento de Chrome para ofrecer "Instalar app"

function show(screen) {
  for (const id of ['boot', 'setup', 'login', 'app']) $(`#${id}`).hidden = id !== screen;
}

// ---------- Datos del mes (compartidos por Gastos y Resumen) ----------

async function reload() {
  const seq = ++loadSeq;
  $('#month-label').textContent = monthLabel(month);
  try {
    // Las categorías también se recargan: pueden cambiar en esta vista o en otro dispositivo.
    const [freshCategories, expenses, previous, monthly] = await Promise.all([
      listCategories(),
      listExpenses(...monthRange(month)),
      listExpenses(...monthRange(addMonths(month, -1))),
      listMonthlyTotals(`${addMonths(month, 1 - HISTORY_MONTHS)}-01`, monthRange(month)[1]),
    ]);
    if (seq !== loadSeq) return; // el usuario ya cambió de mes
    categories = freshCategories;
    setCategories(categories);
    showExpenses(expenses);
    showSummary({ month, expenses, previous, monthly, categories });
    showCategories({ categories, expenses });
  } catch (err) {
    if (seq !== loadSeq) return;
    showExpenses([]);
    toast(errorMessage(err));
  }
}

function changeMonth(delta) {
  month = addMonths(month, delta);
  showExpenses(null);
  showSummary(null);
  reload();
}

// ---------- Menú: Inicio (gastos), Resumen y Ajustes ----------

const TABS = ['gastos', 'resumen', 'categorias', 'ajustes'];

function syncTab() {
  if (location.hash === '#nuevo') { // atajo del ícono instalado: "Agregar gasto"
    history.replaceState(null, '', '#gastos');
    if (currentUserId) openNewExpense();
  }
  const tab = TABS.find((t) => location.hash === `#${t}`) ?? 'gastos';
  $('#app').dataset.tab = tab;
  for (const link of document.querySelectorAll('.nav a')) {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
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

async function handleSession(session) {
  if (!session) {
    currentUserId = null;
    show('login');
    return;
  }
  if (session.user.id === currentUserId) return; // p. ej. TOKEN_REFRESHED
  currentUserId = session.user.id;
  try {
    categories = await ensureCategories(currentUserId);
    $('#account-email').textContent = session.user.email ?? '';
    show('app');
    mountExpenses({ categories, onDataChange: reload });
    mountCategories({ onDataChange: reload });
    mountBackup({ onDataChange: reload });
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
    try {
      await signOut();
    } catch (err) {
      toast(errorMessage(err));
      return;
    }
    location.reload();
  });

  $('#reset-config').addEventListener('click', async () => {
    if (!confirm('¿Desconectar este dispositivo? Tendrás que pegar la clave de nuevo.')) return;
    try { await signOut(); } catch { /* igual se olvida la clave */ }
    clearConfig();
    location.reload();
  });

  $('#month-prev').addEventListener('click', () => changeMonth(-1));
  $('#month-next').addEventListener('click', () => changeMonth(1));
  window.addEventListener('hashchange', syncTab);
  // Sincronización entre dispositivos: recargar al volver a la app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentUserId) reload();
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
