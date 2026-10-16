// Vista de gastos: lista del mes agrupada por día, filtros y formulario de alta/edición.
import { errorMessage } from '../api.js';
import { submitChange } from '../offline.js';
import { budgetReport, filterExpenses, groupByDay, isEditable, sumAmounts, validateExpense } from '../calc.js';
import { dayLabel, formatCLP, formatThousands, parseAmount, todayISO } from '../format.js';
import { $, bindAmountInput, h, toast, withBusy } from '../dom.js';
import { budgetAlertText } from './budget.js';

const FALLBACK_COLOR = '#64748b';

let state = {
  expenses: [],
  categories: [],
  filter: { categoryId: '', query: '' },
  loading: true,
};
let editing = null;
let onChange = async () => {}; // recarga los datos (la define app.js)

const categoryMap = () => new Map(state.categories.map((c) => [c.id, c]));
const catLabel = (c) => (c.icon ? `${c.icon} ${c.name}` : c.name);

// ---------- Datos ----------

// expenses = null mientras carga.
export function showExpenses(expenses) {
  state = { ...state, expenses: expenses ?? [], loading: expenses === null };
  render();
}

// Las categorías se recargan con cada actualización; los botones del formulario solo se
// redibujan si cambiaron (así no se pierde la selección si el formulario está abierto).
export function setCategories(categories) {
  if (JSON.stringify(categories) === JSON.stringify(state.categories)) return;
  state = { ...state, categories };
  renderCategoryControls();
  render();
}

function setFilter(patch) {
  state = { ...state, filter: { ...state.filter, ...patch } };
  render();
}

// ---------- Render ----------

function renderItem(expense, categories) {
  const cat = categories.get(expense.category_id);
  return h('li', {},
    h('button', {
      class: 'item', type: 'button',
      style: `--cat:${cat?.color ?? FALLBACK_COLOR}`,
      onclick: () => openForm(expense),
    },
    h('span', { class: 'cat-icon', 'aria-hidden': 'true' }, cat?.icon ?? '•'),
    h('span', { class: 'item-main' },
      h('span', { class: 'item-cat' }, cat?.name ?? 'Sin categoría'),
      expense.note ? h('span', { class: 'item-note' }, expense.note) : null),
    h('span', { class: 'item-amount' },
      expense.pending ? h('span', { class: 'pending', title: 'Pendiente de enviar' }, '⏳ ') : null,
      formatCLP(expense.amount),
      expense.pending ? h('span', { class: 'sr-only' }, ' (pendiente de enviar)') : null)));
}

function renderDay(day, categories, today) {
  return h('section', { class: 'day' },
    h('h2', { class: 'day-head' }, h('span', {}, dayLabel(day.date, today)), h('span', {}, formatCLP(day.total))),
    h('ul', { class: 'items' }, ...day.items.map((e) => renderItem(e, categories))));
}

function emptyMessage(filtering) {
  if (state.loading) return 'Cargando…';
  return filtering ? 'Ningún gasto coincide con el filtro.' : 'Sin gastos este mes. Toca + para agregar.';
}

function render() {
  const { categoryId, query } = state.filter;
  const filtering = Boolean(categoryId || query.trim());
  const visible = filterExpenses(state.expenses, state.filter);
  const days = groupByDay(visible);
  const categories = categoryMap();
  const today = todayISO();

  $('#total-label').textContent = filtering ? 'Total filtrado' : 'Total del mes';
  $('#month-total').textContent = formatCLP(sumAmounts(visible));
  $('#month-count').textContent = visible.length === 1 ? '1 gasto' : `${visible.length} gastos`;
  const alerts = budgetReport(state.categories, state.expenses).filter((r) => r.level !== 'ok');
  $('#budget-alerts').replaceChildren(...alerts.map((r) =>
    h('p', { class: `alert ${r.level}` }, budgetAlertText(r))));
  $('#expense-list').setAttribute('aria-busy', String(state.loading));
  $('#expense-list').replaceChildren(...(days.length
    ? days.map((d) => renderDay(d, categories, today))
    : [h('p', { class: 'empty' }, emptyMessage(filtering))]));
}

function renderCategoryControls() {
  const select = $('#filter-cat');
  const stillExists = state.categories.some((c) => c.id === state.filter.categoryId);
  if (!stillExists) state = { ...state, filter: { ...state.filter, categoryId: '' } };
  select.replaceChildren(
    h('option', { value: '' }, 'Todas'),
    ...state.categories.map((c) => h('option', { value: c.id }, catLabel(c))));
  select.value = state.filter.categoryId;

  $('#f-cats').replaceChildren(...state.categories.map((c) =>
    h('label', { class: 'chip', style: `--cat:${c.color}` },
      h('input', { type: 'radio', name: 'category', value: c.id }),
      h('span', {}, h('span', { class: 'chip-icon', 'aria-hidden': 'true' }, c.icon ?? ''), c.name))));
}

// ---------- Formulario ----------

function openForm(expense = null) {
  editing = expense;
  const locked = Boolean(expense) && !isEditable(expense);
  const form = $('#expense-form');
  form.reset();
  $('#form-title').textContent = !expense ? 'Nuevo gasto' : locked ? 'Detalle del gasto' : 'Editar gasto';
  $('#f-locked').hidden = !locked;
  $('#f-fields').disabled = locked;
  $('#f-save').hidden = locked;
  $('#f-delete').hidden = !expense || locked;
  $('#f-cancel').textContent = locked ? 'Cerrar' : 'Cancelar';
  $('#f-error').textContent = '';
  form.amount.value = expense ? formatThousands(expense.amount) : '';
  form.spent_on.value = expense?.spent_on ?? todayISO();
  form.note.value = expense?.note ?? '';
  for (const radio of form.querySelectorAll('input[name="category"]')) {
    radio.checked = radio.value === expense?.category_id;
  }
  $('#expense-dialog').showModal();
  if (!locked) form.amount.focus();
}

async function onSubmit(ev) {
  ev.preventDefault();
  if ($('#f-fields').disabled) return;
  const form = ev.currentTarget;
  const row = {
    id: editing?.id ?? crypto.randomUUID(),
    amount: parseAmount(form.amount.value),
    category_id: form.querySelector('input[name="category"]:checked')?.value ?? '',
    spent_on: form.spent_on.value,
    note: form.note.value.trim() || null,
    created_at: editing?.created_at ?? new Date().toISOString(), // para mostrarlo mientras está pendiente
  };
  const error = validateExpense(row, new Set(state.categories.map((c) => c.id)));
  $('#f-error').textContent = error;
  if (error) return;
  await withBusy($('#f-save'), $('#f-error'), async () => {
    const pending = await submitChange({ type: 'save', row, isNew: !editing });
    $('#expense-dialog').close();
    if (pending) toast('Guardado sin conexión: se enviará al volver internet.');
    else toast(editing ? 'Gasto actualizado' : 'Gasto guardado');
    await onChange();
  }, errorMessage);
}

async function onDelete() {
  if (!editing || !confirm('¿Eliminar este gasto?')) return;
  const { id } = editing;
  await withBusy($('#f-delete'), $('#f-error'), async () => {
    const pending = await submitChange({ type: 'delete', id });
    $('#expense-dialog').close();
    toast(pending ? 'Eliminado sin conexión: se enviará al volver internet.' : 'Gasto eliminado');
    await onChange();
  }, errorMessage);
}

export const openNewExpense = () => openForm();

// ---------- Montaje (una vez por carga de página) ----------

export function mountExpenses({ categories, onDataChange }) {
  state = { ...state, categories };
  onChange = onDataChange;
  renderCategoryControls();
  $('#filter-cat').addEventListener('change', (e) => setFilter({ categoryId: e.target.value }));
  $('#filter-q').addEventListener('input', (e) => setFilter({ query: e.target.value }));
  $('#add').addEventListener('click', () => openForm());
  $('#f-cancel').addEventListener('click', () => $('#expense-dialog').close());
  $('#f-delete').addEventListener('click', onDelete);
  bindAmountInput($('#f-amount'));
  $('#expense-form').addEventListener('submit', onSubmit);
  render();
}
