// Modo sin conexión: copia local de los datos de cada mes y cola de cambios que se envía a
// Supabase en orden. Todo cambio pasa por la cola: con internet sale al instante; sin internet
// queda pendiente y se envía al volver la conexión. Se guarda en localStorage (son pocos datos).
import { deleteExpense, isPermanentError, saveExpense } from './api.js';
import { applyPending, queueOp } from './outbox.js';

const MAX_SNAPSHOTS = 13; // meses guardados para ver sin conexión

let userId = null;
let chain = Promise.resolve([]);
let inFlightOpId = null;
let reportFailures = () => {};

const snapshotKey = () => `gastos.snapshots.v1:${userId}`;
const outboxKey = () => `gastos.outbox.v1:${userId}`;

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function initOffline(id, { onSyncFailures }) {
  userId = id;
  reportFailures = onSyncFailures;
}

// ---------- Copia local ----------

export function saveSnapshot(month, { categories, expenses, previous, monthly }) {
  const stored = read(snapshotKey(), { months: {} });
  const entry = { expenses, previous, monthly, savedAt: Date.now() };
  const months = { ...stored.months, [month]: entry };
  const newest = Object.entries(months).sort((a, b) => b[1].savedAt - a[1].savedAt).slice(0, MAX_SNAPSHOTS);
  // Si no cabe, se queda solo con el mes actual (el espacio es más importante para los pendientes).
  if (!write(snapshotKey(), { categories, months: Object.fromEntries(newest) })) {
    write(snapshotKey(), { categories, months: { [month]: entry } });
  }
}

// { categories, month } guardados; cada uno puede ser null si nunca se cargó con internet.
export function loadSnapshot(month) {
  const stored = read(snapshotKey(), { months: {} });
  return { categories: stored.categories ?? null, month: stored.months?.[month] ?? null };
}

// ---------- Cola de cambios ----------

export const pendingOps = () => read(outboxKey(), []);

export function withPending(expenses, range) {
  return applyPending(expenses, pendingOps(), range);
}

async function send(op) {
  if (op.type === 'save') await saveExpense(op.row);
  else await deleteExpense(op.id);
}

const isQueued = (opId) => pendingOps().some((o) => o.opId === opId);

// Envía la cola en orden. Si Supabase rechaza un cambio de forma definitiva (p. ej. pasaron las
// 12 h), lo saca de la cola y lo informa para no trabar los demás. Ante cualquier otro error
// (sin conexión, servidor caído) se detiene y deja todo para el próximo intento.
async function flush() {
  const failed = [];
  for (const op of pendingOps()) {
    if (!isQueued(op.opId)) continue; // se canceló mientras se enviaban las anteriores
    inFlightOpId = op.opId;
    try {
      await send(op);
    } catch (err) {
      if (!isPermanentError(err)) break;
      failed.push({ op, err });
    } finally {
      inFlightOpId = null;
    }
    write(outboxKey(), pendingOps().filter((o) => o.opId !== op.opId));
  }
  return failed;
}

// Los envíos van uno tras otro, nunca en paralelo (el orden importa).
const flushInOrder = () => (chain = chain.then(flush, flush));

export async function syncPending() {
  const failed = await flushInOrder();
  if (failed.length) reportFailures(failed);
}

// Encola un cambio y trata de enviarlo. Devuelve true si quedó pendiente (sin conexión).
// Si Supabase lo rechaza, lanza el error para mostrarlo en el formulario.
export async function submitChange(change) {
  const op = { ...change, opId: crypto.randomUUID() };
  if (!write(outboxKey(), queueOp(pendingOps(), op, inFlightOpId))) {
    await send(op); // almacenamiento bloqueado (p. ej. modo privado): sin cola, directo
    return false;
  }
  const failed = await flushInOrder();
  const mine = failed.find((f) => f.op.opId === op.opId);
  const others = failed.filter((f) => f !== mine);
  if (others.length) reportFailures(others);
  if (mine) throw mine.err;
  return isQueued(op.opId);
}

// Al cerrar sesión: borra copias y pendientes de este dispositivo (y el correo recordado).
export function clearLocalData() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('gastos.snapshots.') || key.startsWith('gastos.outbox.') || key === 'gastos.email') {
        localStorage.removeItem(key);
      }
    }
  } catch { /* almacenamiento bloqueado: no hay nada guardado */ }
}
