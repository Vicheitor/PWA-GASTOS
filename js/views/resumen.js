// Vista de resumen: indicadores del mes, gasto por categoría y gráficos (Chart.js bajo demanda).
import { budgetReport, dailyTotals, elapsedDays, fillMonths, monthSummary, totalsByCategory } from '../calc.js';
import { addMonths, formatCLP, todayISO } from '../format.js';
import { $, h } from '../dom.js';
import { budgetBadge, budgetBar, budgetDetail } from './budget.js';

const CHART_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/auto/+esm';
const FALLBACK_COLOR = '#64748b';

const compact = new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
const shortMonth = new Intl.DateTimeFormat('es-CL', { month: 'short', timeZone: 'UTC' });
const longMonth = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthName = new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' });
const dayMonth = new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);

let chartLib = null;
const charts = {};
let lastData = null;
let renderSeq = 0;

// Chart.js se carga solo al necesitarlo; si falla (sin conexión) se reintenta la próxima vez.
function loadChart() {
  chartLib ??= import(CHART_URL).then((m) => m.default).catch((err) => {
    chartLib = null;
    throw err;
  });
  return chartLib;
}

// ---------- Indicadores ----------

function renderKpis(summary, count, month) {
  const { total, days, average, partial, comparison } = summary;
  $('#k-total').textContent = formatCLP(total);
  $('#k-total-note').textContent = count === 1 ? '1 gasto' : `${count} gastos`;
  $('#k-avg').textContent = days ? formatCLP(average) : '—';
  $('#k-avg-note').textContent = days ? `en ${days} ${days === 1 ? 'día' : 'días'}` : 'Mes que aún no empieza';

  const diffEl = $('#k-diff');
  const note = $('#k-diff-note');
  const prevName = monthName.format(toDate(`${addMonths(month, -1)}-01`));
  const period = partial ? `del 1 al ${days} de ${prevName}` : prevName;
  const { diff, pct } = comparison;
  if (!days) {
    diffEl.textContent = '—';
    diffEl.dataset.trend = 'flat';
    note.textContent = '';
    return;
  }
  const arrow = diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '';
  diffEl.replaceChildren(h('span', { 'aria-hidden': 'true' }, arrow), formatCLP(Math.abs(diff)));
  diffEl.dataset.trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  if (pct === null) note.textContent = `No hubo gastos ${partial ? period : `en ${period}`} para comparar.`;
  else if (diff === 0) note.textContent = `Igual que ${period}.`;
  else note.textContent = `${percent.format(Math.abs(pct))}% ${diff > 0 ? 'más' : 'menos'} que ${period}.`;
}

// ---------- Por categoría (barras HTML: nombre y monto siempre visibles) ----------

function renderCategories(expenses, categories) {
  const rows = totalsByCategory(expenses);
  if (!rows.length) {
    $('#cat-bars').replaceChildren(h('li', { class: 'empty' }, 'Sin gastos este mes.'));
    return;
  }
  $('#cat-bars').replaceChildren(...rows.map(({ category_id, total, share }) => {
    const cat = categories.get(category_id);
    return h('li', { style: `--cat:${cat?.color ?? FALLBACK_COLOR}` },
      h('div', { class: 'cat-row' },
        h('span', { class: 'cat-name' },
          h('span', { class: 'cat-icon sm', 'aria-hidden': 'true' }, cat?.icon ?? '•'),
          cat?.name ?? 'Sin categoría'),
        h('span', { class: 'cat-total' },
          formatCLP(total),
          h('span', { class: 'cat-pct' }, `${percent.format(share * 100)}%`))),
      h('div', { class: 'bar', 'aria-hidden': 'true' },
        h('span', { style: `width:${(share * 100).toFixed(1)}%` })));
  }));
}

// ---------- Presupuestos ----------

function renderBudgets(categories, expenses) {
  const report = budgetReport(categories, expenses);
  if (!report.length) {
    $('#budget-list').replaceChildren(h('li', { class: 'empty' },
      'Aún no tienes presupuestos. ', h('a', { href: '#categorias' }, 'Ponlos en Categorías'), '.'));
    return;
  }
  $('#budget-list').replaceChildren(...report.map((status) => {
    const { category } = status;
    return h('li', { style: `--cat:${category.color}` },
      h('div', { class: 'cat-row' },
        h('span', { class: 'cat-name' },
          h('span', { class: 'cat-icon sm', 'aria-hidden': 'true' }, category.icon ?? '•'),
          category.name),
        budgetBadge(status)),
      budgetBar(status),
      h('p', { class: 'budget-detail' }, budgetDetail(status)));
  }));
}

// ---------- Gráficos ----------

function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return { primary: v('--primary'), muted: v('--muted'), grid: v('--border') };
}

function baseOptions(colors, tooltipTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        callbacks: { title: tooltipTitle, label: (ctx) => formatCLP(ctx.parsed.y ?? 0) },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: colors.muted, maxRotation: 0, autoSkipPadding: 8 } },
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: colors.grid },
        ticks: { color: colors.muted, maxTicksLimit: 5, callback: (value) => `$${compact.format(value)}` },
      },
    },
  };
}

function replaceChart(key, canvas, config, Chart) {
  charts[key]?.destroy();
  charts[key] = new Chart(canvas, config);
}

function dailyConfig({ month, expenses }, colors) {
  const totals = dailyTotals(expenses, month);
  const elapsed = elapsedDays(month, todayISO());
  const dayIso = (i) => `${month}-${String(i + 1).padStart(2, '0')}`;
  return {
    type: 'line',
    data: {
      labels: totals.map((_, i) => String(i + 1)),
      // Los días que todavía no llegan quedan vacíos en vez de bajar a 0.
      datasets: [{
        data: totals.map((v, i) => (i < elapsed ? v : null)),
        borderColor: colors.primary,
        backgroundColor: colors.primary,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHitRadius: 14,
        tension: 0.25,
      }],
    },
    options: baseOptions(colors, (items) => dayMonth.format(toDate(dayIso(items[0].dataIndex)))),
  };
}

function monthsConfig({ month, monthly }, colors) {
  const months = fillMonths(monthly, month);
  return {
    type: 'bar',
    data: {
      labels: months.map((m) => shortMonth.format(toDate(`${m.month}-01`)).replace('.', '')),
      datasets: [{
        data: months.map((m) => m.total),
        // El mes elegido en color pleno, el resto atenuado (mismo tono).
        backgroundColor: months.map((m) => (m.month === month ? colors.primary : `${colors.primary}59`)),
        borderRadius: 4,
        borderSkipped: 'start',
        maxBarThickness: 28,
      }],
    },
    options: baseOptions(colors, (items) => longMonth.format(toDate(`${months[items[0].dataIndex].month}-01`))),
  };
}

function describeCharts({ month, expenses, monthly }) {
  const totals = dailyTotals(expenses, month);
  const max = Math.max(0, ...totals);
  const name = longMonth.format(toDate(`${month}-01`));
  $('#chart-daily').setAttribute('aria-label', max
    ? `Gasto diario de ${name}. Día más alto: ${totals.indexOf(max) + 1}, con ${formatCLP(max)}.`
    : `Gasto diario de ${name}: sin gastos.`);
  const months = fillMonths(monthly, month);
  $('#chart-months').setAttribute('aria-label',
    `Total de los últimos 12 meses: ${months.map((m) => `${shortMonth.format(toDate(`${m.month}-01`))} ${formatCLP(m.total)}`).join(', ')}.`);
}

async function renderCharts(data) {
  const seq = ++renderSeq;
  describeCharts(data);
  let Chart;
  try {
    Chart = await loadChart();
  } catch {
    for (const box of document.querySelectorAll('#view-resumen .chart-box')) box.dataset.error = 'Los gráficos necesitan conexión para cargarse.';
    return;
  }
  if (seq !== renderSeq) return; // llegaron datos más nuevos mientras se cargaba Chart.js
  for (const box of document.querySelectorAll('#view-resumen .chart-box')) delete box.dataset.error;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  const colors = themeColors();
  replaceChart('daily', $('#chart-daily'), dailyConfig(data, colors), Chart);
  replaceChart('months', $('#chart-months'), monthsConfig(data, colors), Chart);
}

// ---------- API de la vista ----------

// data = { month, expenses, previous, monthly, categories } o null mientras carga.
export function showSummary(data) {
  $('#view-resumen').setAttribute('aria-busy', String(data === null));
  if (!data) return;
  lastData = data;
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  renderKpis(monthSummary(data.expenses, data.previous, data.month, todayISO()), data.expenses.length, data.month);
  renderBudgets(data.categories, data.expenses);
  renderCategories(data.expenses, categories);
  renderCharts(data);
}

// Al mostrar la pestaña en móvil, ajustar los gráficos que se dibujaron ocultos.
export function resizeCharts() {
  for (const chart of Object.values(charts)) chart.resize();
}

// Colores de los gráficos al cambiar entre modo claro y oscuro.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (lastData) renderCharts(lastData);
});
