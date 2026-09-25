import assert from 'node:assert/strict';
import test from 'node:test';
import { createDriveProjectStructure } from './drive-project.ts';

const folderMimeType = 'application/vnd.google-apps.folder';

class FakeDriveClient {
  requests = [];
  nextId = 1;
  returnedLegacyFolder = false;

  async request(options) {
    this.requests.push(options);
    if (options.method === 'GET') {
      const query = options.params?.q || '';
      if (query.includes("'project' in parents") && !query.includes('name =')) {
        if (this.returnedLegacyFolder) return { data: { files: [] } };
        this.returnedLegacyFolder = true;
        return {
          data: {
            files: [{ id: 'legacy', name: 'Agent-provided documents', mimeType: folderMimeType }],
          },
        };
      }
      if (query.includes("'legacy' in parents")) {
        return {
          data: { files: [{ id: 'legacy-file', name: 'old.pdf', mimeType: 'application/pdf' }] },
        };
      }
      return { data: { files: [] } };
    }
    if (options.method === 'POST') {
      return { data: { id: `created-${this.nextId++}`, ...options.data } };
    }
    return { data: {} };
  }
}

class ExistingProjectClient extends FakeDriveClient {
  async request(options) {
    if (options.method === 'GET' && options.params?.q?.includes('name =')) {
      this.requests.push(options);
      const name = options.params.q.match(/name = '([^']+)'/)?.[1] || 'existing';
      return {
        data: {
          files: [
            {
              id: `existing-${name}`,
              name,
              mimeType: options.params.q.includes(folderMimeType)
                ? folderMimeType
                : 'application/pdf',
            },
          ],
        },
      };
    }
    return super.request(options);
  }
}

const pdf = {
  projectName: 'SC Johnson - Ziploc - Test - IT-TEST',
  summary: 'Summary',
  status: 'Ready',
  rows: [],
};

function createdFiles(client) {
  return client.requests
    .filter((request) => request.method === 'POST' && request.data?.mimeType !== folderMimeType)
    .map((request) => request.data.name);
}

test('creates the requested folders, classifies uploads, and trashes the legacy structure', async () => {
  const client = new FakeDriveClient();
  await createDriveProjectStructure(client, {
    projectId: 'project',
    projectName: pdf.projectName,
    values: { creativeDirection: ['creative-1', 'creative-2'], assetMatrix: ['matrix-1'] },
    documents: [
      { id: 'creative-1', name: 'direction.pptx', mimeType: 'application/pdf', data: 'YQ==' },
      { id: 'creative-2', name: 'direction-2.pdf', mimeType: 'application/pdf', data: 'Yg==' },
      { id: 'matrix-1', name: 'matrix.xlsx', mimeType: 'application/pdf', data: 'Yw==' },
      { id: 'other-1', name: 'Notes.pdf', mimeType: 'application/pdf', data: 'ZA==' },
      { id: 'other-2', name: 'notes.pdf', mimeType: 'application/pdf', data: 'ZQ==' },
    ],
    pdf,
    deliverablesTemplate: Buffer.from('xlsx'),
  });

  const folders = client.requests
    .filter((request) => request.method === 'POST' && request.data?.mimeType === folderMimeType)
    .map((request) => request.data.name);
  assert.deepEqual(folders, [
    'Intake Tool Brief',
    'Brief',
    'Adapt Matrix',
    'Deliverables & Specs',
    'Working Files',
    'Other Documents',
  ]);
  assert.deepEqual(createdFiles(client), [
    'Creative Direction.pptx',
    'Creative Direction-2.pdf',
    'Asset Matrix.xlsx',
    'Notes.pdf',
    'notes-2.pdf',
    'Intake Tool Brief.pdf',
    'Deliverables & Specs Template.xlsx',
  ]);
  assert.equal(
    client.requests.filter((request) => request.method === 'PATCH' && request.data?.trashed).length,
    2,
  );
});

test('keeps key folders empty when their files were not uploaded', async () => {
  const client = new FakeDriveClient();
  await createDriveProjectStructure(client, {
    projectId: 'project',
    projectName: pdf.projectName,
    values: {},
    documents: [
      { id: 'other-1', name: 'reference.pdf', mimeType: 'application/pdf', data: 'YQ==' },
    ],
    pdf,
    deliverablesTemplate: Buffer.from('xlsx'),
  });

  assert.deepEqual(createdFiles(client), [
    'reference.pdf',
    'Intake Tool Brief.pdf',
    'Deliverables & Specs Template.xlsx',
  ]);
});

test('reuses the new structure and updates matching files when republished', async () => {
  const client = new ExistingProjectClient();
  await createDriveProjectStructure(client, {
    projectId: 'project',
    projectName: pdf.projectName,
    values: {},
    documents: [],
    pdf,
    deliverablesTemplate: Buffer.from('xlsx'),
  });

  assert.equal(client.requests.filter((request) => request.method === 'POST').length, 0);
  assert.equal(
    client.requests.filter((request) => request.method === 'PATCH' && !request.data?.trashed)
      .length,
    2,
  );
});
