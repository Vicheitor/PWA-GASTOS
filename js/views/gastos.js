// Vista de gastos: lista del mes agrupada por día, filtros y formulario de alta/edición.
import { deleteExpense, errorMessage, listExpenses, saveExpense } from '../api.js';
import { filterExpenses, groupByDay, isEditable, sumAmounts, validateExpense } from '../calc.js';
import { addMonths, dayLabel, formatCLP, formatThousands, monthLabel, monthRange, parseAmount, todayISO } from '../format.js';
import { $, h, toast } from '../dom.js';

const FALLBACK_COLOR = '#64748b';
const MAX_AMOUNT_DIGITS = 9;

let state = {
  month: todayISO().slice(0, 7),
  expenses: [],
  categories: [],
  filter: { categoryId: '', query: '' },
  loading: false,
};
let editing = null;
let loadSeq = 0;

const categoryMap = () => new Map(state.categories.map((c) => [c.id, c]));
const catLabel = (c) => (c.icon ? `${c.icon} ${c.name}` : c.name);

// ---------- Datos ----------

export async function refresh() {
  const seq = ++loadSeq;
  state = { ...state, loading: true };
  try {
    const expenses = await listExpenses(...monthRange(state.month));
    if (seq === loadSeq) state = { ...state, expenses };
  } catch (err) {
    if (seq === loadSeq) toast(errorMessage(err));
  } finally {
    if (seq === loadSeq) {
      state = { ...state, loading: false };
      render();
    }
  }
}

function changeMonth(delta) {
  state = { ...state, month: addMonths(state.month, delta), expenses: [] };
  render();
  refresh();
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
    h('span', { class: 'item-amount' }, formatCLP(expense.amount))));
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

  $('#month-label').textContent = monthLabel(state.month);
  $('#total-label').textContent = filtering ? 'Total filtrado' : 'Total del mes';
  $('#month-total').textContent = formatCLP(sumAmounts(visible));
  $('#month-count').textContent = visible.length === 1 ? '1 gasto' : `${visible.length} gastos`;
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

// Muestra el error dentro del formulario: el diálogo sigue abierto y no se pierde lo escrito.
async function withBusy(button, action) {
  button.disabled = true;
  try {
    await action();
  } catch (err) {
    $('#f-error').textContent = errorMessage(err);
  } finally {
    button.disabled = false;
  }
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
  };
  const error = validateExpense(row, new Set(state.categories.map((c) => c.id)));
  $('#f-error').textContent = error;
  if (error) return;
  await withBusy($('#f-save'), async () => {
    await saveExpense(row);
    $('#expense-dialog').close();
    toast(editing ? 'Gasto actualizado' : 'Gasto guardado');
    await refresh();
  });
}

async function onDelete() {
  if (!editing || !confirm('¿Eliminar este gasto?')) return;
  const { id } = editing;
  await withBusy($('#f-delete'), async () => {
    await deleteExpense(id);
    $('#expense-dialog').close();
    toast('Gasto eliminado');
    await refresh();
  });
}

// Formatea con puntos de miles mientras se escribe.
function onAmountInput(ev) {
  const digits = ev.target.value.replace(/\D/g, '').slice(0, MAX_AMOUNT_DIGITS);
  ev.target.value = digits ? formatThousands(Number(digits)) : '';
}

// ---------- Montaje (una vez por carga de página) ----------

export function mountExpenses(categories) {
  state = { ...state, categories };
  renderCategoryControls();
  $('#month-prev').addEventListener('click', () => changeMonth(-1));
  $('#month-next').addEventListener('click', () => changeMonth(1));
  $('#filter-cat').addEventListener('change', (e) => setFilter({ categoryId: e.target.value }));
  $('#filter-q').addEventListener('input', (e) => setFilter({ query: e.target.value }));
  $('#add').addEventListener('click', () => openForm());
  $('#f-cancel').addEventListener('click', () => $('#expense-dialog').close());
  $('#f-delete').addEventListener('click', onDelete);
  $('#f-amount').addEventListener('input', onAmountInput);
  $('#expense-form').addEventListener('submit', onSubmit);
  render();
  return refresh();
}
