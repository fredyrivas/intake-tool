import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fields,
  activeFields,
  cleanValues,
  validValue,
  parseAnalysis,
  acceptedFileMimeType,
  generatedProjectName,
  analysisForActivePath,
  presentationMimeType,
  spreadsheetMimeType,
} from './brief-contract.ts';
import { canonicalProjectId } from '../server/brief-storage.ts';
const byId = (id) => fields.find((f) => f.id === id);
const pdf = { id: 'test-pdf', name: 'test.pdf', mimeType: 'application/pdf', data: '' };

test('link fields accept domains with or without an HTTP protocol', () => {
  const field = byId('links');
  assert.equal(validValue(field, ['example.com', 'drive.example.co.uk/folder'], []), true);
  assert.equal(validValue(field, ['https://example.com/path', 'http://example.org'], []), true);
  assert.equal(validValue(field, ['example', 'https://localhost'], []), false);
  assert.equal(validValue(field, ['ftp://example.com'], []), false);
});

test('Office uploads normalize their MIME type when a browser omits it', () => {
  assert.equal(acceptedFileMimeType('Campaign.PPTX', ''), presentationMimeType);
  assert.equal(
    acceptedFileMimeType('matrix.xlsx', 'application/octet-stream'),
    spreadsheetMimeType,
  );
  assert.equal(acceptedFileMimeType('unknown.docx', ''), null);
});

test('saved AI copy displays BOS and VIZIT in uppercase', () => {
  const analysis = parseAnalysis(
    {
      summary: 'Upload to bos and check vizit.',
      proposals: [],
      questions: [
        {
          fieldId: 'vizitLink',
          prompt: 'What is the bos vizit folder link?',
          context: 'Add the bos folder in vizit.',
          options: ['Available', 'Not available'],
        },
      ],
      warnings: ['Check bos and vizit.'],
    },
    [],
  );
  assert.equal(analysis.summary, 'Upload to BOS and check VIZIT.');
  assert.equal(analysis.questions[0].prompt, 'What is the BOS VIZIT folder link?');
  assert.equal(analysis.questions[0].context, 'Add the BOS folder in VIZIT.');
  assert.deepEqual(analysis.warnings, ['Check BOS and VIZIT.']);
});

test('project names use the SC Johnson taxonomy and retain their stable identifier', () => {
  assert.equal(
    generatedProjectName(
      {
        brand: ['Glade'],
        projectTitle: ['Falliday 9.13 Banners'],
      },
      '7a0260c1',
    ),
    'SC Johnson - Glade - Falliday 9.13 Banners - IT-7A0260C1',
  );
  assert.equal(
    generatedProjectName(
      {
        brand: ['Glade', 'Raid'],
        projectTitle: ['Cross-brand campaign'],
      },
      '7a0260c1',
    ),
    'SC Johnson - Glade + Raid - Cross-brand campaign - IT-7A0260C1',
  );
  assert.match(generatedProjectName({}), /Brand pending.*Project title pending.*IT-PENDING/);
});

test('project identifiers extend only when an existing brief owns the short prefix', () => {
  assert.equal(
    canonicalProjectId('7a0260c1-aa54-4a88-9834-de9f6d2fd84c', new Set()),
    'IT-7A0260C1',
  );
  assert.equal(
    canonicalProjectId('7a0260c1-ba54-4a88-9834-de9f6d2fd84c', new Set(['IT-7A0260C1'])),
    'IT-7A0260C1B',
  );
});

test('changing a route deactivates its conditional fields and removes stale AI context', () => {
  const input = {
    requestTypes: ['CREATE'],
    createDeliverables: ['Big idea production'],
    evolveNeeds: ['VO recording'],
    buyoutDetails: ['1 year'],
  };
  assert.equal(
    activeFields(input).some((f) => f.id === 'buyoutDetails'),
    false,
  );
  assert.deepEqual(cleanValues(input, []), {
    requestTypes: ['CREATE'],
    createDeliverables: ['Big idea production'],
  });
  assert.equal(
    activeFields({ requestTypes: ['EVOLVE'], evolveNeeds: ['VO recording'] }).some(
      (f) => f.id === 'buyoutDetails',
    ),
    true,
  );
});
test('a brief can keep multiple routes and model output is constrained to their active branches', () => {
  assert.equal(validValue(byId('requestTypes'), ['CREATE', 'EVOLVE'], []), true);
  assert.equal(validValue(byId('requestTypes'), ['ACCELERATE'], []), true);

  const source = { kind: 'interpretation', documentId: '', page: 0, excerpt: 'Test' };
  const analysis = {
    summary: 'Test',
    proposals: [
      { fieldId: 'requestTypes', values: ['ACCELERATE'], source },
      { fieldId: 'accelerateDeliverables', values: ['eComm Video'], source },
      { fieldId: 'videoSpecs', values: ['16:9 video'], source },
      { fieldId: 'businessContext', values: ['Wrong CREATE branch'], source },
    ],
    questions: [
      { fieldId: 'videoSpecs', prompt: 'Specs?', options: ['Known', 'Pending'] },
      {
        fieldId: 'supportingReferences',
        prompt: 'Supporting file?',
        options: ['Known', 'Pending'],
      },
      {
        fieldId: 'supportingLinks',
        prompt: 'Supporting link?',
        options: ['Known', 'Pending'],
      },
      { fieldId: 'audience', prompt: 'Audience?', options: ['Known', 'Pending'] },
    ],
    warnings: [],
  };

  const scoped = analysisForActivePath(analysis, {});
  assert.deepEqual(
    scoped.proposals.map((proposal) => proposal.fieldId),
    ['requestTypes', 'accelerateDeliverables', 'videoSpecs'],
  );
  assert.deepEqual(
    scoped.questions.map((question) => question.fieldId),
    ['videoSpecs', 'supportingReferences'],
  );

  const confirmed = analysisForActivePath(analysis, { requestTypes: ['CREATE'] });
  assert.deepEqual(
    confirmed.proposals.map((proposal) => proposal.fieldId),
    ['businessContext'],
  );
  assert.deepEqual(
    confirmed.questions.map((question) => question.fieldId),
    ['audience'],
  );

  const fulfilledAlternative = analysisForActivePath(analysis, {
    requestTypes: ['ACCELERATE'],
    accelerateDeliverables: ['eComm Video'],
    supportingLinks: ['https://drive.example.com/references'],
  });
  assert.deepEqual(
    fulfilledAlternative.questions.map((question) => question.fieldId),
    ['videoSpecs'],
  );

  const combined = activeFields({ requestTypes: ['CREATE', 'EVOLVE'] });
  assert.equal(
    combined.some((field) => field.id === 'businessContext'),
    true,
  );
  assert.equal(
    combined.some((field) => field.id === 'evolveDeliverables'),
    true,
  );
});
test('document-role proposals remain on the active route even when filenames are unrelated', () => {
  const documents = [
    { ...pdf, id: 'spreadsheet-like-file', name: 'Q3 deliverables.pdf' },
    { ...pdf, id: 'deck-like-file', name: 'Client upload.pdf' },
  ];
  const analysis = {
    summary: 'Test',
    proposals: [
      {
        fieldId: 'requestTypes',
        values: ['EVOLVE'],
        source: { kind: 'interpretation', documentId: '', page: 0, excerpt: 'Adaptation work' },
      },
      {
        fieldId: 'assetMatrix',
        values: ['spreadsheet-like-file'],
        source: {
          kind: 'document',
          documentId: 'spreadsheet-like-file',
          page: 1,
          excerpt: 'Asset, format, market and delivery columns',
        },
      },
      {
        fieldId: 'creativeDirection',
        values: ['deck-like-file'],
        source: {
          kind: 'document',
          documentId: 'deck-like-file',
          page: 1,
          excerpt: 'Creative objective, tone and visual references',
        },
      },
    ],
    questions: [],
    warnings: [],
  };

  assert.deepEqual(
    analysisForActivePath(analysis, {}).proposals.map((proposal) => proposal.fieldId),
    ['requestTypes', 'assetMatrix', 'creativeDirection'],
  );
  assert.deepEqual(parseAnalysis(analysis, documents), {
    ...analysis,
    conditionalRequiredFieldIds: [],
  });
});
test('classified document proposals suppress repeated questions about their resource', () => {
  const analysis = {
    summary: 'Test',
    proposals: [
      {
        fieldId: 'assetMatrix',
        values: ['test-pdf'],
        source: { kind: 'document', documentId: 'test-pdf', page: 1, excerpt: 'Asset rows' },
      },
    ],
    questions: [
      {
        fieldId: 'assetMatrixLink',
        prompt: 'Can you provide the asset matrix?',
        options: ['Ready', 'Later'],
      },
    ],
    warnings: [],
  };
  assert.deepEqual(analysisForActivePath(analysis, { requestTypes: ['EVOLVE'] }).questions, []);
});
test('translation and stock activate only with matching parent routes', () => {
  assert.equal(
    activeFields({ requestTypes: ['CREATE'], evolveNeeds: ['Translation'] }).some(
      (f) => f.id === 'translationLanguage',
    ),
    false,
  );
  assert.equal(
    activeFields({ requestTypes: ['ACCELERATE'], accelerateNeeds: ['Translation'] }).some(
      (f) => f.id === 'translationLanguage',
    ),
    true,
  );
  assert.equal(
    activeFields({ requestTypes: ['EVOLVE'], evolveNeeds: ['Stock materials'] }).some(
      (f) => f.id === 'stockAvailability',
    ),
    true,
  );
  assert.equal(
    activeFields({
      requestTypes: ['EVOLVE'],
      evolveNeeds: ['Stock materials'],
      stockAvailability: ['I have stock materials'],
    }).some((f) => f.id === 'stockMaterialsLink'),
    true,
  );
});
test('diagram-backed asset subtype and translation catalogs stay constrained', () => {
  assert.equal(byId('assetSubtype')?.type, 'multi');
  assert.deepEqual(byId('assetSubtype')?.options, [
    'Base+ tiles',
    'Beauty Shots',
    'Brand store assets',
    'Collection video',
    'Mobile hero images',
    'Enhanced content',
    'Marketing copy',
  ]);
  assert.equal(byId('translationLanguage')?.type, 'multi');
  assert.deepEqual(byId('translationLanguage')?.options, [
    'US_EN',
    'US_ES',
    'CA_EN',
    'CA_FR',
    'PR_ES',
    'PR_EN',
    'DO_ES',
    'Other',
  ]);
});
test('values enforce exact catalogs, date validity, count and document identity', () => {
  assert.equal(byId('brand')?.type, 'multi');
  assert.equal(validValue(byId('brand'), ['Glade', 'Raid'], []), true);
  assert.equal(validValue(byId('requestTypes'), ['MADE UP'], []), false);
  assert.equal(validValue(byId('evolveNeeds'), ['__none__', 'Translation'], []), false);
  assert.equal(validValue(byId('assetSubtype'), ['Base+ tiles'], []), true);
  assert.equal(validValue(byId('assetSubtype'), ['PDP assets'], []), false);
  assert.equal(validValue(byId('assetSubtype'), ['Unlisted subtype'], []), false);
  assert.equal(validValue(byId('translationLanguage'), ['US_EN', 'CA_FR'], []), true);
  assert.equal(validValue(byId('translationLanguage'), ['MX_ES'], []), false);
  assert.equal(validValue(byId('expectedDeliveryDate'), ['2026-02-30'], []), false);
  assert.equal(validValue(byId('totalAssets'), ['0'], []), false);
  assert.equal(validValue(byId('creativeDirection'), ['missing'], [pdf]), false);
  assert.equal(validValue(byId('creativeDirection'), ['test-pdf'], [pdf]), true);
  assert.equal(byId('creativeDirection')?.required, true);
  assert.equal(validValue(byId('mainApproverEmail'), ['not-an-email'], []), false);
  assert.equal(validValue(byId('mainApproverEmail'), ['approver@example.com'], []), true);
  assert.equal(
    validValue(byId('reviewerEmails'), ['one@example.com', 'two@example.com'], []),
    true,
  );
});
test('clarification questions expose every available catalog option', () => {
  const analysis = {
    summary: 'Test',
    proposals: [],
    questions: [
      {
        fieldId: 'brand',
        prompt: 'Which brands apply?',
        context: 'The brand determines which team owns the request.',
        options: ['Glade', 'Raid'],
      },
    ],
    warnings: [],
  };
  assert.deepEqual(parseAnalysis(analysis, []).questions[0].options, byId('brand').options);
  assert.equal(parseAnalysis(analysis, []).questions[0].context, analysis.questions[0].context);
  assert.throws(() =>
    parseAnalysis(
      { ...analysis, questions: [{ ...analysis.questions[0], context: 'x'.repeat(301) }] },
      [],
    ),
  );
  assert.equal(
    parseAnalysis({ ...analysis, questions: Array(60).fill(analysis.questions[0]) }, []).questions
      .length,
    60,
  );
  assert.throws(() =>
    parseAnalysis({ ...analysis, questions: Array(61).fill(analysis.questions[0]) }, []),
  );
});
test('model output cannot add contacts, unknown fields or unsourced PDF evidence', () => {
  const a = {
    summary: 'Test',
    proposals: [
      {
        fieldId: 'totalAssets',
        values: ['6'],
        source: { kind: 'document', documentId: 'test-pdf', page: 1, excerpt: 'Six assets' },
      },
    ],
    questions: [],
    warnings: [],
  };
  assert.deepEqual(parseAnalysis(a, [pdf]), { ...a, conditionalRequiredFieldIds: [] });
  assert.throws(() =>
    parseAnalysis({ ...a, proposals: [{ ...a.proposals[0], fieldId: 'mainApproverEmail' }] }, [
      pdf,
    ]),
  );
  assert.throws(() =>
    parseAnalysis(
      { ...a, proposals: [{ ...a.proposals[0], source: { ...a.proposals[0].source, page: 0 } }] },
      [pdf],
    ),
  );
});
test('private and arbitrary fields are excluded from structured model context', () => {
  assert.deepEqual(
    cleanValues(
      {
        brand: ['Glade'],
        mainApproverEmail: ['private@example.com'],
        reviewerEmails: ['other@example.com'],
        deliveryContacts: ['private'],
        requester: ['name'],
      },
      [],
    ),
    {
      brand: ['Glade'],
      mainApproverEmail: ['private@example.com'],
      reviewerEmails: ['other@example.com'],
    },
  );
});
