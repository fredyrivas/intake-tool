import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { driveFingerprint } from './drive-record.ts';
import { jiraIntegrationPlugin } from './jira-integration.ts';

const id = '7a0260c1-aa54-4a88-9834-de9f6d2fd84c';
const folder = (name) => ({ id: name, url: `https://drive.google.com/drive/folders/${name}` });

test('Jira requires Drive first, creates one Task, and uploads no attachments', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'intake-jira-test-'));
  const briefDirectory = path.join(root, 'briefs', id);
  await mkdir(briefDirectory, { recursive: true });
  const brief = {
    id,
    name: 'SC Johnson - Ziploc - Test - IT-7A0260C1',
    draft: {
      values: {
        projectName: ['SC Johnson - Ziploc - Test - IT-7A0260C1'],
        projectTitle: ['Test'],
        brand: ['Ziploc'],
        expectedDeliveryDate: ['2026-09-18'],
      },
    },
    documents: [],
  };
  await writeFile(path.join(briefDirectory, 'brief.json'), JSON.stringify(brief));

  let middleware;
  const plugin = jiraIntegrationPlugin(
    {
      cloudId: 'test-cloud',
      projectKey: 'TEST',
      issueTypeId: '33921',
      token: 'test-token',
      siteUrl: 'https://example.atlassian.net',
      intakeToolBaseUrl: 'http://localhost:5173',
    },
    root,
  );
  plugin.configureServer({
    middlewares: {
      use(handler) {
        middleware = handler;
      },
    },
  });
  const request = async (method, suffix) => {
    let status;
    let body;
    await middleware(
      { method, url: `/api/briefs/${id}/jira${suffix}`, headers: { host: 'localhost:5173' } },
      {
        writeHead(code) {
          status = code;
        },
        end(data) {
          body = JSON.parse(data);
        },
      },
      () => assert.fail('The Jira middleware did not handle the request.'),
    );
    return { status, body };
  };

  const originalFetch = globalThis.fetch;
  try {
    assert.equal((await request('GET', '')).status, 404);
    assert.equal((await request('GET', '/preview')).status, 409);
    assert.equal((await request('POST', '')).status, 409);

    const drive = {
      fingerprint: driveFingerprint(brief),
      root: folder('project'),
      folders: {
        brief: folder('creative'),
        adaptMatrix: folder('matrix'),
        deliverablesAndSpecs: folder('specs'),
        workingFiles: folder('working'),
      },
      warnings: [],
    };
    await writeFile(path.join(briefDirectory, 'drive.json'), JSON.stringify(drive));
    const preview = await request('GET', '/preview');
    assert.equal(preview.status, 200);
    assert.equal(preview.body.rows.length, 9);

    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), method: options?.method });
      if (String(url).endsWith('/search/jql'))
        return new Response(JSON.stringify({ issues: [] }), { status: 200 });
      if (String(url).endsWith('/issue'))
        return new Response(JSON.stringify({ id: '123', key: 'TEST-1' }), { status: 201 });
      assert.fail(`Unexpected Jira endpoint: ${url}`);
    };
    const created = await request('POST', '');
    assert.equal(created.status, 200);
    assert.equal(created.body.existing.key, 'TEST-1');
    assert.deepEqual((await request('GET', '')).body, {
      key: 'TEST-1',
      url: 'https://example.atlassian.net/browse/TEST-1',
    });
    await writeFile(path.join(briefDirectory, 'drive.json'), JSON.stringify({
      ...drive,
      fingerprint: 'outdated',
    }));
    const callsBeforeLookup = calls.length;
    assert.equal((await request('GET', '')).status, 200);
    assert.equal(calls.length, callsBeforeLookup);
    assert.equal((await request('GET', '/preview')).status, 409);
    await writeFile(path.join(briefDirectory, 'drive.json'), JSON.stringify(drive));
    const repeated = await request('POST', '');
    assert.equal(repeated.status, 200);
    assert.equal(calls.filter((call) => call.url.endsWith('/issue')).length, 1);
    assert.equal(
      calls.some((call) => call.url.includes('/attachments')),
      false,
    );
    assert.equal(
      JSON.parse(await readFile(path.join(briefDirectory, 'jira.json'), 'utf8')).key,
      'TEST-1',
    );
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true });
  }
});
