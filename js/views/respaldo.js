// Respaldo CSV (en Ajustes): exportar todos los gastos e importar desde un archivo con vista previa.
import { createCategories, errorMessage, insertExpenses, listCategories, listExpenses } from '../api.js';
import { parseCsvDate, planImport, readExpensesCsv, toCsv } from '../csv.js';
import { addDays, MAX_DATE, MIN_DATE, todayISO } from '../format.js';
import { $, h, toast, withBusy } from '../dom.js';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ERRORS_SHOWN = 5;
const NEW_CATEGORY = { icon: '🏷️', color: '#64748b' };
const ALL_DATES = [MIN_DATE, addDays(MAX_DATE, 1)];

let pending = null; // importación revisada, esperando confirmación
let onChange = async () => {}; // recarga los datos (la define app.js)

// ---------- Exportar ----------

function download(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = h('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function onExport() {
  $('#csv-error').textContent = '';
  await withBusy($('#csv-export'), $('#csv-error'), async () => {
    const [categories, expenses] = await Promise.all([listCategories(), listExpenses(...ALL_DATES)]);
    if (!expenses.length) {
      toast('Aún no tienes gastos para exportar.');
      return;
    }
    download(toCsv(expenses, new Map(categories.map((c) => [c.id, c.name]))), `gastos-${todayISO()}.csv`);
    toast(`Exportaste ${expenses.length} ${expenses.length === 1 ? 'gasto' : 'gastos'}.`);
  }, errorMessage);
}

// ---------- Importar ----------

function hidePreview() {
  const hadFocus = $('#csv-preview').contains(document.activeElement);
  pending = null;
  $('#csv-preview').hidden = true;
  if (hadFocus) $('#csv-import').focus();
}

function showPreview({ toInsert, newCategories, errors, duplicates }) {
  const lines = [
    toInsert.length
      ? `${toInsert.length} ${toInsert.length === 1 ? 'gasto listo' : 'gastos listos'} para importar.`
      : 'No hay gastos nuevos para importar.',
    newCategories.length ? `Se crearán estas categorías: ${newCategories.join(', ')}.` : '',
    duplicates ? `${duplicates} ${duplicates === 1 ? 'ya estaba guardado y se omitirá' : 'ya estaban guardados y se omitirán'}.` : '',
    errors.length
      ? `${errors.length} ${errors.length === 1 ? 'fila tiene errores y no se importará' : 'filas tienen errores y no se importarán'}:`
      : '',
  ].filter(Boolean);
  const shown = errors.slice(0, MAX_ERRORS_SHOWN).map((e) => h('li', {}, `Fila ${e.line}: ${e.message}`));
  const more = errors.length - shown.length;
  $('#csv-summary').replaceChildren(...lines.map((text) => h('p', {}, text)));
  $('#csv-errors').replaceChildren(...shown, ...(more > 0 ? [h('li', {}, `…y ${more} más.`)] : []));
  $('#csv-confirm').hidden = !toInsert.length;
  $('#csv-confirm').textContent = `Importar ${toInsert.length}`;
  $('#csv-preview').hidden = false;
  (toInsert.length ? $('#csv-confirm') : $('#csv-preview')).focus();
}

async function onFile(ev) {
  const file = ev.target.files[0];
  ev.target.value = ''; // permite volver a elegir el mismo archivo
  hidePreview();
  $('#csv-error').textContent = '';
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    $('#csv-error').textContent = 'El archivo es demasiado grande (máximo 2 MB).';
    return;
  }
  await withBusy($('#csv-import'), $('#csv-error'), async () => {
    const read = readExpensesCsv(await file.text());
    if (read.error) {
      $('#csv-error').textContent = read.error;
      return;
    }
    // Gastos ya guardados en las fechas del archivo, para no duplicar si se importa dos veces.
    const dates = read.records.map((r) => parseCsvDate(r.fecha)).filter(Boolean).sort();
    const [categories, saved] = await Promise.all([
      listCategories(),
      dates.length ? listExpenses(dates[0], addDays(dates.at(-1), 1)) : [],
    ]);
    const names = new Map(categories.map((c) => [c.id, c.name]));
    const existing = saved.map((e) => ({ ...e, categoryName: names.get(e.category_id) ?? '' }));
    pending = planImport(read.records, categories, existing);
    showPreview(pending);
  }, errorMessage);
}

async function onConfirm() {
  const plan = pending;
  if (!plan?.toInsert.length) return;
  await withBusy($('#csv-confirm'), $('#csv-error'), async () => {
    if (plan.newCategories.length) {
      await createCategories(plan.newCategories.map((name) => ({ name, ...NEW_CATEGORY })));
    }
    const idByName = new Map((await listCategories()).map((c) => [c.name, c.id]));
    const rows = plan.toInsert.map(({ spent_on, categoryName, amount, note }) => ({
      id: crypto.randomUUID(),
      category_id: idByName.get(categoryName),
      spent_on,
      amount,
      note,
    }));
    await insertExpenses(rows);
    hidePreview();
    toast(`Importaste ${rows.length} ${rows.length === 1 ? 'gasto' : 'gastos'}.`);
    await onChange();
  }, (err) => {
    // Pudo guardarse una parte: se vuelve a revisar el archivo para no duplicar esa parte.
    hidePreview();
    return `${errorMessage(err)} Vuelve a elegir el archivo: lo que alcanzó a guardarse se omitirá.`;
  });
}

// ---------- Montaje (una vez por carga de página) ----------

export function mountBackup({ onDataChange }) {
  onChange = onDataChange;
  $('#csv-export').addEventListener('click', onExport);
  $('#csv-import').addEventListener('click', () => $('#csv-file').click());
  $('#csv-file').addEventListener('change', onFile);
  $('#csv-confirm').addEventListener('click', onConfirm);
  $('#csv-cancel').addEventListener('click', hidePreview);
}
