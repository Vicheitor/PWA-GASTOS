import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, addMonths, dayLabel, daysInMonth, formatCLP, monthLabel, isValidAmount, isValidISODate, monthRange, parseAmount, todayISO,
} from '../js/format.js';

test('formatCLP usa punto como separador de miles y sin decimales', () => {
  assert.equal(formatCLP(1234567).replace(/\s/g, ''), '$1.234.567');
  assert.equal(formatCLP(500).replace(/\s/g, ''), '$500');
});

test('parseAmount ignora puntos y símbolos', () => {
  assert.equal(parseAmount('$12.345'), 12345);
  assert.ok(Number.isNaN(parseAmount('')));
  assert.ok(Number.isNaN(parseAmount('abc')));
});

test('isValidAmount exige entero entre 1 y 100.000.000', () => {
  assert.ok(isValidAmount(1));
  assert.ok(isValidAmount(100_000_000));
  assert.ok(!isValidAmount(0));
  assert.ok(!isValidAmount(100_000_001));
  assert.ok(!isValidAmount(10.5));
  assert.ok(!isValidAmount(NaN));
});

test('isValidISODate rechaza fechas imposibles y fuera de rango', () => {
  assert.ok(isValidISODate('2024-02-29'));
  assert.ok(!isValidISODate('2023-02-29'));
  assert.ok(!isValidISODate('2026-13-01'));
  assert.ok(!isValidISODate('1999-12-31'));
  assert.ok(!isValidISODate('16-10-2026'));
  assert.ok(!isValidISODate(''));
});

test('todayISO usa la hora de Santiago, no la UTC', () => {
  // 02:00 UTC del 17-oct es todavía 16-oct en Chile (UTC-3 en horario de verano).
  assert.equal(todayISO(new Date('2026-10-17T02:00:00Z')), '2026-10-16');
});

test('addMonths cruza años en ambas direcciones', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-10', -12), '2025-10');
});

test('addDays cruza meses y años', () => {
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('dayLabel dice Hoy, Ayer o el día con mayúscula', () => {
  assert.equal(dayLabel('2026-10-16', '2026-10-16'), 'Hoy');
  assert.equal(dayLabel('2026-10-15', '2026-10-16'), 'Ayer');
  assert.match(dayLabel('2026-10-09', '2026-10-16'), /^Viernes, 9 oct/);
});

test('monthLabel con mayúscula inicial', () => {
  assert.equal(monthLabel('2026-10'), 'Octubre de 2026');
});

test('monthRange y daysInMonth', () => {
  assert.deepEqual(monthRange('2026-12'), ['2026-12-01', '2027-01-01']);
  assert.equal(daysInMonth('2024-02'), 29);
  assert.equal(daysInMonth('2026-02'), 28);
  assert.equal(daysInMonth('2026-10'), 31);
});
