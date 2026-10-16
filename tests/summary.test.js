import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareTotals, dailyTotals, elapsedDays, fillMonths, monthSummary, sumUpToDay, totalsByCategory,
} from '../js/calc.js';

const e = (spent_on, amount, category_id = 'comida') => ({ spent_on, amount, category_id });

const october = [e('2026-10-01', 10000), e('2026-10-10', 5000, 'chatarra'), e('2026-10-16', 15000)];
const september = [e('2026-09-05', 8000), e('2026-09-16', 12000), e('2026-09-17', 50000), e('2026-09-30', 1000)];

test('elapsedDays: mes en curso hasta hoy, pasados completos, futuros 0', () => {
  assert.equal(elapsedDays('2026-10', '2026-10-16'), 16);
  assert.equal(elapsedDays('2026-09', '2026-10-16'), 30);
  assert.equal(elapsedDays('2024-02', '2026-10-16'), 29);
  assert.equal(elapsedDays('2026-11', '2026-10-16'), 0);
});

test('sumUpToDay incluye el día de corte', () => {
  assert.equal(sumUpToDay(september, 16), 20000);
  assert.equal(sumUpToDay(september, 31), 71000);
});

test('compareTotals en $ y %, y % nulo si el mes anterior fue 0', () => {
  assert.deepEqual(compareTotals(30000, 20000), { current: 30000, previous: 20000, diff: 10000, pct: 50 });
  assert.deepEqual(compareTotals(15000, 20000), { current: 15000, previous: 20000, diff: -5000, pct: -25 });
  assert.equal(compareTotals(5000, 0).pct, null);
});

test('monthSummary del mes en curso: promedio sobre días transcurridos y comparación del mismo periodo', () => {
  const s = monthSummary(october, september, '2026-10', '2026-10-16');
  assert.equal(s.total, 30000);
  assert.equal(s.days, 16);
  assert.equal(s.average, 1875); // 30.000 / 16
  assert.equal(s.partial, true);
  // 1–16 oct (30.000) vs 1–16 sep (20.000): no cuenta el gasto grande del 17 de septiembre
  assert.deepEqual(s.comparison, { current: 30000, previous: 20000, diff: 10000, pct: 50 });
});

test('monthSummary de un mes pasado compara meses completos', () => {
  const s = monthSummary(september, [e('2026-08-31', 71000)], '2026-09', '2026-10-16');
  assert.equal(s.average, Math.round(71000 / 30));
  assert.equal(s.partial, false);
  assert.equal(s.comparison.diff, 0);
  assert.equal(s.comparison.pct, 0);
});

test('monthSummary sin gastos no divide por cero', () => {
  const s = monthSummary([], [], '2026-11', '2026-10-16');
  assert.equal(s.average, 0);
  assert.equal(s.comparison.pct, null);
});

test('totalsByCategory ordena de mayor a menor con su proporción', () => {
  assert.deepEqual(totalsByCategory(october), [
    { category_id: 'comida', total: 25000, share: 25000 / 30000 },
    { category_id: 'chatarra', total: 5000, share: 5000 / 30000 },
  ]);
  assert.deepEqual(totalsByCategory([]), []);
});

test('dailyTotals tiene un valor por día del mes', () => {
  const days = dailyTotals(october, '2026-10');
  assert.equal(days.length, 31);
  assert.equal(days[0], 10000);
  assert.equal(days[15], 15000);
  assert.equal(days[30], 0);
});

test('fillMonths devuelve 12 meses terminando en el mes elegido, con 0 donde no hay datos', () => {
  const months = fillMonths([{ month: '2026-10-01', total: 30000 }, { month: '2025-12-01', total: '5000' }], '2026-10');
  assert.equal(months.length, 12);
  assert.deepEqual(months[0], { month: '2025-11', total: 0 });
  assert.deepEqual(months[1], { month: '2025-12', total: 5000 });
  assert.deepEqual(months[11], { month: '2026-10', total: 30000 });
});
