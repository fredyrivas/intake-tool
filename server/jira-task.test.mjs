import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJiraPreview } from './jira-task.ts';

const id = '7a0260c1-aa54-4a88-9834-de9f6d2fd84c';
const title = 'SC Johnson - Ziploc - FY27 Holiday Print Bags eComm - IT-7A0260C1';
const folder = (name) => ({ id: name, url: `https://drive.google.com/drive/folders/${name}` });
const drive = {
  fingerprint: 'published-brief',
  root: folder('project'),
  folders: {
    brief: folder('creative'),
    adaptMatrix: folder('matrix'),
    deliverablesAndSpecs: folder('specs'),
    workingFiles: folder('working'),
  },
  warnings: ['Creative Direction was not supplied with the current brief.'],
};

test('Jira description contains only the nine agreed rows and Drive links', () => {
  const brief = {
    id,
    name: title,
    draft: {
      values: {
        projectName: [title],
        brand: ['Ziploc', 'Raid'],
        region: ['USA'],
        assetType: ['ATL'],
        requestTypes: ['EVOLVE'],
        expectedDeliveryDate: ['2026-09-17'],
        totalAssets: ['6'],
        notes: ['Please use approved artwork.\nNo open files needed.'],
        mainApproverEmail: ['approver@example.com'],
        deliveryTypes: ['Directly to SCJ marketer', 'Ecomm (Salsify)'],
      },
    },
    documents: [],
  };
  const preview = buildJiraPreview(brief, drive, 'http://localhost:5173/', '2026-09-18');

  assert.equal(preview.summary, title);
  assert.equal(preview.dueDate, '2026-09-17');
  assert.deepEqual(
    preview.rows.map((row) => row.label),
    [
      'Workspace Order',
      'Brief',
      'Adapt Matrix',
      'Note from client',
      'Deliverables & Specs',
      'Working Files',
      'Schedule',
      'Approvers',
      'Delivery contacts',
    ],
  );
  assert.equal(preview.rows[0].url, `http://localhost:5173/review?brief=${id}`);
  assert.equal(preview.rows[1].url, drive.folders.brief.url);
  assert.equal(preview.rows[2].url, drive.folders.adaptMatrix.url);
  assert.equal(preview.rows[4].url, drive.folders.deliverablesAndSpecs.url);
  assert.equal(preview.rows[5].url, drive.folders.workingFiles.url);
  assert.equal(preview.rows[6].value, '');
  assert.equal(preview.rows[7].value, 'approver@example.com');
  assert.equal(preview.rows[8].value, 'Directly to SCJ marketer, Ecomm (Salsify)');
  assert.equal(preview.description.content.length, 9);
  assert.deepEqual(preview.description.content[0].content[1].marks[0], {
    type: 'link',
    attrs: { href: `http://localhost:5173/review?brief=${id}` },
  });
  assert.ok(preview.description.content[3].content.some((node) => node.type === 'hardBreak'));
  assert.doesNotMatch(
    JSON.stringify(preview.description),
    /Total number of assets|Original request|6 assets/,
  );
  assert.ok(preview.warnings.some((warning) => warning.includes('Creative Direction')));
  assert.ok(preview.warnings.some((warning) => warning.includes('has passed')));
  assert.ok(preview.labels.includes(`intake-brief-${id}`));
  assert.ok(preview.labels.includes('brand-ziploc'));
  assert.ok(preview.labels.includes('brand-raid'));
  assert.ok(preview.labels.includes('region-north-america'));
  assert.ok(preview.labels.includes('country-usa'));
  assert.ok(preview.labels.includes('asset-atl'));
});

test('Changing the Drive publication changes the Jira preview fingerprint', () => {
  const brief = { id, name: title, draft: { values: {} }, documents: [] };
  const before = buildJiraPreview(brief, drive, 'http://localhost:5173');
  const after = buildJiraPreview(
    brief,
    { ...drive, fingerprint: 'new-publication' },
    'http://localhost:5173',
  );
  assert.notEqual(before.fingerprint, after.fingerprint);
});

test('Known Intake Tool countries and asset types map to Jira classification labels', () => {
  const brief = {
    id,
    name: title,
    draft: { values: { region: ['Canada'], assetType: ['Shopper'] } },
    documents: [],
  };
  const preview = buildJiraPreview(brief, drive, 'http://localhost:5173');
  assert.ok(preview.labels.includes('region-north-america'));
  assert.ok(preview.labels.includes('country-canada'));
  assert.ok(preview.labels.includes('workstream-shopper'));
});
