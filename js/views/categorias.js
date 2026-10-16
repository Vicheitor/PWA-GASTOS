// Vista de categorías: lista con el gasto del mes y su presupuesto; crear, editar y eliminar.
import { deleteCategory, errorMessage, saveCategory } from '../api.js';
import { budgetStatus, totalsByCategory, validateCategory } from '../calc.js';
import { formatCLP, formatThousands, parseAmount } from '../format.js';
import { $, bindAmountInput, h, toast, withBusy } from '../dom.js';
import { budgetBadge, budgetBar, budgetDetail } from './budget.js';

const DEFAULT_COLOR = '#64748b';

let state = { categories: [], expenses: [] };
let editing = null;
let onChange = async () => {}; // recarga los datos (la define app.js)

const label = (c) => `${c.icon ?? ''} ${c.name}`.trim();

// ---------- Lista ----------

function renderCategory(category, spent) {
  const status = budgetStatus(spent, category.monthly_budget);
  return h('li', {},
    h('button', { type: 'button', class: 'cat-card', style: `--cat:${category.color}`, onclick: () => openForm(category) },
      h('span', { class: 'cat-icon', 'aria-hidden': 'true' }, category.icon ?? '•'),
      h('span', { class: 'cat-card-main' },
        h('span', { class: 'cat-card-top' },
          h('span', { class: 'item-cat' }, category.name),
          status ? budgetBadge(status) : null),
        h('span', { class: 'item-note' },
          status ? budgetDetail(status) : `${formatCLP(spent)} este mes · sin presupuesto`),
        status ? budgetBar(status) : null)));
}

function render() {
  const spentBy = new Map(totalsByCategory(state.expenses).map((r) => [r.category_id, r.total]));
  $('#cat-list').replaceChildren(...state.categories.map((c) => renderCategory(c, spentBy.get(c.id) ?? 0)));
}

export function showCategories({ categories, expenses }) {
  state = { categories, expenses };
  render();
}

// ---------- Formulario ----------

function openForm(category = null) {
  editing = category;
  const others = state.categories.filter((c) => c.id !== category?.id);
  $('#c-title').textContent = category ? 'Editar categoría' : 'Nueva categoría';
  $('#c-name').value = category?.name ?? '';
  $('#c-icon').value = category?.icon ?? '';
  $('#c-color').value = category?.color ?? DEFAULT_COLOR;
  $('#c-budget').value = category?.monthly_budget ? formatThousands(category.monthly_budget) : '';
  $('#c-error').textContent = '';
  $('#c-delete').hidden = !category;
  $('#c-move-wrap').hidden = !category || !others.length;
  $('#c-move').replaceChildren(...others.map((c) => h('option', { value: c.id }, label(c))));
  const fallback = others.find((c) => c.name === 'Otros');
  if (fallback) $('#c-move').value = fallback.id;
  $('#category-dialog').showModal();
  if (!category) $('#c-name').focus();
}

const closeForm = () => $('#category-dialog').close();

async function onSubmit(ev) {
  ev.preventDefault();
  const budget = parseAmount($('#c-budget').value);
  const row = {
    id: editing?.id,
    name: $('#c-name').value,
    icon: $('#c-icon').value.trim(),
    color: $('#c-color').value,
    monthly_budget: Number.isNaN(budget) ? null : budget,
  };
  const otherNames = state.categories.filter((c) => c.id !== editing?.id).map((c) => c.name);
  const invalid = validateCategory(row, otherNames);
  $('#c-error').textContent = invalid?.message ?? '';
  if (invalid) {
    $(`#c-${invalid.field}`).focus();
    return;
  }
  await withBusy($('#c-save'), $('#c-error'), async () => {
    await saveCategory(row);
    closeForm();
    toast(editing ? 'Categoría actualizada' : 'Categoría creada');
    await onChange();
    $('#cat-add').focus(); // la tarjeta que abrió el formulario se redibujó
  }, errorMessage);
}

async function onDelete() {
  if (!editing) return;
  const { id, name } = editing;
  const target = state.categories.find((c) => c.id === $('#c-move').value && c.id !== id);
  const question = target
    ? `¿Eliminar "${name}"? Sus gastos (de todos los meses) pasarán a "${target.name}".`
    : `¿Eliminar "${name}"?`;
  if (!confirm(question)) return;
  await withBusy($('#c-delete'), $('#c-error'), async () => {
    await deleteCategory(id, target?.id);
    closeForm();
    toast('Categoría eliminada');
    await onChange();
    $('#cat-add').focus();
  }, errorMessage);
}

// ---------- Montaje (una vez por carga de página) ----------

export function mountCategories({ onDataChange }) {
  onChange = onDataChange;
  $('#cat-add').addEventListener('click', () => openForm());
  $('#c-cancel').addEventListener('click', closeForm);
  $('#c-delete').addEventListener('click', onDelete);
  $('#category-form').addEventListener('submit', onSubmit);
  bindAmountInput($('#c-budget'));
}
