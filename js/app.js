// Arranque: configuración → sesión → app. También maneja el mes elegido, la carga de datos y las pestañas.
import { configError, readConfig, showSetup } from './setup.js';
import {
  ensureCategories, errorMessage, initClient, listExpenses, listMonthlyTotals, onAuthChange, sendMagicLink, signOut,
} from './api.js';
import { mountExpenses, showExpenses } from './views/gastos.js';
import { resizeCharts, showSummary } from './views/resumen.js';
import { addMonths, monthLabel, monthRange, todayISO } from './format.js';
import { $, toast } from './dom.js';

const EMAIL_KEY = 'gastos.email';
const HISTORY_MONTHS = 12;

let currentUserId = null;
let categories = [];
let month = todayISO().slice(0, 7);
let loadSeq = 0;

function show(screen) {
  for (const id of ['boot', 'setup', 'login', 'app']) $(`#${id}`).hidden = id !== screen;
}

// ---------- Datos del mes (compartidos por Gastos y Resumen) ----------

async function reload() {
  const seq = ++loadSeq;
  $('#month-label').textContent = monthLabel(month);
  try {
    const [expenses, previous, monthly] = await Promise.all([
      listExpenses(...monthRange(month)),
      listExpenses(...monthRange(addMonths(month, -1))),
      listMonthlyTotals(`${addMonths(month, 1 - HISTORY_MONTHS)}-01`, monthRange(month)[1]),
    ]);
    if (seq !== loadSeq) return; // el usuario ya cambió de mes
    showExpenses(expenses);
    showSummary({ month, expenses, previous, monthly, categories });
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

// ---------- Pestañas (solo pantallas angostas; en PC se ven ambas vistas) ----------

function syncTab() {
  const tab = location.hash === '#resumen' ? 'resumen' : 'gastos';
  $('#app').dataset.tab = tab;
  for (const link of document.querySelectorAll('.tabs a')) {
    if (link.dataset.tab === tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (tab === 'resumen') resizeCharts(); // los gráficos se dibujaron ocultos (tamaño 0)
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
    show('app');
    syncTab();
    mountExpenses({ categories, onDataChange: reload });
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
    showSetup(cfg);
    return;
  }
  initClient(cfg);
  wireUi();
  // Diferido: llamar a Supabase dentro del callback de auth puede bloquearse (recomendación de supabase-js).
  onAuthChange((session) => setTimeout(() => handleSession(session), 0));
}

main();
