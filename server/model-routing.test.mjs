import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readAnalysisRequest, selectModel } from './brief-analysis.ts';
import { analysisSchemaForPhase } from './brief-instruction.ts';
import { fields, parseAnalysis } from '../shared/brief-contract.ts';

const config = {
  routingModel: 'gemini-3.8-flash',
  extractionModel: 'gemini-3.5-flash-lite',
};

const request = (phase, values = {}, message = '', dispositions = {}) => ({
  phase,
  values,
  message,
  dispositions,
});

test('uses the strongest model for initial scope routing', () => {
  const selection = selectModel(request('scope'), config);
  assert.equal(selection.model, config.routingModel);
  assert.equal(selection.thinkingLevel, 'MEDIUM');
});

test('analysis omits conditional requirement decisions in every phase', () => {
  const schema = analysisSchemaForPhase('scope');
  assert.ok(!schema.required.includes('conditionalRequiredFieldIds'));
  assert.ok(!('conditionalRequiredFieldIds' in schema.properties));
  const analysis = parseAnalysis(
    {
      summary: 'Adapt the existing assets.',
      proposals: [],
      questions: [],
      warnings: [],
    },
    [],
  );
  assert.deepEqual(analysis.conditionalRequiredFieldIds, []);
  for (const phase of ['follow-up', 'final-review']) {
    assert.deepEqual(analysisSchemaForPhase(phase).required, schema.required);
    assert.ok(!('conditionalRequiredFieldIds' in analysisSchemaForPhase(phase).properties));
  }
});

test('uses more thinking for document classification than routine follow-up', () => {
  const enrichment = selectModel(
    request('document-enrichment', {
      requestTypes: ['EVOLVE'],
      mediaPlacementRetailer: ['Walmart'],
    }),
    config,
  );
  assert.equal(enrichment.model, config.extractionModel);
  assert.equal(enrichment.thinkingLevel, 'LOW');
  const followUp = selectModel(request('follow-up', { requestTypes: ['EVOLVE'] }), config);
  assert.equal(followUp.model, config.extractionModel);
  assert.equal(followUp.thinkingLevel, 'MINIMAL');
});

test('uses the search-capable routing model when documents may resolve a missing retailer', () => {
  const selection = selectModel(
    request('document-enrichment', { requestTypes: ['EVOLVE'] }),
    config,
  );
  assert.equal(selection.model, config.routingModel);
  assert.equal(selection.thinkingLevel, 'LOW');
});

test('escalates route reinterpretation and inconsistent final reviews', () => {
  const reinterpretation = selectModel(
    request('follow-up', { requestTypes: ['EVOLVE'] }, 'Please change route'),
    config,
  );
  assert.equal(reinterpretation.model, config.routingModel);
  assert.equal(reinterpretation.thinkingLevel, 'MEDIUM');

  const incompleteReview = selectModel(
    request('final-review', { requestTypes: ['EVOLVE'] }),
    config,
  );
  assert.equal(incompleteReview.model, config.routingModel);
  assert.equal(incompleteReview.thinkingLevel, 'LOW');
  const completeExceptRegion = Object.fromEntries(
    fields
      .filter((field) => field.required && field.id !== 'region')
      .map((field) => [field.id, ['provided']]),
  );
  const pendingReview = selectModel(
    request('final-review', completeExceptRegion, '', {
      region: 'pending',
    }),
    config,
  );
  assert.equal(pendingReview.model, config.routingModel);
});

test('follow-up accepts document references without resending file contents', async () => {
  const input = {
    phase: 'follow-up',
    documents: [{ id: 'doc1', name: 'Direction.txt', mimeType: 'text/plain', data: '' }],
    values: { creativeDirection: ['doc1'] },
    notes: '',
    message: '',
  };
  const parsed = await readAnalysisRequest(Readable.from([JSON.stringify(input)]));
  assert.deepEqual(parsed.values.creativeDirection, ['doc1']);
  assert.equal(parsed.documents[0].data, '');
  await assert.rejects(
    readAnalysisRequest(Readable.from([JSON.stringify({ ...input, phase: 'document-reading' })])),
    /Invalid file/,
  );
});
