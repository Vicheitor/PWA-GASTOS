// Piezas visuales de presupuesto compartidas por Inicio, Resumen y Categorías.
// El estado nunca depende solo del color: siempre va con ícono y texto.
import { formatCLP } from '../format.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';

const percent = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
const pct = (ratio) => `${percent.format(ratio * 100)}%`;

export function budgetBar(status) {
  return h('span', { class: `bar budget-${status.level}`, 'aria-hidden': 'true' },
    h('span', { style: `width:${(Math.min(status.ratio, 1) * 100).toFixed(1)}%` }));
}

export function budgetBadge(status) {
  if (status.level === 'over') return h('span', { class: 'badge over' }, icon('alert'), 'Superado');
  if (status.level === 'warn') return h('span', { class: 'badge warn' }, icon('warning'), pct(status.ratio));
  return h('span', { class: 'badge' }, pct(status.ratio));
}

export function budgetDetail(status) {
  return status.remaining >= 0
    ? `${formatCLP(status.spent)} de ${formatCLP(status.budget)} · quedan ${formatCLP(status.remaining)}`
    : `${formatCLP(status.spent)} de ${formatCLP(status.budget)} · te pasaste ${formatCLP(-status.remaining)}`;
}

// Texto de alerta para una entrada de budgetReport con level 'warn' u 'over'.
export function budgetAlertText({ category, ratio, remaining, level }) {
  return level === 'over'
    ? `${category.name}: superaste tu presupuesto por ${formatCLP(-remaining)}.`
    : `${category.name}: llevas el ${pct(ratio)} de tu presupuesto (quedan ${formatCLP(remaining)}).`;
}

export function budgetAlert(entry) {
  return h('p', { class: `alert ${entry.level}` },
    icon(entry.level === 'over' ? 'alert' : 'warning'),
    h('span', {}, budgetAlertText(entry)));
}
