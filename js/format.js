// Formato chileno y fechas en America/Santiago.
// Fechas como 'YYYY-MM-DD' y meses como 'YYYY-MM' (strings, sin zona horaria).

const TZ = 'America/Santiago';
const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
const thousands = new Intl.NumberFormat('es-CL');
const isoInTz = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const monthFmt = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

// Mismos límites que los CHECK de supabase/schema.sql.
export const MAX_AMOUNT = 100_000_000;
export const MIN_DATE = '2000-01-01';
export const MAX_DATE = '2100-12-31';

export const formatCLP = (n) => clp.format(n);
export const formatThousands = (n) => thousands.format(n);
export const todayISO = (now = new Date()) => isoInTz.format(now);

export function parseAmount(text) {
  const digits = String(text ?? '').replace(/\D/g, '');
  return digits ? Number(digits) : NaN;
}

export const isValidAmount = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_AMOUNT;

export function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || s < MIN_DATE || s > MAX_DATE) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

// [primer día del mes, primer día del mes siguiente)
export const monthRange = (ym) => [`${ym}-01`, `${addMonths(ym, 1)}-01`];

export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "octubre de 2026" → "Octubre de 2026"
export const monthLabel = (ym) => capitalize(monthFmt.format(new Date(`${ym}-01T00:00:00Z`)));

// "Hoy", "Ayer" o "Jueves, 15 oct"
export function dayLabel(iso, today = todayISO()) {
  if (iso === today) return 'Hoy';
  if (iso === addDays(today, -1)) return 'Ayer';
  return capitalize(dayFmt.format(new Date(`${iso}T00:00:00Z`)));
}
