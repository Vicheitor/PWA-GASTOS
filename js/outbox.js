// Cola de cambios pendientes (modo sin conexión). Funciones puras: sin DOM, red ni almacenamiento.
// Operación: { opId, type: 'save', row, isNew } | { opId, type: 'delete', id }.

const targetId = (op) => (op.type === 'save' ? op.row.id : op.id);

// Agrega op combinándola con lo pendiente del mismo gasto, para enviar solo lo necesario.
export function queueOp(ops, op) {
  const previous = ops.find((o) => targetId(o) === targetId(op));
  const rest = ops.filter((o) => o !== previous);
  if (op.type === 'save') return [...rest, { ...op, isNew: previous ? previous.isNew : op.isNew }];
  if (previous?.isNew) return rest; // se creó y se borró sin conexión: no hay nada que enviar
  return [...rest, op];
}

const byDateDesc = (a, b) =>
  (a.spent_on < b.spent_on ? 1 : a.spent_on > b.spent_on ? -1 : 0)
  || ((a.created_at ?? '') < (b.created_at ?? '') ? 1 : (a.created_at ?? '') > (b.created_at ?? '') ? -1 : 0);

// Aplica los pendientes a los gastos del rango [from, to) para mostrarlos; marca los no enviados.
export function applyPending(expenses, ops, [from, to]) {
  let result = expenses;
  for (const op of ops) {
    result = result.filter((e) => e.id !== targetId(op));
    if (op.type === 'save' && op.row.spent_on >= from && op.row.spent_on < to) {
      result = [...result, { ...op.row, pending: true }];
    }
  }
  return [...result].sort(byDateDesc);
}
