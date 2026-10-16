// Script clásico (no módulo): corre aunque algún módulo de la app falle al cargar.

// Service worker: la app siempre usa la versión publicada y abre sin internet.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

// Si la app no arranca en 8 s (sin conexión o un archivo que no cargó), ofrecer reintentar.
const BOOT_TIMEOUT_MS = 8000;
setTimeout(() => {
  const boot = document.getElementById('boot');
  if (boot && !boot.hidden) boot.classList.add('is-stuck');
}, BOOT_TIMEOUT_MS);
document.getElementById('boot-retry')?.addEventListener('click', () => location.reload());
