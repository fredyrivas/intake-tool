import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDocumentClassifications } from './document-classification.ts';

const documents = [
  { id: 'a', name: 'Unrelated name.pdf', mimeType: 'application/pdf', data: '' },
  { id: 'b', name: 'Another upload.txt', mimeType: 'text/plain', data: '' },
  { id: 'c', name: 'Sheet.txt', mimeType: 'text/plain', data: '' },
];

test('content classifications become evidence-backed field values regardless of filenames', () => {
  const analysis = applyDocumentClassifications(
    {
      summary: 'Test',
      proposals: [],
      documentClassifications: [
        {
          documentId: 'a',
          fieldId: 'assetMatrix',
          page: 2,
          excerpt: 'Asset, version and format columns',
        },
        {
          documentId: 'b',
          fieldId: 'creativeDirection',
          page: 0,
          excerpt: 'Audience and visual direction',
        },
        {
          documentId: 'c',
          fieldId: 'contentMatrix',
          page: 0,
          excerpt: 'Message planned for each asset',
        },
      ],
      questions: [],
      conditionalRequiredFieldIds: ['firstAirDate'],
      warnings: [],
    },
    documents,
  );
  assert.deepEqual(
    analysis.proposals.map(({ fieldId, values }) => [fieldId, values]),
    [
      ['assetMatrix', ['a']],
      ['creativeDirection', ['b']],
      ['contentMatrix', ['c']],
    ],
  );
  assert.deepEqual(analysis.conditionalRequiredFieldIds, []);
});

test('an omitted file classification fails instead of marking its analysis complete', () => {
  assert.throws(
    () =>
      applyDocumentClassifications(
        {
          summary: 'Test',
          proposals: [],
          questions: [],
          warnings: [],
          documentClassifications: [{ documentId: 'a', fieldId: 'other', page: 0, excerpt: '' }],
        },
        documents,
      ),
    /Incomplete document classification/,
  );
});

test('one file can fill both matrix fields when each role has separate evidence', () => {
  const analysis = applyDocumentClassifications(
    {
      summary: 'Test',
      proposals: [],
      documentClassifications: [
        { documentId: 'a', fieldId: 'other', page: 0, excerpt: '' },
        { documentId: 'b', fieldId: 'other', page: 0, excerpt: '' },
        { documentId: 'c', fieldId: 'contentMatrix', page: 0, excerpt: 'Message per asset' },
        {
          documentId: 'c',
          fieldId: 'assetMatrix',
          page: 0,
          excerpt: 'Format and market per asset',
        },
      ],
      questions: [],
      warnings: [],
    },
    documents,
  );
  assert.deepEqual(
    analysis.proposals.map(({ fieldId }) => fieldId),
    ['contentMatrix', 'assetMatrix'],
  );
});

test('only newly supplied document content needs classification', () => {
  const analysis = applyDocumentClassifications(
    {
      summary: 'Test',
      proposals: [],
      questions: [],
      warnings: [],
      documentClassifications: [
        { documentId: 'b', fieldId: 'creativeDirection', page: 0, excerpt: 'Visual direction' },
      ],
    },
    documents,
    [documents[1]],
  );
  assert.deepEqual(
    analysis.proposals.map(({ fieldId, values }) => [fieldId, values]),
    [['creativeDirection', ['b']]],
  );
});

test('ignores repeated classifications when only document references are sent', () => {
  const analysis = applyDocumentClassifications(
    {
      summary: 'Continue with the missing fields.',
      proposals: [],
      questions: [],
      warnings: [],
      documentClassifications: [
        { documentId: 'a', fieldId: 'creativeDirection', page: 1, excerpt: 'Earlier evidence' },
      ],
    },
    documents,
    [],
  );
  assert.deepEqual(analysis.proposals, []);
});
