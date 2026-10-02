import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readAnalysisRequest, selectModel } from './brief-analysis.ts';
import { analysisSchemaForPhase } from './brief-instruction.ts';
import { parseAnalysis } from '../shared/brief-contract.ts';

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

test('uses the fixed extraction model with LOW thinking for every phase', () => {
  for (const phase of ['document-reading', 'scope', 'document-enrichment', 'follow-up', 'final-review']) {
    const selection = selectModel(request(phase), config);
    assert.equal(selection.model, 'gemini-3.5-flash-lite', phase);
    assert.equal(selection.thinkingLevel, 'LOW', phase);
  }
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

test('keeps the same model and thinking for retailer ambiguity, route changes and incomplete reviews', () => {
  const cases = [
    request('document-enrichment', { requestTypes: ['EVOLVE'] }),
    request('document-enrichment', { requestTypes: ['EVOLVE'], mediaPlacementRetailer: ['Walmart'] }),
    request('follow-up', { requestTypes: ['EVOLVE'] }, 'Please change route'),
    request('final-review', { requestTypes: ['EVOLVE'] }),
    request('final-review', { requestTypes: ['EVOLVE'] }, '', { region: 'pending' }),
  ];
  for (const input of cases) {
    const selection = selectModel(input, config);
    assert.equal(selection.model, 'gemini-3.5-flash-lite');
    assert.equal(selection.thinkingLevel, 'LOW');
  }
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
