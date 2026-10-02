import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBriefAnalysis } from './brief-analysis-flow.ts';
import { finishInteraction } from '../server/brief-interaction.ts';
import { AnalysisRequestError } from './request-brief-analysis.ts';

const doc = {
  id: 'one',
  name: 'One.txt',
  mimeType: 'text/plain',
  data: Buffer.from('Creative objective: refresh Glade').toString('base64'),
};
const input = {
  phase: 'scope',
  intent: 'Refresh Glade',
  message: 'Refresh Glade',
  documents: [doc],
  values: {},
  dispositions: {},
  pendingProposals: [],
  context: null,
};
function harness({ failScope = false, expireOnce = false, dataByPhase = {} } = {}) {
  const progress = [], calls = [],
    checkpoints = [];
  let saved = null;
  const dependencies = {
    onProgress(update) { progress.push(update); },
    onTrace() {},
    async checkpoint(context) {
      saved = context;
      checkpoints.push(context?.latestInteractionId ?? null);
    },
    async request(body) {
      const request = JSON.parse(body);
      calls.push(request);
      if (request.phase === 'scope' && failScope)
        return { response: { ok: false }, result: { error: 'Try again' } };
      if (request.phase !== 'document-reading' && expireOnce) {
        expireOnce = false;
        return { response: { ok: false }, result: { code: 'CONTEXT_UNAVAILABLE' } };
      }
      const reading = {
        summary: 'Refresh Glade',
        facts: [],
        warnings: [],
        documentClassifications: request.documents
          .filter((doc) => doc.data)
          .map((doc) => ({
            documentId: doc.id,
            fieldId: 'creativeDirection',
            page: 0,
            excerpt: 'Creative objective',
          })),
      };
      const data =
        request.phase === 'document-reading'
          ? reading
          : { ...reading, proposals: [], questions: [], ...dataByPhase[request.phase] };
      const result = await finishInteraction(
        {
          id: `id-${calls.length}`,
          status: 'completed',
          output_text: JSON.stringify(data),
          steps: [],
        },
        request,
      );
      return { response: { ok: true }, result };
    },
  };
  return { calls, checkpoints, progress, dependencies, saved: () => saved };
}

test('the progressive path makes three chained calls, uploading sources only with general information', async () => {
  const source = { kind: 'interpretation', documentId: '', page: 0, excerpt: 'Refresh an existing campaign' };
  const h = harness({ dataByPhase: {
    'route-selection': { proposals: [{ fieldId: 'requestTypes', values: ['EVOLVE'], source }] },
    'route-details': { proposals: [{ fieldId: 'evolveNeeds', values: ['Translation'], source }] },
  } });
  const general = await runBriefAnalysis({ ...input, phase: 'general-information' }, h.dependencies);
  assert.ok(general.proposals.some((item) => item.fieldId === 'creativeDirection'));
  await runBriefAnalysis({ ...input, phase: 'route-selection', context: h.saved(), provisionalValues: { brand: ['Glade'] } }, h.dependencies);
  const details = await runBriefAnalysis({ ...input, phase: 'route-details', context: h.saved(), provisionalValues: { requestTypes: ['EVOLVE'] } }, h.dependencies);
  assert.deepEqual(h.calls.map((call) => call.phase), ['general-information', 'route-selection', 'route-details']);
  assert.deepEqual(h.calls.map((call) => Boolean(call.documents[0].data)), [true, false, false]);
  assert.deepEqual(h.calls.map((call) => call.context?.latestInteractionId), [undefined, 'id-1', 'id-2']);
  assert.ok(h.calls.every((call) => Object.keys(call.values).length === 0));
  assert.equal(h.saved().readingInteractionId, 'id-1');
  assert.deepEqual(details.proposals.map((item) => item.fieldId), ['evolveNeeds']);
});

test('two calls prepare Scope, persist reading first and do not resend source content', async () => {
  const h = harness();
  await runBriefAnalysis(input, h.dependencies);
  assert.deepEqual(
    h.calls.map((call) => call.phase),
    ['document-reading', 'scope'],
  );
  assert.deepEqual(h.checkpoints, [null, 'id-1', 'id-2']);
  assert.deepEqual(h.progress.filter((update) => update.stage === 'submission').map((update) => update.phase),
    ['document-reading', 'scope']);
  assert.deepEqual(h.progress.at(-1), { phase: 'scope', stage: 'checkpoint' });
  assert.equal(h.calls[1].context.latestInteractionId, 'id-1');
  assert.equal(h.calls[1].documents[0].data, '');
  await runBriefAnalysis(
    { ...input, phase: 'final-review', context: h.saved(), values: { requestTypes: ['EVOLVE'] } },
    h.dependencies,
  );
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[2].context.latestInteractionId, 'id-2');
});

test('each chained request records its own total elapsed time before persisting the trace', async (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const h = harness();
  const request = h.dependencies.request;
  const checkpoint = h.dependencies.checkpoint;
  const traces = [], saved = [];
  await runBriefAnalysis(input, {
    ...h.dependencies,
    async request(body) {
      now += 1250;
      const result = await request(body);
      const phase = JSON.parse(body).phase;
      return { ...result, result: { ...result.result, trace: { id: phase, phase, durationMs: 1000 } } };
    },
    onProgress(progress) {
      if (progress.stage === 'validation') now += 50;
    },
    onTrace(trace) { traces.push(trace); },
    async checkpoint(context) {
      if (context) saved.push({ ...traces.at(-1) });
      now += 100;
      await checkpoint(context);
    },
  });
  assert.deepEqual(traces.map((trace) => [trace.phase, trace.durationMs, trace.totalDurationMs]),
    [['document-reading', 1000, 1300], ['scope', 1000, 1300]]);
  assert.deepEqual(saved, traces);
});

test('a failed Scope can resume from the saved source reading', async () => {
  const first = harness({ failScope: true });
  await assert.rejects(runBriefAnalysis(input, first.dependencies), /Try again/);
  assert.equal(first.saved().latestInteractionId, 'id-1');
  const second = harness();
  await runBriefAnalysis({ ...input, context: first.saved() }, second.dependencies);
  assert.deepEqual(
    second.calls.map((call) => call.phase),
    ['scope'],
  );
});

test('expired context rebuilds once from sources; changed or removed sources invalidate it', async () => {
  const h = harness();
  await runBriefAnalysis(input, h.dependencies);
  const expired = harness({ expireOnce: true });
  await runBriefAnalysis({ ...input, context: h.saved() }, expired.dependencies);
  assert.deepEqual(
    expired.calls.map((call) => call.phase),
    ['scope', 'document-reading', 'scope'],
  );
  assert.deepEqual(expired.progress.filter((update) => update.stage === 'submission').map((update) => update.phase),
    ['scope', 'document-reading', 'scope']);
  for (const changed of [
    { intent: 'Different work' },
    { documents: [] },
    { documents: [{ ...doc, data: Buffer.from('Replacement').toString('base64') }] },
  ]) {
    const next = harness();
    await runBriefAnalysis({ ...input, context: h.saved(), ...changed }, next.dependencies);
    assert.deepEqual(
      next.calls.map((call) => call.phase),
      ['document-reading', 'scope'],
    );
  }
});

test('new documents extend existing context before Review, sending only new contents', async () => {
  const h = harness();
  await runBriefAnalysis(input, h.dependencies);
  const documents = [doc, { ...doc, id: 'two', name: 'Two.txt' }];
  await runBriefAnalysis(
    {
      ...input,
      phase: 'final-review',
      documents,
      context: h.saved(),
      values: { requestTypes: ['EVOLVE'] },
    },
    h.dependencies,
  );
  assert.deepEqual(
    h.calls.map((call) => call.phase),
    ['document-reading', 'scope', 'document-enrichment', 'final-review'],
  );
  assert.equal(h.calls[2].documents[0].data, '');
  assert.equal(h.calls[2].documents[1].data, doc.data);
  assert.equal(h.calls[3].context.reading.documentClassifications.length, 2);
});

test('failure to save the reading prevents the dependent Scope call', async () => {
  const h = harness();
  await assert.rejects(
    runBriefAnalysis(input, {
      ...h.dependencies,
      async checkpoint(context) {
        if (context) throw new Error('Storage unavailable');
      },
    }),
    /Storage unavailable/,
  );
  assert.deepEqual(
    h.calls.map((call) => call.phase),
    ['document-reading'],
  );
});

test('failed Scope persists its diagnostic while preserving the successful reading', async () => {
  const h = harness();
  await runBriefAnalysis(input, h.dependencies);
  const context = h.saved();
  const traces = [], saved = [];
  await assert.rejects(runBriefAnalysis({ ...input, context }, {
    async request() { return { response: { ok: false, status: 502 }, result: {
      error: 'Unterminated response', code: 'INVALID_JSON',
      trace: { id: 'scope-failure', origin: 'gemini', outcome: 'failed', errorCode: 'INVALID_JSON' },
    } }; },
    onTrace(trace) { traces.push(trace); },
    async checkpoint(next) { saved.push({ context: next, traces: [...traces] }); },
  }), /Unterminated/);
  assert.equal(saved[0].context.latestInteractionId, context.latestInteractionId);
  assert.equal(saved[0].traces[0].errorCode, 'INVALID_JSON');
  assert.equal(saved[0].traces[0].origin, 'gemini');
});

test('early server failure retains server origin even without an AI trace', async () => {
  const traces = [];
  await assert.rejects(runBriefAnalysis(input, {
    async request() { return { response: { ok: false, status: 400 }, result: {
      error: 'Invalid request', code: 'INVALID_ANALYSIS_REQUEST', requestId: 'early-server',
      diagnostic: { origin: 'server', failureStage: 'request' },
    } }; },
    onTrace(trace) { traces.push(trace); }, async checkpoint() {},
  }), /Invalid request/);
  assert.equal(traces[0].id, 'early-server');
  assert.equal(traces[0].origin, 'server');
  assert.equal(traces[0].thinkingLevel, 'UNAVAILABLE');
  assert.equal(traces[0].httpStatus, 400);
});

test('polling failure records browser origin and preserves the server reference', async (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const traces = [];
  let saved;
  await assert.rejects(runBriefAnalysis(input, {
    async request() {
      now += 3500;
      throw new AnalysisRequestError('Lost polling connection', 'POLLING_CONNECTION_FAILED', 'polling', 'pending-job');
    },
    onTrace(trace) { traces.push(trace); },
    async checkpoint() { saved = [...traces]; },
  }), /Lost polling/);
  assert.equal(saved[0].id, 'pending-job');
  assert.equal(saved[0].origin, 'browser');
  assert.equal(saved[0].failureStage, 'polling');
  assert.equal(saved[0].totalTokens, null);
  assert.equal(saved[0].totalDurationMs, 3500);
});

test('invalid client context updates the same trace with client validation failure', async () => {
  const traces = [];
  await assert.rejects(runBriefAnalysis(input, {
    async request() { return { response: { ok: true, status: 200 }, result: {
      context: null, trace: { id: 'provider-completed', outcome: 'completed', httpStatus: 200 },
    } }; },
    onTrace(trace) { traces.push(trace); }, async checkpoint() {},
  }), /Invalid analysis context/);
  assert.equal(traces.length, 1);
  assert.equal(traces[0].id, 'provider-completed');
  assert.equal(traces[0].outcome, 'failed');
  assert.equal(traces[0].errorCode, 'CLIENT_VALIDATION_FAILED');
  assert.equal(traces[0].origin, 'browser');
});
