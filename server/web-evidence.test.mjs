import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRetailerWebEvidence } from './web-evidence.ts';

test('uses the cited redirect URL when the model names the direct retailer site', () => {
  const source = {
    kind: 'document',
    documentId: 'deck',
    page: 1,
    excerpt: 'ALB and an Albertsons logo on slide 1',
    webUrl: 'https://www.albertsons.com/about',
  };
  const analysis = {
    summary: 'Adapt assets for Albertsons.',
    proposals: [{ fieldId: 'mediaPlacementRetailer', values: ['Albertsons'], source }],
    warnings: [],
  };
  const citedUrl = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/123';
  const metadata = { groundingChunks: [{ web: { uri: citedUrl, title: 'albertsons.com' } }] };

  assert.equal(
    validateRetailerWebEvidence(analysis, metadata).proposals[0].source.webUrl,
    citedUrl,
  );
  assert.deepEqual(validateRetailerWebEvidence(analysis), {
    ...analysis,
    proposals: [
      {
        ...analysis.proposals[0],
        source: { kind: 'document', documentId: 'deck', page: 1, excerpt: source.excerpt },
      },
    ],
    warnings: [],
  });
});

test('omits an acronym-only retailer guess without document or search evidence', () => {
  const analysis = {
    summary: 'Adapt assets for this retailer.',
    proposals: [
      {
        fieldId: 'mediaPlacementRetailer',
        values: ['Albertsons'],
        source: {
          kind: 'document',
          documentId: 'deck',
          page: 1,
          excerpt: 'ALB',
          webUrl: 'https://www.albertsons.com',
        },
      },
    ],
    warnings: [],
  };
  const result = validateRetailerWebEvidence(analysis);
  assert.deepEqual(result.proposals, []);
  assert.match(result.warnings[0], /could not be verified/);
});

test('uses a grounding support attached to the retailer claim', () => {
  const analysis = {
    proposals: [
      {
        fieldId: 'mediaPlacementRetailer',
        values: ['Albertsons'],
        source: { kind: 'document', excerpt: 'Albertsons logo', webUrl: 'https://albertsons.com' },
      },
    ],
    warnings: [],
  };
  const citedUrl = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/456';
  const metadata = {
    groundingChunks: [{ web: { uri: citedUrl, title: 'About Us' } }],
    groundingSupports: [
      { segment: { text: 'Albertsons is the retailer.' }, groundingChunkIndices: [0] },
    ],
  };
  assert.equal(
    validateRetailerWebEvidence(analysis, metadata).proposals[0].source.webUrl,
    citedUrl,
  );
});

test('ignores empty web URLs on ordinary proposals', () => {
  const analysis = {
    summary: 'Adapt the campaign.',
    proposals: [
      {
        fieldId: 'brand',
        values: ['Glade'],
        source: { kind: 'note', documentId: '', page: 0, excerpt: 'Glade', webUrl: '' },
      },
    ],
    warnings: [],
  };
  const result = validateRetailerWebEvidence(analysis);
  assert.deepEqual(result.proposals[0].source, {
    kind: 'note',
    documentId: '',
    page: 0,
    excerpt: 'Glade',
  });
  assert.deepEqual(result.warnings, []);
});
