// CSV de gastos con columnas fecha, categoria, monto, nota. Funciones puras: sin DOM ni red.
import { isValidAmount, isValidISODate } from './format.js';

// Excel en español (Chile) separa columnas con punto y coma; al importar se detecta solo.
export const CSV_DELIMITER = ';';
export const MAX_IMPORT_ROWS = 5000;
const COLUMNS = ['fecha', 'categoria', 'monto', 'nota'];
const MAX_NOTE = 200;
const MAX_CATEGORY_NAME = 40;
const FORMULA_START = /^[=+\-@\t\r]/;

const normalize = (s) => s.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// ---------- Exportar ----------

function escapeField(value, delimiter) {
  let text = String(value ?? '');
  // Un texto que empieza con = + - @ se abriría como fórmula en Excel (inyección CSV).
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
}

// categoryNames: Map id → nombre. Incluye BOM para que Excel lea bien las tildes.
export function toCsv(expenses, categoryNames, delimiter = CSV_DELIMITER) {
  const sorted = [...expenses].sort((a, b) => (a.spent_on < b.spent_on ? -1 : a.spent_on > b.spent_on ? 1 : 0));
  const lines = [
    COLUMNS.join(delimiter),
    ...sorted.map((e) => [e.spent_on, categoryNames.get(e.category_id) ?? 'Sin categoría', e.amount, e.note ?? '']
      .map((v) => escapeField(v, delimiter)).join(delimiter)),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}

// ---------- Leer ----------

function detectDelimiter(text) {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length - 1]);
  const [best, count] = counts.sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? best : ',';
}

// Filas de campos (RFC 4180: comillas, "" escapadas, saltos de línea dentro de comillas).
export function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) rows.push([...row, field]);
  return rows;
}

// { records: [{ line, fecha, categoria, monto, nota }] } o { error }. line = fila del archivo (1 = encabezado).
export function readExpensesCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const [header = [], ...body] = parseCsv(clean, detectDelimiter(clean));
  const cols = header.map(normalize);
  const at = Object.fromEntries(COLUMNS.map((c) => [c, cols.indexOf(c)]));
  if (at.fecha < 0 || at.categoria < 0 || at.monto < 0) {
    return { error: 'El archivo debe tener en la primera fila las columnas fecha, categoria y monto (nota es opcional).' };
  }
  const records = body
    .map((fields, i) => ({
      line: i + 2,
      fecha: fields[at.fecha] ?? '',
      categoria: fields[at.categoria] ?? '',
      monto: fields[at.monto] ?? '',
      nota: at.nota >= 0 ? fields[at.nota] ?? '' : '',
    }))
    .filter((r) => [r.fecha, r.categoria, r.monto, r.nota].some((f) => f.trim() !== ''));
  if (records.length > MAX_IMPORT_ROWS) return { error: `Máximo ${MAX_IMPORT_ROWS} gastos por archivo.` };
  return { records };
}

// 'YYYY-MM-DD', 'DD-MM-YYYY' o 'DD/MM/YYYY' → 'YYYY-MM-DD'; null si no es una fecha válida.
export function parseCsvDate(text) {
  const t = text.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const cl = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : cl ? [cl[3], cl[2], cl[1]] : [];
  if (!y) return null;
  const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isValidISODate(date) ? date : null;
}

// '12345', '12.345' o '$ 12.345' → 12345. Con decimales es null (el peso chileno no usa decimales).
export function parseCsvAmount(text) {
  const t = text.trim().replace(/[$\s]/g, '');
  if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(t)) return null;
  const n = Number(t.replace(/\./g, ''));
  return isValidAmount(n) ? n : null;
}

// ---------- Planificar la importación ----------

const expenseKey = (date, category, amount, note) => `${date}|${normalize(category)}|${amount}|${note ?? ''}`;

function rowProblem(record, { spent_on, amount, categoryName, note }) {
  if (!spent_on) return `fecha inválida ("${record.fecha.trim()}")`;
  if (amount === null) return `monto inválido ("${record.monto.trim()}")`;
  if (!categoryName || [...categoryName].length > MAX_CATEGORY_NAME) return 'categoría vacía o muy larga';
  if (note && note.length > MAX_NOTE) return `nota de más de ${MAX_NOTE} caracteres`;
  return '';
}

// categories: las del usuario; existing: gastos ya guardados en esas fechas con su nombre de categoría
// ({ spent_on, categoryName, amount, note }). Un gasto idéntico a uno existente se omite (reimportar
// el mismo archivo no duplica), contando repeticiones: si el archivo tiene 2 iguales y hay 1, entra 1.
export function planImport(records, categories, existing) {
  const known = new Map(categories.map((c) => [normalize(c.name), c.name]));
  const newCategories = new Map();
  const seen = new Map();
  for (const e of existing) {
    const key = expenseKey(e.spent_on, e.categoryName, e.amount, e.note);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const toInsert = [];
  const errors = [];
  let duplicates = 0;

  for (const r of records) {
    const spent_on = parseCsvDate(r.fecha);
    const amount = parseCsvAmount(r.monto);
    const rawName = r.categoria.trim();
    const note = r.nota.trim().replace(/^'(?=[=+\-@])/, '') || null; // quita el ' que agrega la exportación
    const problem = rowProblem(r, { spent_on, amount, categoryName: rawName, note });
    if (problem) {
      errors.push({ line: r.line, message: problem });
      continue;
    }
    const key = expenseKey(spent_on, rawName, amount, note);
    if (seen.get(key) > 0) {
      seen.set(key, seen.get(key) - 1);
      duplicates++;
      continue;
    }
    const categoryKey = normalize(rawName);
    if (!known.has(categoryKey) && !newCategories.has(categoryKey)) newCategories.set(categoryKey, rawName);
    toInsert.push({ spent_on, categoryName: known.get(categoryKey) ?? newCategories.get(categoryKey), amount, note });
  }
  return { toInsert, newCategories: [...newCategories.values()], errors, duplicates };
}
