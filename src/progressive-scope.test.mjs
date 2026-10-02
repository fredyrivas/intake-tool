import test from 'node:test';
import assert from 'node:assert/strict';
import { runProgressiveScope } from './progressive-scope.ts';

const proposal = (fieldId, values) => ({ fieldId, values, source: { kind: 'note', documentId: '', page: 0, excerpt: 'Requester evidence' } });
const analysis = (proposals = [], questions = []) => ({ summary: 'Brief information', proposals, questions, warnings: [], conditionalRequiredFieldIds: [] });
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('shows general information while route selection is pending, then waits for details', async () => {
  let proposals = [];
  const events = [];
  const route = deferred(), details = deferred(), routeStarted = deferred(), detailsStarted = deferred();
  const running = runProgressiveScope([], {
    revision: () => 0,
    proposals: () => proposals,
    onStage(phase) { events.push(['stage', phase]); },
    async analyze(phase, provisional) {
      events.push(['request', phase]);
      if (phase === 'general-information') return analysis([proposal('brand', ['Glade'])]);
      assert.deepEqual(provisional.brand, ['Glade']);
      if (phase === 'route-selection') { routeStarted.resolve(); return route.promise; }
      assert.deepEqual(provisional.requestTypes, ['EVOLVE']);
      detailsStarted.resolve();
      return details.promise;
    },
    publish(phase, result) {
      events.push(['publish', phase]);
      if (phase !== 'route-details') proposals.push(...result.proposals);
    },
  });
  await routeStarted.promise;
  assert.deepEqual(proposals.map((item) => item.fieldId), ['brand']);
  assert.ok(events.findIndex(([event, phase]) => event === 'publish' && phase === 'general-information') <
    events.findIndex(([event, phase]) => event === 'request' && phase === 'route-selection'));
  assert.ok(!events.some(([, phase]) => phase === 'route-details'));
  route.resolve(analysis([proposal('requestTypes', ['EVOLVE'])]));
  await detailsStarted.promise;
  assert.ok(!events.some(([event, phase]) => event === 'publish' && phase === 'route-details'));
  details.resolve(analysis([proposal('evolveNeeds', ['Translation'])]));
  assert.equal(await running, true);
  assert.deepEqual(proposals.map((item) => item.fieldId), ['brand', 'requestTypes'], 'Detail proposals must not be confirmed with Scope');
  assert.deepEqual(events.filter(([event]) => event === 'request').map(([, phase]) => phase),
    ['general-information', 'route-selection', 'route-details']);
});

test('an ambiguous route stops before details and a user selection resumes only details', async () => {
  let proposals = [];
  const calls = [];
  const dependencies = {
    revision: () => 0, proposals: () => proposals, onStage() {},
    async analyze(phase) {
      calls.push(phase);
      return phase === 'route-selection'
        ? analysis([proposal('requestTypes', ['EVOLVE'])], [{ fieldId: 'requestTypes', prompt: 'Which route?', options: [] }])
        : analysis();
    },
    publish(phase, result) { if (phase !== 'route-details') proposals.push(...result.proposals); },
  };
  assert.equal(await runProgressiveScope([], dependencies), false);
  assert.deepEqual(calls, ['general-information', 'route-selection']);
  proposals = [proposal('requestTypes', ['CREATE', 'INNOVATE'])];
  assert.equal(await runProgressiveScope([], dependencies, true), true);
  assert.deepEqual(calls, ['general-information', 'route-selection', 'route-details']);
});

test('a route edit during details discards the stale result and analyzes the new branch', async () => {
  let proposals = [proposal('requestTypes', ['EVOLVE'])], revision = 0;
  const pending = deferred(), started = deferred(), published = [], routes = [];
  const running = runProgressiveScope([], {
    proposals: () => proposals, revision: () => revision, onStage() {},
    async analyze(phase, values) {
      assert.equal(phase, 'route-details');
      routes.push(values.requestTypes);
      if (routes.length === 1) { started.resolve(); return pending.promise; }
      return analysis([proposal('businessContext', ['New production'])]);
    },
    publish(phase, result) { published.push(result); },
  }, true);
  await started.promise;
  proposals = [proposal('requestTypes', ['CREATE'])];
  revision++;
  pending.resolve(analysis([proposal('evolveNeeds', ['Translation'])]));
  assert.equal(await running, true);
  assert.deepEqual(routes, [['EVOLVE'], ['CREATE']]);
  assert.deepEqual(published.flatMap((result) => result.proposals.map((item) => item.fieldId)), ['businessContext']);
});

test('an edit during route selection prevents the obsolete route from starting details', async () => {
  let proposals = [], revision = 0;
  const pending = deferred(), started = deferred(), routes = [];
  const running = runProgressiveScope([], {
    proposals: () => proposals, revision: () => revision, onStage() {},
    async analyze(phase, values) {
      if (phase === 'general-information') return analysis([proposal('brand', ['Glade'])]);
      if (phase === 'route-selection') { started.resolve(); return pending.promise; }
      routes.push(values.requestTypes);
      return analysis();
    },
    publish(phase, result) { if (phase !== 'route-details') proposals.push(...result.proposals); },
  });
  await started.promise;
  proposals.push(proposal('requestTypes', ['Delivery only']));
  revision++;
  pending.resolve(analysis([proposal('requestTypes', ['EVOLVE'])]));
  assert.equal(await running, true);
  assert.deepEqual(routes, [['Delivery only']]);
});

test('a failed details request retains Scope and can retry without rerunning the first two tasks', async () => {
  let proposals = [], fail = true;
  const calls = [];
  const dependencies = {
    proposals: () => proposals, revision: () => 0, onStage() {},
    async analyze(phase) {
      calls.push(phase);
      if (phase === 'general-information') return analysis([proposal('brand', ['Glade'])]);
      if (phase === 'route-selection') return analysis([proposal('requestTypes', ['EVOLVE'])]);
      if (fail) throw new Error('Try details again');
      return analysis();
    },
    publish(phase, result) { if (phase !== 'route-details') proposals.push(...result.proposals); },
  };
  await assert.rejects(runProgressiveScope([], dependencies), /Try details again/);
  assert.deepEqual(proposals.map((item) => item.fieldId), ['brand', 'requestTypes']);
  fail = false;
  assert.equal(await runProgressiveScope([], dependencies, true), true);
  assert.deepEqual(calls, ['general-information', 'route-selection', 'route-details', 'route-details']);
});
