import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settleInteraction } from './brief-interaction.ts';

test('queued and in-progress states are read to completion using the original ID', async () => {
  const states = ['in_progress', 'requires_action', 'completed'];
  const observed = [], ids = [];
  let waits = 0;
  const result = await settleInteraction({ id: 'same', status: 'queued' }, async (id) => {
    ids.push(id);
    return { id, status: states.shift() };
  }, new AbortController().signal, (state) => observed.push(state.status), async () => { waits++; });
  assert.equal(result.status, 'completed');
  assert.deepEqual(ids, ['same', 'same', 'same']);
  assert.deepEqual(observed, ['in_progress', 'requires_action', 'completed']);
  assert.equal(waits, 2);
});

test('final statuses are never polled or promoted to completed', async () => {
  for (const status of ['completed', 'incomplete', 'failed', 'cancelled']) {
    const initial = { id: 'same', status };
    assert.equal(await settleInteraction(initial, () => assert.fail(), new AbortController().signal), initial);
  }
});

test('a persistent non-final state is bounded by the shared abort signal', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(settleInteraction({ id: 'same', status: 'requires_action' }, async (id) => {
    calls++;
    return { id, status: 'in_progress' };
  }, controller.signal, () => {}, async () => { controller.abort(new DOMException('Deadline', 'TimeoutError')); }),
  (error) => error.name === 'TimeoutError');
  assert.equal(calls, 1);
});

test('canonical read rejects a changed interaction ID and preserves retrieval failures', async () => {
  await assert.rejects(settleInteraction({ id: 'same', status: 'in_progress' },
    async () => ({ id: 'other', status: 'completed' }), new AbortController().signal),
  (error) => error.code === 'INTERACTION_FAILED');
  const failure = Object.assign(new Error(), { status: 503 });
  await assert.rejects(settleInteraction({ id: 'same', status: 'requires_action' },
    async () => { throw failure; }, new AbortController().signal), (error) => error === failure);
});
