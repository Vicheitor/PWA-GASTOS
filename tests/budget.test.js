import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budgetReport, budgetStatus, validateCategory } from '../js/calc.js';

test('budgetStatus: sin presupuesto devuelve null', () => {
  assert.equal(budgetStatus(5000, null), null);
  assert.equal(budgetStatus(5000, 0), null);
});

test('budgetStatus: ok bajo 80 %, alerta desde 80 % hasta 100 %, superado sobre 100 %', () => {
  assert.equal(budgetStatus(79_999, 100_000).level, 'ok');
  assert.equal(budgetStatus(80_000, 100_000).level, 'warn');
  assert.equal(budgetStatus(100_000, 100_000).level, 'warn'); // justo en el límite: aún no lo supera
  assert.equal(budgetStatus(100_001, 100_000).level, 'over');
  assert.deepEqual(budgetStatus(120_000, 100_000), { spent: 120_000, budget: 100_000, ratio: 1.2, remaining: -20_000, level: 'over' });
});

test('budgetReport: solo categorías con presupuesto, incluidas las sin gastos, ordenadas por % usado', () => {
  const categories = [
    { id: 'comida', name: 'Comida', monthly_budget: 100_000 },
    { id: 'bajon', name: 'Bajón', monthly_budget: 20_000 },
    { id: 'ropa', name: 'Ropa', monthly_budget: 50_000 },
    { id: 'otros', name: 'Otros', monthly_budget: null },
  ];
  const expenses = [
    { category_id: 'comida', amount: 50_000, spent_on: '2026-10-01' },
    { category_id: 'bajon', amount: 18_000, spent_on: '2026-10-02' },
    { category_id: 'otros', amount: 99_000, spent_on: '2026-10-03' },
  ];
  const report = budgetReport(categories, expenses);
  assert.deepEqual(report.map((r) => [r.category.id, r.spent, r.level]), [
    ['bajon', 18_000, 'warn'],
    ['comida', 50_000, 'ok'],
    ['ropa', 0, 'ok'],
  ]);
});

test('validateCategory acepta una categoría correcta y rechaza cada campo inválido', () => {
  const ok = { name: 'Mascotas', icon: '🐶', color: '#16a34a', monthly_budget: null };
  const others = ['Comida', 'Bajón'];
  assert.equal(validateCategory(ok, others), '');
  assert.equal(validateCategory({ ...ok, monthly_budget: 30_000 }, others), '');
  assert.match(validateCategory({ ...ok, name: '   ' }, others), /nombre/);
  assert.match(validateCategory({ ...ok, name: 'x'.repeat(41) }, others), /nombre/);
  assert.match(validateCategory({ ...ok, name: ' bajón ' }, others), /Ya tienes/);
  assert.match(validateCategory({ ...ok, icon: '🐶'.repeat(9) }, others), /emoji/);
  assert.match(validateCategory({ ...ok, color: 'rojo' }, others), /color/);
  assert.match(validateCategory({ ...ok, monthly_budget: 0 }, others), /presupuesto/);
});
