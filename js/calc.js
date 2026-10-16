// Cálculos puros sobre gastos { id, category_id, amount, spent_on, note }. Sin DOM ni red.
import {
  addMonths, daysInMonth, formatCLP, isValidAmount, isValidISODate, MAX_AMOUNT, MAX_CATEGORY_NAME, MAX_NOTE,
  normalizeText, textLength,
} from './format.js';

// null si el gasto es válido; si no, { field, message } (campo a enfocar). Mismas reglas que schema.sql.
export function validateExpense({ amount, category_id, spent_on, note }, categoryIds) {
  if (!isValidAmount(amount)) return { field: 'amount', message: `Ingresa un monto entre $1 y ${formatCLP(MAX_AMOUNT)}.` };
  if (!categoryIds.has(category_id)) return { field: 'category', message: 'Elige una categoría.' };
  if (!isValidISODate(spent_on)) return { field: 'spent_on', message: 'Ingresa una fecha válida.' };
  if (note && textLength(note) > MAX_NOTE) return { field: 'note', message: `La nota puede tener hasta ${MAX_NOTE} caracteres.` };
  return null;
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

export function filterExpenses(expenses, { categoryId = '', query = '' } = {}) {
  const q = normalizeText(query);
  return expenses.filter((e) =>
    (!categoryId || e.category_id === categoryId) &&
    (!q || normalizeText(e.note ?? '').includes(q)));
}

// ---------- Resumen del mes ----------

const dayOf = (iso) => Number(iso.slice(8, 10));

// Días del mes ya transcurridos: el mes en curso cuenta hasta hoy, los pasados completos, los futuros 0.
export function elapsedDays(ym, today) {
  const current = today.slice(0, 7);
  if (ym > current) return 0;
  return ym === current ? dayOf(today) : daysInMonth(ym);
}

export const sumUpToDay = (expenses, day) => sumAmounts(expenses.filter((e) => dayOf(e.spent_on) <= day));

// pct es null si el mes anterior fue 0 (no hay base para un porcentaje).
export function compareTotals(current, previous) {
  const diff = current - previous;
  return { current, previous, diff, pct: previous > 0 ? (diff / previous) * 100 : null };
}

// En el mes en curso compara días 1..N contra los mismos días del mes anterior;
// en meses pasados compara meses completos.
export function monthSummary(expenses, previousExpenses, ym, today) {
  const days = elapsedDays(ym, today);
  const total = sumAmounts(expenses);
  const partial = days > 0 && days < daysInMonth(ym);
  // Mes completo: el anterior va entero aunque tenga más días (ej: 31 ago al comparar septiembre).
  const previous = partial ? sumUpToDay(previousExpenses, days) : sumAmounts(previousExpenses);
  return {
    total,
    days,
    average: days > 0 ? Math.round(total / days) : 0,
    partial,
    comparison: compareTotals(sumUpToDay(expenses, days), previous),
  };
}

// [{ category_id, total, share }] de mayor a menor; share en 0..1.
export function totalsByCategory(expenses) {
  const totals = new Map();
  for (const e of expenses) totals.set(e.category_id, (totals.get(e.category_id) ?? 0) + e.amount);
  const grand = sumAmounts(expenses);
  return [...totals.entries()]
    .map(([category_id, total]) => ({ category_id, total, share: grand ? total / grand : 0 }))
    .sort((a, b) => b.total - a.total);
}

// Total por día del mes: índice 0 = día 1.
export function dailyTotals(expenses, ym) {
  const days = Array(daysInMonth(ym)).fill(0);
  for (const e of expenses) days[dayOf(e.spent_on) - 1] += e.amount;
  return days;
}

// rows de monthly_totals ({ month: 'YYYY-MM-01', total }) → los `count` meses que terminan en endYm, con 0 si falta.
export function fillMonths(rows, endYm, count = 12) {
  const byMonth = new Map(rows.map((r) => [r.month.slice(0, 7), Number(r.total)]));
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(endYm, i - count + 1);
    return { month, total: byMonth.get(month) ?? 0 };
  });
}

// ---------- Categorías y presupuestos ----------

export const BUDGET_WARN_RATIO = 0.8;

// null sin presupuesto. level: 'ok' (< 80 %), 'warn' (80–100 %), 'over' (lo superó).
export function budgetStatus(spent, budget) {
  if (!budget) return null;
  const ratio = spent / budget;
  return {
    spent,
    budget,
    ratio,
    remaining: budget - spent,
    level: ratio > 1 ? 'over' : ratio >= BUDGET_WARN_RATIO ? 'warn' : 'ok',
  };
}

// Categorías con presupuesto y cómo van en el mes; las más comprometidas primero.
export function budgetReport(categories, expenses) {
  const spentBy = new Map(totalsByCategory(expenses).map((r) => [r.category_id, r.total]));
  return categories
    .filter((c) => c.monthly_budget)
    .map((c) => ({ category: c, ...budgetStatus(spentBy.get(c.id) ?? 0, c.monthly_budget) }))
    .sort((a, b) => b.ratio - a.ratio);
}

const MAX_ICON = 8; // CHECK de schema.sql (en caracteres, como char_length)

// null si es válida; si no, { field, message }. otherNames: nombres de las demás categorías.
export function validateCategory({ name, icon, color, monthly_budget }, otherNames) {
  const clean = name.trim();
  const length = textLength(clean);
  if (length < 1 || length > MAX_CATEGORY_NAME) {
    return { field: 'name', message: `El nombre debe tener entre 1 y ${MAX_CATEGORY_NAME} caracteres.` };
  }
  const key = clean.toLocaleLowerCase('es');
  if (otherNames.some((n) => n.trim().toLocaleLowerCase('es') === key)) {
    return { field: 'name', message: 'Ya tienes una categoría con ese nombre.' };
  }
  if (icon && textLength(icon) > MAX_ICON) return { field: 'icon', message: 'El emoji es demasiado largo.' };
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { field: 'color', message: 'Elige un color válido.' };
  if (monthly_budget !== null && !isValidAmount(monthly_budget)) {
    return { field: 'budget', message: `El presupuesto debe ser entre $1 y ${formatCLP(MAX_AMOUNT)}.` };
  }
  return null;
}
