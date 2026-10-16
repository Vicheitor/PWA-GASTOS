// Piezas visuales de presupuesto compartidas por Inicio, Resumen y Categorías.
// El estado nunca depende solo del color: siempre va con ícono y texto.
import { formatCLP } from '../format.js';
import { h } from '../dom.js';

const percent = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
const pct = (ratio) => `${percent.format(ratio * 100)}%`;

export function budgetBar(status) {
  return h('div', { class: `bar budget-${status.level}`, 'aria-hidden': 'true' },
    h('span', { style: `width:${(Math.min(status.ratio, 1) * 100).toFixed(1)}%` }));
}

export function budgetBadge(status) {
  if (status.level === 'over') return h('span', { class: 'badge over' }, '🚨 Superado');
  if (status.level === 'warn') return h('span', { class: 'badge warn' }, `⚠️ ${pct(status.ratio)}`);
  return h('span', { class: 'badge' }, pct(status.ratio));
}

export function budgetDetail(status) {
  return status.remaining >= 0
    ? `${formatCLP(status.spent)} de ${formatCLP(status.budget)} · quedan ${formatCLP(status.remaining)}`
    : `${formatCLP(status.spent)} de ${formatCLP(status.budget)} · te pasaste ${formatCLP(-status.remaining)}`;
}

// Texto de alerta para una entrada de budgetReport con level 'warn' u 'over'.
export function budgetAlertText({ category, ratio, remaining, level }) {
  const name = `${category.icon ?? ''} ${category.name}`.trim();
  return level === 'over'
    ? `🚨 ${name}: superaste tu presupuesto por ${formatCLP(-remaining)}.`
    : `⚠️ ${name}: llevas el ${pct(ratio)} de tu presupuesto (quedan ${formatCLP(remaining)}).`;
}
