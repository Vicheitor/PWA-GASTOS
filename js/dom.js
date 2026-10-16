// h('button', { class: 'x', onclick: fn }, 'texto'): crea elementos sin innerHTML,
// así el texto del usuario (notas, nombres) nunca se interpreta como HTML.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.filter((c) => c != null && c !== false));
  return el;
}

export const $ = (sel) => document.querySelector(sel);

let toastTimer;
export function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.textContent = ''; }, 3500);
}
