import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parseCsvAmount, parseCsvDate, planImport, readExpensesCsv, toCsv } from '../js/csv.js';

const names = new Map([['c1', 'Comida'], ['c2', 'Bajón']]);

test('toCsv: encabezado, BOM, punto y coma y orden por fecha', () => {
  const csv = toCsv([
    { spent_on: '2026-10-16', category_id: 'c2', amount: 3500, note: 'Completo' },
    { spent_on: '2026-10-01', category_id: 'c1', amount: 32990, note: null },
  ], names);
  assert.equal(csv, '﻿fecha;categoria;monto;nota\r\n2026-10-01;Comida;32990;\r\n2026-10-16;Bajón;3500;Completo\r\n');
});

test('toCsv escapa comillas, separadores, saltos de línea y fórmulas', () => {
  const csv = toCsv([
    { spent_on: '2026-10-01', category_id: 'c1', amount: 1, note: 'dijo "hola"; chao\nfin' },
    { spent_on: '2026-10-02', category_id: 'c1', amount: 2, note: '=HYPERLINK("x")' },
  ], names);
  const lines = csv.split('\r\n');
  assert.equal(lines[1], '2026-10-01;Comida;1;"dijo ""hola""; chao\nfin"');
  assert.equal(lines[2], `2026-10-02;Comida;2;"'=HYPERLINK(""x"")"`);
});

test('parseCsv maneja comillas, "" y saltos de línea dentro de un campo', () => {
  assert.deepEqual(parseCsv('a;"b;c";"d ""e"""\r\n"x\ny";z', ';'), [['a', 'b;c', 'd "e"'], ['x\ny', 'z']]);
});

test('exportar y volver a leer conserva los datos (ida y vuelta)', () => {
  const original = [{ spent_on: '2026-10-05', category_id: 'c2', amount: 12345, note: 'papas; "grandes"' }];
  const { records } = readExpensesCsv(toCsv(original, names));
  assert.deepEqual(records, [{ line: 2, fecha: '2026-10-05', categoria: 'Bajón', monto: '12345', nota: 'papas; "grandes"' }]);
});

test('readExpensesCsv detecta coma, acepta columnas en otro orden y tildes en el encabezado', () => {
  const { records } = readExpensesCsv('Monto,Categoría,Fecha\n5000,Comida,16-10-2026\n\n');
  assert.deepEqual(records, [{ line: 2, fecha: '16-10-2026', categoria: 'Comida', monto: '5000', nota: '' }]);
});

test('readExpensesCsv sin columnas obligatorias da un error claro', () => {
  assert.match(readExpensesCsv('fecha;nota\n2026-10-01;x').error, /columnas/);
});

test('parseCsvDate acepta formato ISO y chileno, y rechaza fechas imposibles', () => {
  assert.equal(parseCsvDate('2026-10-16'), '2026-10-16');
  assert.equal(parseCsvDate('16-10-2026'), '2026-10-16');
  assert.equal(parseCsvDate('6/1/2026'), '2026-01-06');
  assert.equal(parseCsvDate('31-02-2026'), null);
  assert.equal(parseCsvDate('ayer'), null);
});

test('parseCsvAmount acepta puntos de miles y $, rechaza decimales y valores fuera de rango', () => {
  assert.equal(parseCsvAmount('12345'), 12345);
  assert.equal(parseCsvAmount('$ 12.345'), 12345);
  assert.equal(parseCsvAmount('1.234.567'), 1234567);
  assert.equal(parseCsvAmount('12,50'), null);
  assert.equal(parseCsvAmount('12.5'), null);
  assert.equal(parseCsvAmount('0'), null);
  assert.equal(parseCsvAmount('-500'), null);
});

test('planImport: categorías nuevas, errores por fila y duplicados contra lo existente', () => {
  const records = [
    { line: 2, fecha: '2026-10-01', categoria: 'comida', monto: '5.000', nota: 'Almuerzo' },
    { line: 3, fecha: '2026-10-01', categoria: 'Comida', monto: '5000', nota: 'Almuerzo' },
    { line: 4, fecha: '2026-10-02', categoria: 'Mascotas', monto: '9990', nota: '' },
    { line: 5, fecha: '2026-10-03', categoria: 'mascotas', monto: '1000', nota: "'=1+1" },
    { line: 6, fecha: '2026-13-01', categoria: 'Comida', monto: '100', nota: '' },
    { line: 7, fecha: '2026-10-04', categoria: 'Comida', monto: '10,5', nota: '' },
  ];
  const categories = [{ name: 'Comida' }, { name: 'Bajón' }];
  const existing = [{ spent_on: '2026-10-01', categoryName: 'Comida', amount: 5000, note: 'Almuerzo' }];
  const plan = planImport(records, categories, existing);
  assert.equal(plan.duplicates, 1); // solo una de las dos filas iguales ya existía
  assert.deepEqual(plan.newCategories, ['Mascotas']);
  assert.deepEqual(plan.toInsert, [
    { spent_on: '2026-10-01', categoryName: 'Comida', amount: 5000, note: 'Almuerzo' },
    { spent_on: '2026-10-02', categoryName: 'Mascotas', amount: 9990, note: null },
    { spent_on: '2026-10-03', categoryName: 'Mascotas', amount: 1000, note: '=1+1' },
  ]);
  assert.deepEqual(plan.errors.map((e) => e.line), [6, 7]);
});

test('una categoría que empieza con = sobrevive exportar e importar sin duplicarse', () => {
  const csv = toCsv([{ spent_on: '2026-10-01', category_id: 'x', amount: 100, note: null }], new Map([['x', '=Raro']]));
  const { records } = readExpensesCsv(csv);
  const plan = planImport(records, [{ name: '=Raro' }], [{ spent_on: '2026-10-01', categoryName: '=Raro', amount: 100, note: null }]);
  assert.equal(plan.duplicates, 1);
  assert.deepEqual(plan.newCategories, []);
});
