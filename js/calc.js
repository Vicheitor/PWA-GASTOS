// Cálculos puros sobre gastos { id, category_id, amount, spent_on, note }. Sin DOM ni red.
import { formatCLP, isValidAmount, isValidISODate, MAX_AMOUNT } from './format.js';

const MAX_NOTE = 200;

// '' si el gasto es válido; si no, el mensaje para el usuario. Mismas reglas que schema.sql.
export function validateExpense({ amount, category_id, spent_on, note }, categoryIds) {
  if (!isValidAmount(amount)) return `Ingresa un monto entre $1 y ${formatCLP(MAX_AMOUNT)}.`;
  if (!categoryIds.has(category_id)) return 'Elige una categoría.';
  if (!isValidISODate(spent_on)) return 'Ingresa una fecha válida.';
  if (note && note.length > MAX_NOTE) return `La nota puede tener hasta ${MAX_NOTE} caracteres.`;
  return '';
}

// Igual que las políticas RLS de schema.sql: editar/eliminar solo durante 12 h desde la creación.
export const EDIT_WINDOW_HOURS = 12;

export function isEditable(expense, now = Date.now()) {
  const created = Date.parse(expense?.created_at);
  return Number.isFinite(created) && now - created < EDIT_WINDOW_HOURS * 3_600_000;
}

export const sumAmounts =(list) => list.reduce((s, e) => s + e.amount, 0);

// Grupos por día, el más reciente primero. Conserva el orden de los gastos dentro del día.
export function groupByDay(expenses) {
  const byDay = new Map();
  for (const e of expenses) byDay.set(e.spent_on, [...(byDay.get(e.spent_on) ?? []), e]);
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, items]) => ({ date, items, total: sumAmounts(items) }));
}

const normalize = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function filterExpenses(expenses, { categoryId = '', query = '' } = {}) {
  const q = normalize(query.trim());
  return expenses.filter((e) =>
    (!categoryId || e.category_id === categoryId) &&
    (!q || normalize(e.note ?? '').includes(q)));
}
