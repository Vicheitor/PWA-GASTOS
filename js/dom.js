import { formatThousands } from './format.js';

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

// Deshabilita el botón mientras corre action; si falla, muestra el error en errorEl
// (el formulario sigue abierto y no se pierde lo escrito).
export async function withBusy(button, errorEl, action, describeError) {
  button.disabled = true;
  try {
    await action();
  } catch (err) {
    errorEl.textContent = describeError(err);
  } finally {
    button.disabled = false;
  }
}

const MAX_AMOUNT_DIGITS = 9;

// Campo de monto: solo dígitos, con puntos de miles mientras se escribe.
export function bindAmountInput(input) {
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').slice(0, MAX_AMOUNT_DIGITS);
    input.value = digits ? formatThousands(Number(digits)) : '';
  });
}
