import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { briefAnalysisPlugin } from './brief-analysis.ts';
import { finishInteraction, interactionInput, interactionResponse } from './brief-interaction.ts';
import { parseAnalysis } from '../shared/brief-contract.ts';
import {
  digest,
  stampDocuments,
  contextMatches,
  restoreAnalysisContext,
  parseSourceReading,
} from '../shared/brief-context.ts';

const doc = {
  id: 'direction',
  name: 'Direction.txt',
  mimeType: 'text/plain',
  data: Buffer.from('Brand: Glade. Approver: approver@example.com. Refresh six assets.').toString(
    'base64',
  ),
};
const source = { kind: 'document', documentId: doc.id, page: 0, excerpt: 'Brand: Glade' };
const reading = {
  summary: 'Refresh six Glade assets.',
  facts: [{ topic: 'brand', value: 'Glade', source }],
  documentClassifications: [
    { documentId: doc.id, fieldId: 'creativeDirection', page: 0, excerpt: 'Brand and objective' },
  ],
  warnings: [],
};
const output = (data, id = 'interaction-1') => ({
  id,
  status: 'completed',
  output_text: JSON.stringify(data),
  steps: [],
});
const input = {
  phase: 'document-reading',
  documents: [doc],
  values: {},
  intent: 'Refresh six assets.',
  context: null,
  dispositions: {},
};
const proposal = (fieldId, values, evidence = source) => ({ fieldId, values, source: evidence });
const analysis = (proposals = []) => ({
  summary: 'Refresh six assets.',
  proposals,
  questions: [],
  warnings: [],
});

async function read() {
  return (await finishInteraction(output(reading), input)).context;
}

test('general information creates the source checkpoint and proposes only Module 01', async () => {
  const result = await finishInteraction(output({ ...reading, ...analysis([
    proposal('brand', ['Glade']), proposal('requestTypes', ['EVOLVE']), proposal('evolveNeeds', ['Translation']),
  ]) }), { ...input, phase: 'general-information' });
  assert.deepEqual(result.analysis.proposals.map((item) => item.fieldId), ['brand', 'creativeDirection']);
  assert.equal(result.context.readingInteractionId, 'interaction-1');
  assert.equal(result.context.documents.length, 1);
  assert.deepEqual(result.context.reading.facts, reading.facts);
});

test('route decisions stay separate and details use a provisional branch without confirming it', async () => {
  const context = await read();
  const documents = [{ ...doc, data: '' }];
  const route = await finishInteraction(output(analysis([
    proposal('requestTypes', ['EVOLVE']), proposal('brand', ['Glade']),
  ])), { ...input, phase: 'route-selection', context, documents, provisionalValues: { brand: ['Glade'] } });
  assert.deepEqual(route.analysis.proposals.map((item) => item.fieldId), ['requestTypes']);
  const details = await finishInteraction(output(analysis([
    proposal('requestTypes', ['CREATE']), proposal('brand', ['Raid']),
    proposal('evolveNeeds', ['VO recording']), proposal('voLanguage', ['English']),
    proposal('createDeliverables', ['National campaign films / TVC']),
  ])), { ...input, phase: 'route-details', context: route.context, documents,
    provisionalValues: { requestTypes: ['EVOLVE'], brand: ['Glade'] } });
  assert.deepEqual(details.analysis.proposals.map((item) => item.fieldId), ['evolveNeeds', 'voLanguage']);
  assert.equal(details.context.latestInteractionId, 'interaction-1');
  assert.deepEqual(input.values, {});
});

test('reading validates evidence, classifications and context invalidation', async () => {
  const context = await read();
  assert.equal(restoreAnalysisContext(context, [doc]).readingInteractionId, 'interaction-1');
  assert.equal(restoreAnalysisContext(undefined, [doc]), null);
  assert.equal(restoreAnalysisContext({ ...context, configurationVersion: 'old' }, [doc]), null);
  assert.equal(
    contextMatches(context, await digest(input.intent), await stampDocuments([doc])),
    true,
  );
  assert.equal(
    contextMatches(context, await digest('Changed intent'), await stampDocuments([doc])),
    false,
  );
  assert.equal(contextMatches(context, await digest(input.intent), []), false);
  assert.equal(
    contextMatches(
      context,
      await digest(input.intent),
      await stampDocuments([{ ...doc, data: Buffer.from('Changed').toString('base64') }]),
    ),
    false,
  );
  assert.throws(
    () => parseSourceReading({ ...reading, documentClassifications: [] }, [doc]),
    /Incomplete/,
  );
  assert.throws(
    () =>
      parseSourceReading(
        {
          ...reading,
          facts: [{ ...reading.facts[0], source: { ...source, documentId: 'unknown' } }],
        },
        [doc],
      ),
    /evidence/,
  );
});

test('scope reuses classifications but limits proposals to module one and routes', async () => {
  const context = await read();
  const result = await finishInteraction(
    output(
      analysis([
        proposal('brand', ['Glade']),
        proposal('requestTypes', ['EVOLVE']),
        proposal('evolveNeeds', ['Translation']),
        proposal('projectTitle', ['Glade refresh']),
        proposal('mainApproverEmail', ['approver@example.com'], {
          ...source,
          excerpt: 'Approver: approver@example.com',
        }),
      ]),
      'scope-2',
    ),
    { ...input, phase: 'scope', context, documents: [{ ...doc, data: '' }] },
  );
  assert.deepEqual(
    result.analysis.proposals.map((p) => p.fieldId),
    ['brand', 'requestTypes', 'projectTitle', 'mainApproverEmail', 'creativeDirection'],
  );
  assert.equal(result.context.latestInteractionId, 'scope-2');
  assert.equal(result.context.readingInteractionId, 'interaction-1');
});

test('review preserves confirmed choices and rejects inactive or module-one proposals', async () => {
  const context = await read();
  const result = await finishInteraction(
    output(
      analysis([
        proposal('brand', ['Raid']),
        proposal('requestTypes', ['CREATE']),
        proposal('businessContext', ['Wrong branch']),
        proposal('evolveNeeds', ['Translation']),
        proposal('notes', ['Wrong confirmed note']),
      ]),
    ),
    {
      ...input,
      phase: 'final-review',
      context,
      documents: [{ ...doc, data: '' }],
      values: { requestTypes: ['EVOLVE'], brand: ['Glade'], notes: ['Keep this'] },
    },
  );
  assert.deepEqual(
    result.analysis.proposals.map((p) => p.fieldId),
    ['evolveNeeds'],
  );
  assert.equal(result.analysis.warnings.length, 1);
  assert.deepEqual(result.analysis.questions, []);
});

test('contacts need explicit evidence and free-text questions need no invented answer options', () => {
  assert.throws(
    () =>
      parseAnalysis(
        analysis([
          proposal('mainApproverEmail', ['a@example.com'], {
            kind: 'interpretation',
            documentId: '',
            page: 0,
            excerpt: 'Approver a@example.com',
          }),
        ]),
        [doc],
      ),
    /explicit/,
  );
  assert.throws(
    () => parseAnalysis(analysis([proposal('mainApproverEmail', ['a@example.com'])]), [doc]),
    /explicit/,
  );
  const result = parseAnalysis(
    {
      ...analysis(),
      questions: [{ fieldId: 'mainApproverEmail', prompt: 'Who approves?', options: [] }],
    },
    [doc],
  );
  assert.deepEqual(result.questions[0].options, []);
});

test('native PDF/image input and provider citations are adapted without trusting model URLs', () => {
  assert.deepEqual(
    interactionInput([
      { text: 'test' },
      { inlineData: { mimeType: 'application/pdf', data: 'abc=' } },
      { inlineData: { mimeType: 'image/png', data: 'abc=' } },
    ]).map((part) => part.type),
    ['text', 'document', 'image'],
  );
  const response = interactionResponse({
    id: 'web',
    status: 'completed',
    steps: [
      {
        type: 'model_output',
        content: [
          {
            type: 'text',
            text: JSON.stringify(analysis()),
            annotations: [
              {
                type: 'url_citation',
                url: 'https://retailer.example/source',
                title: 'retailer.example',
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(response.metadata.groundingChunks[0].web.uri, 'https://retailer.example/source');
  assert.throws(
    () => interactionResponse({ ...output(analysis()), status: 'in_progress' }),
    /Incomplete/,
  );
});

test('endpoint assembles the three progressive requests with scoped catalogs and retained evidence', async () => {
  const calls = [];
  const plugin = briefAnalysisPlugin(
    {
      project: 'test',
      location: 'global',
      routingModel: 'gemini-3.8-flash',
      extractionModel: 'gemini-3.5-flash-lite',
    },
    {
      async create(params) {
        calls.push(params);
        return {
          ...output(
            calls.length === 1 ? { ...reading, ...analysis([proposal('brand', ['Glade'])]) }
              : calls.length === 2 ? analysis([proposal('requestTypes', ['EVOLVE'])])
              : analysis([proposal('evolveNeeds', ['Translation'])]),
            `call-${calls.length}`,
          ),
          usage: {
            total_input_tokens: 30,
            total_output_tokens: 20,
            total_thought_tokens: 5,
            total_tokens: 55,
          },
        };
      },
    },
    async () => {},
  );
  let middleware;
  plugin.configureServer({
    middlewares: {
      use(handler) {
        middleware = handler;
      },
    },
  });
  async function post(body) {
    const request = Readable.from([
      JSON.stringify({ notes: '', message: input.intent, dispositions: {}, ...body }),
    ]);
    Object.assign(request, {
      url: '/api/brief/analyze',
      method: 'POST',
      headers: { host: 'localhost', 'content-type': 'application/json' },
    });
    let status, result;
    await middleware(
      request,
      {
        writeHead(value) {
          status = value;
        },
        end(value) {
          result = JSON.parse(value);
        },
      },
      () => assert.fail('Unexpected next'),
    );
    assert.equal(status, 200, JSON.stringify(result));
    return result;
  }
  const first = await post({ ...input, phase: 'general-information' });
  assert.equal(first.trace.inputTokens, 30);
  const second = await post({
    ...input,
    phase: 'route-selection',
    provisionalValues: { brand: ['Glade'] },
    context: first.context,
    documents: [{ ...doc, data: '' }],
  });
  assert.equal(second.context.latestInteractionId, 'call-2');
  const third = await post({
    ...input, phase: 'route-details', context: second.context,
    provisionalValues: { brand: ['Glade'], requestTypes: ['EVOLVE'] },
    documents: [{ ...doc, data: '' }],
  });
  assert.deepEqual(third.analysis.proposals.map((item) => item.fieldId), ['evolveNeeds']);
  assert.equal(calls[0].previous_interaction_id, undefined);
  assert.equal(calls[1].previous_interaction_id, 'call-1');
  assert.notEqual(calls[0].system_instruction, calls[1].system_instruction);
  assert.equal(calls[0].store, true);
  const sent = calls.map((call) => JSON.parse(call.input[0].text));
  assert.equal(sent[0].catalog.length, 10);
  assert.deepEqual(sent[1].catalog.map((field) => field.id), ['requestTypes']);
  assert.ok(!sent[2].catalog.some((field) => ['brand', 'requestTypes', 'createDeliverables'].includes(field.id)));
  assert.equal(sent[0].routeDecisionGuide, undefined);
  assert.ok(sent[1].routeDecisionGuide);
  assert.equal(sent[2].routeDecisionGuide, undefined);
  assert.deepEqual(sent[1].sourceFacts, first.context.reading.facts);
  assert.deepEqual(sent[2].confirmed, {});
  assert.deepEqual(sent[2].provisionalValues.requestTypes, ['EVOLVE']);
  assert.equal(calls[2].previous_interaction_id, 'call-2');
  assert.equal(calls[1].input.length, 1);
  assert.equal(calls[2].input.length, 1);
  assert.deepEqual(calls[0].tools, [{ type: 'google_search' }]);
  assert.deepEqual(calls[1].tools, []);
  assert.deepEqual(calls[2].tools, []);
});
