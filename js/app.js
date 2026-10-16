// Arranque: configuración → sesión → app.
import { configError, readConfig, showSetup } from './setup.js';
import { ensureCategories, errorMessage, initClient, onAuthChange, sendMagicLink, signOut } from './api.js';
import { mountExpenses, refresh } from './views/gastos.js';
import { $, toast } from './dom.js';

const EMAIL_KEY = 'gastos.email';
let currentUserId = null;

function show(screen) {
  for (const id of ['boot', 'setup', 'login', 'app']) $(`#${id}`).hidden = id !== screen;
}

async function handleSession(session) {
  if (!session) {
    currentUserId = null;
    show('login');
    return;
  }
  if (session.user.id === currentUserId) return; // p. ej. TOKEN_REFRESHED
  currentUserId = session.user.id;
  try {
    const categories = await ensureCategories(currentUserId);
    show('app');
    await mountExpenses(categories);
  } catch (err) {
    currentUserId = null;
    show('login');
    $('#login-msg').textContent = `No se pudieron cargar tus datos: ${errorMessage(err)}`;
  }
}

function wireLogin() {
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
}

function main() {
  const cfg = readConfig();
  if (configError(cfg)) {
    show('setup');
    showSetup(cfg);
    return;
  }
  initClient(cfg);
  wireLogin();
  // Diferido: llamar a Supabase dentro del callback de auth puede bloquearse (recomendación de supabase-js).
  onAuthChange((session) => setTimeout(() => handleSession(session), 0));
  // Sincronización entre dispositivos: recargar al volver a la app.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && currentUserId) refresh();
  });
}

main();
