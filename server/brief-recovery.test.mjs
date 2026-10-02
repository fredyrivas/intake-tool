import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { briefAnalysisPlugin } from './brief-analysis.ts';
import { finishInteraction } from './brief-interaction.ts';

const doc = { id: 'direction', name: 'Direction.txt', mimeType: 'text/plain',
  data: Buffer.from('Refresh Glade assets.').toString('base64') };
const input = { phase: 'document-reading', intent: 'Refresh Glade', message: 'Refresh Glade',
  documents: [doc], values: {}, notes: '', dispositions: {}, context: null };
const reading = { summary: 'Refresh Glade', facts: [], warnings: [],
  documentClassifications: [{ documentId: doc.id, fieldId: 'creativeDirection', page: 0,
    excerpt: 'Refresh Glade assets.' }] };
const analysis = { summary: 'Refresh Glade', proposals: [], questions: [], warnings: [] };
const output = (data, id = 'valid') => ({ id, status: 'completed', output_text: JSON.stringify(data),
  usage: { total_input_tokens: 8860, total_output_tokens: 476,
    total_thought_tokens: 11517, total_tokens: 20853 } });

function harness(create, get = () => assert.fail('Unexpected status check'), wait) {
  const calls = [], options = [], journal = [], checks = [], waits = [];
  const plugin = briefAnalysisPlugin({ project: 'test', location: 'global',
    routingModel: 'gemini-3.8-flash', extractionModel: 'gemini-3.5-flash-lite' }, {
    async create(params, opts) {
      calls.push(params);
      options.push(opts);
      return create(calls.length, params);
    },
    async get(id, params, opts) {
      checks.push({ id, params, options: opts });
      return get(id, checks.length);
    },
  }, async (record) => { journal.push(record); }, async (ms, signal) => {
    waits.push({ ms, signal });
    await wait?.(ms, signal);
  });
  let middleware;
  plugin.configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  async function post(body) {
    const request = Readable.from([JSON.stringify(body)]);
    Object.assign(request, { url: '/api/brief/analyze', method: 'POST',
      headers: { host: 'localhost', 'content-type': 'application/json' } });
    let status, result;
    const headers = {};
    await middleware(request, {
      setHeader(name, value) { headers[name] = value; },
      writeHead(value) { status = value; },
      end(value) { result = JSON.parse(value); },
    }, () => assert.fail('Unexpected next'));
    return { status, result, headers };
  }
  return { calls, options, post, journal, checks, waits };
}

async function scopeInput(sourceReading = reading, document = doc) {
  const { context } = await finishInteraction(output(sourceReading, 'source-checkpoint'), {
    ...input, documents: [document],
  });
  return { ...input, phase: 'scope', context, documents: [{ ...document, data: '' }] };
}

for (const status of ['completed', 'incomplete']) {
  test(`recovers ${status} truncated JSON with the screenshot token counts`, async () => {
    const h = harness((attempt) => attempt === 1
      ? { ...output(analysis, 'truncated'), status, output_text: '{"summary":"unterminated' }
      : output(analysis, 'recovered'));
    const request = await scopeInput();
    const { status: http, result } = await h.post(request);
    assert.equal(http, 200);
    assert.equal(result.context.latestInteractionId, 'recovered');
    assert.equal(result.context.readingInteractionId, 'source-checkpoint');
    assert.equal(h.calls.length, 2);
    for (const params of h.calls) {
      assert.equal(params.model, 'gemini-3.5-flash-lite');
      assert.equal(params.generation_config.thinking_level, 'low');
      assert.equal('max_output_tokens' in params.generation_config, false);
      assert.equal(params.previous_interaction_id, 'source-checkpoint');
      assert.equal(params.input.length, 1);
    }
    assert.match(h.calls[1].system_instruction, /complete, concise JSON/);
    assert.equal(result.trace.timeoutMs, 300000);
    assert.ok(h.options[1].timeout <= h.options[0].timeout);
    assert.equal(h.options[0].fetchOptions.signal, h.options[1].fetchOptions.signal);
    assert.equal(result.trace.outcome, 'completed');
    assert.equal(result.trace.attempts[0].errorCode,
      status === 'completed' ? 'INVALID_JSON' : 'INCOMPLETE_OUTPUT');
    assert.equal(result.trace.attempts.length, 2);
    assert.equal(result.trace.thinkingTokens, 23034);
    assert.equal(result.trace.totalTokens, 41706);
    assert.equal(result.trace.attempts[0].interactionId, 'truncated');
    assert.equal(result.trace.attempts[0].responseCharacters, 24);
    assert.equal(h.journal[0].requestId, result.trace.id);
  });
}

test('a valid JSON with unsupported evidence is regenerated, never accepted', async () => {
  const h = harness((attempt) => output(attempt === 1 ? { ...analysis, proposals: [{
    fieldId: 'brand', values: ['Glade'], source: { kind: 'document', documentId: 'invented',
      page: 0, excerpt: 'Glade' },
  }] } : analysis));
  const { status, result } = await h.post(await scopeInput());
  assert.equal(status, 200);
  assert.equal(result.trace.attempts[0].errorCode, 'INVALID_ANALYSIS');
  assert.equal(result.trace.attempts[0].validationIssue, 'Missing document evidence.');
  assert.match(h.calls[1].system_instruction, /Missing document evidence/);
  assert.match(h.calls[1].system_instruction, /Correct proposals\[0\]\.source\.documentId/);
  assert.equal(result.trace.attempts[0].validationDetail.fieldId, 'brand');
  assert.deepEqual(JSON.parse(h.calls[1].input[1].text).rejectedProposal.source,
    { kind: 'document', documentId: 'invented', page: 0, excerpt: 'Glade' });
  assert.ok(!JSON.stringify(h.journal).includes('"documentId":"invented"'));
  assert.ok(!JSON.stringify(h.journal).includes('rejectedProposal'));
  assert.ok(!result.analysis.proposals.some((p) => p.source.documentId === 'invented'));
});

test('scope receives validated facts and keeps evidence constraints with the fixed model and LOW thinking', async () => {
  const source = { kind: 'document', documentId: doc.id, page: 0, excerpt: 'Refresh Glade assets.' };
  const facts = [{ topic: 'brand', value: 'Glade', source }];
  const h = harness(() => output({ ...analysis,
    proposals: [{ fieldId: 'brand', values: ['Glade'], source }] }));
  const { status, result } = await h.post(await scopeInput({ ...reading, facts }));
  assert.equal(status, 200);
  assert.deepEqual(JSON.parse(h.calls[0].input[0].text).sourceFacts, facts);
  assert.deepEqual(result.analysis.proposals.find((p) => p.fieldId === 'brand').source, source);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].model, 'gemini-3.5-flash-lite');
  assert.equal(h.calls[0].generation_config.thinking_level, 'low');
  const branches = h.calls[0].response_format.schema.properties.proposals.items.properties.source.anyOf;
  assert.deepEqual(branches.find((b) => b.properties.kind.enum.includes('document')).properties.documentId.enum, [doc.id]);
  for (const kind of ['note', 'interpretation']) {
    const branch = branches.find((b) => b.properties.kind.enum.includes(kind));
    assert.deepEqual(branch.properties.documentId.enum, ['']);
    assert.deepEqual(branch.properties.page.enum, [0]);
  }
  assert.ok('webUrl' in branches.find((b) => b.properties.kind.enum.includes('note')).properties);
  assert.ok(!('webUrl' in branches.find((b) => b.properties.kind.enum.includes('interpretation')).properties));
});

for (const failure of [
  { name: 'missing PDF page', document: { ...doc, mimeType: 'application/pdf' },
    source: { kind: 'document', documentId: doc.id, page: 0, excerpt: 'Refresh Glade assets.' },
    property: '.page', corrected: { kind: 'document', documentId: doc.id, page: 1, excerpt: 'Refresh Glade assets.' } },
  { name: 'empty document excerpt', document: doc,
    source: { kind: 'document', documentId: doc.id, page: 0, excerpt: '' },
    property: '.excerpt', corrected: { kind: 'document', documentId: doc.id, page: 0, excerpt: 'Refresh Glade assets.' } },
  { name: 'non-document locator', document: doc,
    source: { kind: 'note', documentId: doc.id, page: 2, excerpt: 'Refresh Glade' },
    property: '', corrected: { kind: 'note', documentId: '', page: 0, excerpt: 'Refresh Glade' } },
]) {
  test(`repairs ${failure.name} with the rejected proposal and a precise rule`, async () => {
    const h = harness((attempt, params) => {
      if (attempt === 2) {
        const recovery = JSON.parse(params.input[1].text);
        assert.deepEqual(recovery.rejectedProposal.source, failure.source);
        assert.equal(recovery.validationDetail.path, `proposals[0].source${failure.property}`);
        assert.ok(params.system_instruction.includes(recovery.validationDetail.rule));
      }
      return output({ ...analysis, proposals: [{ fieldId: 'brand', values: ['Glade'],
        source: attempt === 1 ? failure.source : failure.corrected }] });
    });
    const sourceReading = { ...reading,
      documentClassifications: [{ ...reading.documentClassifications[0],
        page: failure.document.mimeType === 'application/pdf' ? 1 : 0 }] };
    const { status, result } = await h.post(await scopeInput(sourceReading, failure.document));
    assert.equal(status, 200);
    assert.equal(h.calls.length, 2);
    assert.equal(result.trace.attempts[0].validationDetail.path, `proposals[0].source${failure.property}`);
    assert.deepEqual(result.analysis.proposals.find((p) => p.fieldId === 'brand').source, failure.corrected);
    for (const params of h.calls) {
      assert.equal(params.model, 'gemini-3.5-flash-lite');
      assert.equal(params.generation_config.thinking_level, 'low');
      assert.equal(params.previous_interaction_id, 'source-checkpoint');
    }
  });
}

test('requires_action reconciles the same Google Search interaction without regenerating', async () => {
  const usage = { total_input_tokens: 21512, total_output_tokens: 1462,
    total_thought_tokens: 5120, total_tokens: 28094 };
  const steps = [{ type: 'google_search_call', id: 'search-1' },
    { type: 'google_search_result', call_id: 'search-1' }];
  const h = harness(() => ({ ...output(analysis, 'search-interaction'),
    status: 'requires_action', usage, steps }),
    () => ({ ...output(analysis, 'search-interaction'), usage, steps }));
  const { status, result } = await h.post(await scopeInput());
  assert.equal(status, 200);
  assert.equal(h.calls.length, 1);
  assert.equal(h.checks.length, 1);
  assert.equal(h.checks[0].id, 'search-interaction');
  assert.equal(h.checks[0].options.fetchOptions.signal, h.options[0].fetchOptions.signal);
  assert.ok(h.checks[0].options.timeout <= h.options[0].timeout);
  assert.equal(result.context.latestInteractionId, 'search-interaction');
  assert.equal(result.trace.attempts.length, 1);
  assert.equal(result.trace.attempts[0].initialInteractionStatus, 'requires_action');
  assert.equal(result.trace.attempts[0].statusChecks, 1);
  assert.equal(result.trace.attempts[0].interactionStatus, 'completed');
  assert.deepEqual(result.trace.attempts[0].stepTypes, ['google_search_call', 'google_search_result']);
  assert.equal(result.trace.totalTokens, 28094);
});

test('an unsupported client action receives a specific error without executing or regenerating', async () => {
  const pending = { ...output(analysis, 'client-tool'), status: 'requires_action',
    steps: [{ type: 'function_call', id: 'custom-1', name: 'unsupported' }] };
  const h = harness(() => pending, () => pending);
  const { status, result } = await h.post(await scopeInput());
  assert.equal(status, 502);
  assert.equal(result.code, 'TOOL_ACTION_REQUIRED');
  assert.equal(result.trace.failureStage, 'response');
  assert.equal(result.trace.attempts[0].interactionStatus, 'requires_action');
  assert.equal(h.calls.length, 1);
  assert.equal(h.checks.length, 1);
});

test('failed status retrieval retains the initial snapshot and counts the attempted read', async () => {
  const h = harness(() => ({ ...output(analysis, 'pending'), status: 'requires_action' }),
    () => { throw Object.assign(new Error(), { status: 503 }); });
  const { status, result } = await h.post(await scopeInput());
  assert.equal(status, 503);
  assert.equal(result.code, 'PROVIDER_UNAVAILABLE');
  assert.equal(result.trace.failureStage, 'provider');
  assert.equal(result.trace.attempts[0].statusChecks, 1);
  assert.equal(result.trace.attempts[0].initialInteractionStatus, 'requires_action');
  assert.equal(result.trace.attempts[0].thinkingTokens, 11517);
  assert.equal(result.trace.totalTokens, null);
  assert.equal(h.calls.length, 1);
});

test('repeated malformed responses stop after one recovery with explicit diagnostics', async () => {
  const h = harness(() => ({ ...output(analysis), output_text: '{"summary":"broken' }));
  const { status, result } = await h.post(await scopeInput());
  assert.equal(status, 502);
  assert.equal(h.calls.length, 2);
  assert.equal(result.code, 'INVALID_JSON');
  assert.equal(result.trace.outcome, 'failed');
  assert.equal(result.trace.failureStage, 'response');
  assert.equal(result.trace.interactionStatus, 'completed');
  assert.equal(result.trace.attempts.length, 2);
  assert.equal(result.context, undefined);
  assert.ok(!JSON.stringify(result).includes('broken'));
});

test('source reading can recover without chaining the malformed reading', async () => {
  const h = harness((attempt) => attempt === 1
    ? { ...output(reading), status: 'incomplete', output_text: '' } : output(reading));
  const { status, result } = await h.post(input);
  assert.equal(status, 200);
  assert.equal(result.analysis, null);
  assert.deepEqual(result.context.reading, reading);
  assert.equal(h.calls.length, 2);
  assert.ok(h.calls.every((params) => params.previous_interaction_id === undefined));
});

test('provider rejection is identified and not retried as a generation failure', async () => {
  const h = harness(() => { throw Object.assign(new Error('Provider details withheld'), { status: 400 }); });
  const { status, result } = await h.post(input);
  assert.equal(status, 502);
  assert.equal(result.code, 'PROVIDER_INVALID_REQUEST');
  assert.equal(result.trace.providerStatus, 400);
  assert.equal(result.trace.failureStage, 'provider');
  assert.equal(h.calls.length, 1);
  assert.ok(!JSON.stringify(result).includes('Provider details withheld'));
});

test('final review recovers a provider 429 with bounded backoff and the same checkpoint', async () => {
  const h = harness((attempt) => {
    if (attempt < 3) throw Object.assign(new Error('private quota details'), { status: 429 });
    return output(analysis, 'review-completed');
  });
  const { status, result } = await h.post({ ...await scopeInput(), phase: 'final-review' });
  assert.equal(status, 200);
  assert.equal(result.context.latestInteractionId, 'review-completed');
  assert.equal(h.calls.length, 3);
  assert.deepEqual(h.calls[1], h.calls[0]);
  assert.deepEqual(h.calls[2], h.calls[0]);
  assert.equal(h.calls[0].previous_interaction_id, 'source-checkpoint');
  assert.equal(h.waits.length, 2);
  for (const [index, wait] of h.waits.entries()) {
    const base = 2_000 * 2 ** index;
    assert.ok(wait.ms >= base && wait.ms < base + 1_000);
    assert.equal(wait.signal, h.options[0].fetchOptions.signal);
  }
  assert.ok(h.options.every((opts) => opts.fetchOptions.signal === h.options[0].fetchOptions.signal));
  assert.ok(h.options[2].timeout <= h.options[0].timeout);
  assert.deepEqual(result.trace.attempts.map((item) => item.providerStatus), [429, 429, undefined]);
  assert.deepEqual(result.trace.attempts.map((item) => item.errorCode), ['PROVIDER_RATE_LIMIT', 'PROVIDER_RATE_LIMIT', undefined]);
  assert.equal(result.trace.totalTokens, null);
  assert.ok(!JSON.stringify(h.journal).includes('private quota details'));
});

test('persistent provider rate limits stop after two retries', async () => {
  const h = harness(() => { throw Object.assign(new Error(), { status: 429 }); });
  const { status, result } = await h.post({ ...await scopeInput(), phase: 'final-review' });
  assert.equal(status, 503);
  assert.equal(result.code, 'PROVIDER_RATE_LIMIT');
  assert.equal(result.trace.providerStatus, 429);
  assert.equal(result.trace.failureStage, 'provider');
  assert.equal(result.trace.attempts.length, 3);
  assert.equal(h.calls.length, 3);
  assert.equal(h.waits.length, 2);
  assert.equal(result.context, undefined);
});

test('rate limit retries preserve the separate single output recovery', async () => {
  const h = harness((attempt) => {
    if (attempt === 1 || attempt === 3) throw Object.assign(new Error(), { code: 429 });
    if (attempt === 2) return { ...output(analysis), output_text: '{' };
    return output(analysis, 'recovered');
  });
  const { status, result } = await h.post(await scopeInput());
  assert.equal(status, 200);
  assert.equal(h.calls.length, 4);
  assert.deepEqual(h.calls[0], h.calls[1]);
  assert.deepEqual(h.calls[2], h.calls[3]);
  assert.equal(h.calls[0].generation_config.thinking_level, 'low');
  assert.equal(h.calls[2].generation_config.thinking_level, 'low');
  assert.match(h.calls[3].system_instruction, /rejected \(INVALID_JSON\)/);
  assert.ok(h.calls.every((params) => params.previous_interaction_id === 'source-checkpoint'));
  assert.equal(result.trace.attempts.length, 4);
  assert.equal(h.waits.length, 2);
});

test('the shared deadline aborts rate limit backoff before another provider call', async (t) => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => controller.signal);
  const h = harness(() => { throw Object.assign(new Error(), { status: 429 }); }, undefined,
    async (_ms, signal) => {
      controller.abort(new DOMException('Deadline exceeded', 'TimeoutError'));
      signal.throwIfAborted();
    });
  const { status, result } = await h.post(await scopeInput());
  assert.equal(status, 504);
  assert.equal(result.code, 'ANALYSIS_TIMEOUT');
  assert.equal(h.calls.length, 1);
  assert.equal(h.waits.length, 1);
  assert.equal(result.trace.attempts[0].providerStatus, 429);
});

test('expired interaction retains the existing context rebuild protocol', async () => {
  const h = harness(() => { throw Object.assign(new Error('expired'), { status: 404 }); });
  const { status, result } = await h.post(await scopeInput());
  assert.equal(status, 409);
  assert.equal(result.code, 'CONTEXT_UNAVAILABLE');
  assert.equal(h.calls.length, 1);
});

test('invalid upload has a journaled diagnostic before Gemini is called', async () => {
  const h = harness(() => assert.fail('Must not call Gemini'));
  const { status, result, headers } = await h.post({ ...input, documents: [{ ...doc, data: 'not base64' }] });
  assert.equal(status, 400);
  assert.equal(result.code, 'INVALID_ANALYSIS_REQUEST');
  assert.equal(result.diagnostic.failureStage, 'request');
  assert.equal(result.diagnostic.origin, 'server');
  assert.equal(headers['X-Request-ID'], result.requestId);
  assert.equal(h.journal[0].requestId, result.requestId);
  assert.equal(result.diagnostic.providerStatus, undefined);
  assert.equal(h.calls.length, 0);
});

test('corrupt Office archive retains phase and request ID before extraction fails', async () => {
  const h = harness(() => assert.fail('Must not call Gemini'));
  const corrupt = { ...doc, name: 'Corrupt.pptx',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    data: Buffer.from('PK\x03\x04[Content_Types].xml ppt/presentation.xml').toString('base64') };
  const { status, result } = await h.post({ ...input, documents: [corrupt] });
  assert.equal(status, 422);
  assert.equal(result.code, 'DOCUMENT_PREPARATION_FAILED');
  assert.equal(result.trace.phase, 'document-reading');
  assert.equal(result.trace.failureStage, 'preparation');
  assert.equal(result.trace.totalTokens, null);
  assert.equal(h.journal[0].trace.id, result.requestId);
  assert.ok(!JSON.stringify(result.diagnostic).includes('Corrupt.pptx'));
});

test('provider failure during recovery records both attempts and unknown total usage', async () => {
  const h = harness((attempt) => {
    if (attempt === 1) return { ...output(analysis), output_text: '{' };
    throw Object.assign(new Error('private response'), { status: 503 });
  });
  const { status, result } = await h.post(await scopeInput());
  assert.equal(status, 503);
  assert.equal(result.code, 'PROVIDER_UNAVAILABLE');
  assert.equal(result.trace.attempts.length, 2);
  assert.equal(result.trace.attempts[0].errorCode, 'INVALID_JSON');
  assert.equal(result.trace.attempts[1].providerStatus, 503);
  assert.equal(result.trace.attempts[1].errorCode, 'PROVIDER_UNAVAILABLE');
  assert.equal(result.trace.attempts[1].interactionStatus, undefined);
  assert.equal(result.trace.totalTokens, null);
  assert.equal(result.trace.providerStatus, 503);
  assert.equal(result.trace.interactionStatus, undefined);
  assert.ok(!JSON.stringify(h.journal).includes('private response'));
});

test('repeated local evidence rejection returns 422 rather than a generic gateway error', async () => {
  const h = harness(() => output({ ...analysis, proposals: [{ fieldId: 'brand', values: ['Glade'],
    source: { kind: 'document', documentId: 'unknown', page: 0, excerpt: 'Glade' } }] }));
  const { status, result } = await h.post(await scopeInput());
  assert.equal(status, 422);
  assert.equal(result.code, 'INVALID_ANALYSIS');
  assert.equal(result.diagnostic.origin, 'server');
  assert.equal(result.diagnostic.failureStage, 'validation');
  assert.equal(result.diagnostic.providerStatus, undefined);
  assert.equal(h.calls.length, 2);
});

test('a broken diagnostic store does not replace a successful analysis', async () => {
  const plugin = briefAnalysisPlugin({ project: 'test', location: 'global',
    routingModel: 'gemini-3.8-flash', extractionModel: 'gemini-3.5-flash-lite' },
    { async create() { return output(reading); } }, async () => { throw new Error('Disk failed'); });
  let middleware;
  plugin.configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  const request = Readable.from([JSON.stringify(input)]);
  Object.assign(request, { url: '/api/brief/analyze', method: 'POST',
    headers: { host: 'localhost', 'content-type': 'application/json' } });
  let status;
  await middleware(request, { writeHead(value) { status = value; }, end() {} }, () => assert.fail());
  assert.equal(status, 200);
});
