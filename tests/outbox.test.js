import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPending, queueOp } from '../js/outbox.js';

const row = (id, spent_on, amount, created_at = '2026-10-16T12:00:00Z') => ({ id, category_id: 'c1', spent_on, amount, note: null, created_at });
const save = (r, isNew, opId = r.id + '-op') => ({ opId, type: 'save', row: r, isNew });
const del = (id, opId = id + '-del') => ({ opId, type: 'delete', id });

test('queueOp: editar algo pendiente reemplaza la operación y conserva si era nuevo', () => {
  const ops = queueOp([], save(row('a', '2026-10-16', 1000), true));
  const updated = queueOp(ops, save(row('a', '2026-10-16', 2000), false));
  assert.equal(updated.length, 1);
  assert.equal(updated[0].row.amount, 2000);
  assert.equal(updated[0].isNew, true);
});

test('queueOp: crear y borrar sin conexión se anulan', () => {
  const ops = queueOp(queueOp([], save(row('a', '2026-10-16', 1000), true)), del('a'));
  assert.deepEqual(ops, []);
});

test('queueOp: borrar un gasto que ya estaba en el servidor queda como eliminación', () => {
  const ops = queueOp(queueOp([], save(row('a', '2026-10-16', 1000), false)), del('a'));
  assert.deepEqual(ops.map((o) => o.type), ['delete']);
});

test('queueOp: operaciones de distintos gastos mantienen su orden', () => {
  const ops = queueOp(queueOp([], save(row('a', '2026-10-16', 1), true)), del('b'));
  assert.deepEqual(ops.map((o) => o.opId), ['a-op', 'b-del']);
});

test('applyPending: agrega, reemplaza, elimina y marca pendientes; respeta el rango del mes', () => {
  const server = [row('x', '2026-10-10', 500, '2026-10-10T10:00:00Z'), row('y', '2026-10-05', 700, '2026-10-05T10:00:00Z')];
  const ops = [
    save(row('n', '2026-10-16', 3000), true),
    save({ ...row('x', '2026-10-10', 999), created_at: '2026-10-10T10:00:00Z' }, false),
    del('y'),
    save(row('z', '2026-09-30', 100), true), // de otro mes: no aparece
  ];
  const result = applyPending(server, ops, ['2026-10-01', '2026-11-01']);
  assert.deepEqual(result.map((e) => [e.id, e.amount, Boolean(e.pending)]), [['n', 3000, true], ['x', 999, true]]);
  assert.equal(server.length, 2); // no modifica la lista original
});

test('queueOp: no combina con la operación que se está enviando (ya pudo llegar al servidor)', () => {
  const sending = save(row('a', '2026-10-16', 1000), true, 'op-1');
  const withDelete = queueOp([sending], del('a'), 'op-1');
  assert.deepEqual(withDelete.map((o) => o.opId), ['op-1', 'a-del']); // el borrado se envía después
  const withEdit = queueOp([sending], save(row('a', '2026-10-16', 2000), false, 'op-2'), 'op-1');
  assert.deepEqual(withEdit.map((o) => [o.opId, o.isNew]), [['op-1', true], ['op-2', false]]);
});
