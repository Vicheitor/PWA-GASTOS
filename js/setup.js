// Configuración de Supabase: desde config.js (local) o guardada en este dispositivo.

const CONFIG_KEY = 'gastos.config';

function jwtRole(key) {
  try {
    return JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role;
  } catch {
    return undefined;
  }
}

// '' si la config sirve; si no, el motivo. Rechaza explícitamente claves secretas.
export function configError(cfg) {
  if (!cfg) return 'Falta la configuración.';
  let url;
  try { url = new URL(cfg.supabaseUrl); } catch { return 'La URL no es válida.'; }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
    return 'La URL debe ser https://<ref>.supabase.co';
  }
  const key = String(cfg.supabaseAnonKey ?? '').trim();
  if (!key || key.startsWith('TU_')) return 'Falta la anon key.';
  if (key.startsWith('sb_secret_') || jwtRole(key) === 'service_role') {
    return 'Esa es una clave secreta (service_role). Usa la anon / publishable key.';
  }
  if (!key.startsWith('sb_publishable_') && jwtRole(key) !== 'anon') {
    return 'La clave no parece una anon key de Supabase.';
  }
  return '';
}

export function readConfig() {
  const fromFile = globalThis.APP_CONFIG;
  if (!configError(fromFile)) return fromFile;
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) ?? fromFile ?? null;
  } catch {
    return fromFile ?? null;
  }
}

// Sin valores precargados: quien abra el sitio en un dispositivo nuevo no ve tu proyecto.
export function showSetup() {
  const form = document.querySelector('#setup-form');
  const errorEl = document.querySelector('#setup-error');
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const next = {
      supabaseUrl: form.url.value.trim().replace(/\/+$/, ''),
      supabaseAnonKey: form.key.value.trim(),
    };
    errorEl.textContent = configError(next);
    if (errorEl.textContent) return;
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    } catch {
      errorEl.textContent = 'No se pudo guardar en este navegador (¿modo privado?).';
      return;
    }
    location.reload();
  });
}

// Olvida la configuración guardada en este dispositivo (vuelve a la pantalla de conexión).
export function clearConfig() {
  try { localStorage.removeItem(CONFIG_KEY); } catch { /* nada que borrar */ }
}
