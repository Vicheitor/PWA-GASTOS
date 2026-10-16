import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterExpenses, groupByDay, isEditable, sumAmounts, validateExpense } from '../js/calc.js';

test('isEditable: editable antes de 12 horas, bloqueado desde las 12 horas', () => {
  const now = Date.parse('2026-10-16T20:00:00Z');
  assert.ok(isEditable({ created_at: '2026-10-16T08:00:01Z' }, now)); // 11:59:59
  assert.ok(!isEditable({ created_at: '2026-10-16T08:00:00Z' }, now)); // 12:00:00 exactas
  assert.ok(!isEditable({ created_at: '2026-10-15T20:00:00Z' }, now));
  assert.ok(!isEditable({}, now)); // sin fecha de creación: no se arriesga
});

const expenses = [
  { id: '1', category_id: 'comida', amount: 5000, spent_on: '2026-10-02', note: 'Almuerzo' },
  { id: '2', category_id: 'chatarra', amount: 1500, spent_on: '2026-10-15', note: 'Completo italiano' },
  { id: '3', category_id: 'comida', amount: 32990, spent_on: '2026-10-15', note: 'Súper Líder' },
  { id: '4', category_id: 'bencina', amount: 20000, spent_on: '2026-10-09', note: null },
];

test('sumAmounts suma montos y da 0 con lista vacía', () => {
  assert.equal(sumAmounts(expenses), 59490);
  assert.equal(sumAmounts([]), 0);
});

test('groupByDay ordena días del más reciente al más antiguo con su total', () => {
  const days = groupByDay(expenses);
  assert.deepEqual(days.map((d) => d.date), ['2026-10-15', '2026-10-09', '2026-10-02']);
  assert.equal(days[0].total, 34490);
  assert.deepEqual(days[0].items.map((e) => e.id), ['2', '3']); // conserva el orden de entrada
});

test('filterExpenses por categoría', () => {
  assert.deepEqual(filterExpenses(expenses, { categoryId: 'comida' }).map((e) => e.id), ['1', '3']);
});

test('filterExpenses busca en notas sin importar mayúsculas ni tildes', () => {
  assert.deepEqual(filterExpenses(expenses, { query: 'super lider' }).map((e) => e.id), ['3']);
  assert.deepEqual(filterExpenses(expenses, { query: 'ALMUERZO' }).map((e) => e.id), ['1']);
  assert.equal(filterExpenses(expenses, { query: '  ' }).length, 4);
});

test('filterExpenses combina categoría y búsqueda', () => {
  assert.deepEqual(filterExpenses(expenses, { categoryId: 'comida', query: 'completo' }), []);
});

test('validateExpense acepta un gasto correcto y rechaza cada campo inválido', () => {
  const ids = new Set(['comida']);
  const ok = { amount: 1000, category_id: 'comida', spent_on: '2026-10-16', note: null };
  assert.equal(validateExpense(ok, ids), '');
  assert.match(validateExpense({ ...ok, amount: 0 }, ids), /monto/);
  assert.match(validateExpense({ ...ok, amount: NaN }, ids), /monto/);
  assert.match(validateExpense({ ...ok, category_id: 'otra' }, ids), /categoría/);
  assert.match(validateExpense({ ...ok, spent_on: '2026-02-30' }, ids), /fecha/);
  assert.match(validateExpense({ ...ok, note: 'x'.repeat(201) }, ids), /200/);
});
