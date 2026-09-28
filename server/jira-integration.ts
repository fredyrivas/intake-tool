import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { driveFingerprint, readDriveRecord } from './drive-record.ts';
import { buildJiraPreview, type JiraBrief, type JiraPreview } from './jira-task.ts';

type JiraConfig = {
  cloudId: string;
  projectKey: string;
  issueTypeId: string;
  token: string;
  siteUrl: string;
  intakeToolBaseUrl: string;
};

type JiraRecord = {
  phase: 'creating' | 'created';
  fingerprint: string;
  key?: string;
  issueId?: string;
  url?: string;
};

function reply(response: ServerResponse, status: number, data: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

function isLocalRequest(request: IncomingMessage) {
  const host = request.headers.host || '';
  return (
    /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) &&
    (!request.headers.origin || request.headers.origin === `http://${host}`)
  );
}

function publicPreview(preview: JiraPreview, record: JiraRecord | null) {
  const { description: _description, ...display } = preview;
  void _description;
  return {
    ...display,
    existing:
      record?.phase === 'created'
        ? {
            key: record.key,
            url: record.url,
            briefChanged: record.fingerprint !== preview.fingerprint,
          }
        : null,
    creating: record?.phase === 'creating',
  };
}

export function jiraIntegrationPlugin(config: JiraConfig, rootDirectory = process.cwd()): Plugin {
  const busy = new Set<string>();
  const base = `https://api.atlassian.com/ex/jira/${config.cloudId}/rest/api/3`;
  const briefFile = (id: string) => path.join(rootDirectory, 'briefs', id, 'brief.json');
  const recordFile = (id: string) => path.join(rootDirectory, 'briefs', id, 'jira.json');

  async function jiraRequest(resource: string, init: RequestInit = {}) {
    const response = await fetch(`${base}${resource}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
        ...init.headers,
      },
    });
    if (!response.ok) {
      const error = new Error(`Jira returned HTTP ${response.status}.`) as Error & {
        status: number;
      };
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async function readRecord(id: string): Promise<JiraRecord | null> {
    try {
      return JSON.parse(await readFile(recordFile(id), 'utf8')) as JiraRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async function saveRecord(id: string, record: JiraRecord) {
    const temporary = `${recordFile(id)}.tmp`;
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    await rename(temporary, recordFile(id));
  }

  async function markPublished(id: string) {
    const file = briefFile(id);
    const brief = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
    const publication = (brief.publication as Record<string, boolean> | undefined) || {};
    if (publication.jira) return;
    const temporary = `${file}.tmp`;
    await writeFile(
      temporary,
      `${JSON.stringify({ ...brief, publication: { ...publication, jira: true } }, null, 2)}\n`,
      'utf8',
    );
    await rename(temporary, file);
  }

  async function findExistingIssue(preview: JiraPreview) {
    const label = `intake-brief-${preview.briefId}`;
    const response = await jiraRequest('/search/jql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: `project = ${config.projectKey} AND labels = "${label}"`,
        fields: ['summary'],
        maxResults: 2,
      }),
    });
    const result = (await response.json()) as { issues?: { id: string; key: string }[] };
    return result.issues?.[0] || null;
  }

  return {
    name: 'local-jira-integration',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split('?')[0] || '';
        if (!pathname.includes('/jira')) return next();
        const match = pathname.match(/^\/api\/briefs\/([a-f0-9-]{36})\/jira\/preview$/);
        const createMatch = pathname.match(/^\/api\/briefs\/([a-f0-9-]{36})\/jira$/);
        if (!match && !createMatch) return next();
        if (!isLocalRequest(request))
          return reply(response, 403, { error: 'Local requests only.' });
        if (createMatch && request.method === 'GET') {
          try {
            const record = await readRecord(createMatch[1]);
            if (record?.phase !== 'created' || !record.key || !record.url)
              return reply(response, 404, { error: 'Jira Task not found.' });
            return reply(response, 200, { key: record.key, url: record.url });
          } catch (error) {
            return reply(response, 502, {
              error: error instanceof Error ? error.message : 'Could not load the Jira Task.',
            });
          }
        }
        if (!config.cloudId || !config.projectKey || !config.token)
          return reply(response, 503, { error: 'Jira is not configured.' });
        if (match && request.method !== 'GET')
          return reply(response, 405, { error: 'Method not allowed.' });
        if (createMatch && request.method !== 'POST')
          return reply(response, 405, { error: 'Method not allowed.' });
        const id = (match || createMatch)![1];
        if (busy.has(id))
          return reply(response, 409, { error: 'A Jira request is already in progress.' });

        try {
          const brief = JSON.parse(await readFile(briefFile(id), 'utf8')) as JiraBrief;
          const drive = await readDriveRecord(rootDirectory, id);
          if (!drive)
            return reply(response, 409, {
              error: 'Create the Drive project before previewing Jira.',
            });
          if (drive.fingerprint !== driveFingerprint(brief))
            return reply(response, 409, {
              error: 'Update the Drive project before previewing Jira.',
            });
          const preview = buildJiraPreview(brief, drive, config.intakeToolBaseUrl);
          let record = await readRecord(id);
          if (match) return reply(response, 200, publicPreview(preview, record));
          if (!brief.draft.values?.brand?.[0] || !brief.draft.values?.projectTitle?.[0])
            return reply(response, 422, {
              error: 'A brand and project title are required before creating a Jira Task.',
            });

          busy.add(id);
          if (record?.phase === 'creating') {
            const existing = await findExistingIssue(preview);
            if (!existing)
              return reply(response, 409, {
                error:
                  'A previous Jira creation may have succeeded. Check Jira using the brief ID before retrying.',
              });
            record = {
              phase: 'created',
              fingerprint: record.fingerprint,
              key: existing.key,
              issueId: existing.id,
              url: `${config.siteUrl}/browse/${existing.key}`,
            };
            await saveRecord(id, record);
          }
          if (!record) {
            const existing = await findExistingIssue(preview);
            if (existing) {
              record = {
                phase: 'created',
                fingerprint: 'discovered-existing-issue',
                key: existing.key,
                issueId: existing.id,
                url: `${config.siteUrl}/browse/${existing.key}`,
              };
              await saveRecord(id, record);
            } else {
              await saveRecord(id, { phase: 'creating', fingerprint: preview.fingerprint });
              try {
                const created = await jiraRequest('/issue', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    fields: {
                      project: { key: config.projectKey },
                      issuetype: { id: config.issueTypeId },
                      summary: preview.summary,
                      description: preview.description,
                      labels: preview.labels,
                      ...(preview.dueDate ? { duedate: preview.dueDate } : {}),
                    },
                  }),
                });
                const issue = (await created.json()) as { id: string; key: string };
                record = {
                  phase: 'created',
                  fingerprint: preview.fingerprint,
                  issueId: issue.id,
                  key: issue.key,
                  url: `${config.siteUrl}/browse/${issue.key}`,
                };
                await saveRecord(id, record);
              } catch (error) {
                if (
                  (error as { status?: number }).status &&
                  (error as { status: number }).status < 500
                )
                  await unlink(recordFile(id));
                throw error;
              }
            }
          }
          await markPublished(id);
          if (record.fingerprint !== preview.fingerprint)
            return reply(response, 409, {
              error:
                'A Jira Task already exists for this brief. Open the existing Task; this integration will not create a duplicate.',
              existing: publicPreview(preview, record).existing,
            });
          return reply(response, 200, publicPreview(preview, record));
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') return reply(response, 404, { error: 'Brief not found.' });
          return reply(response, 502, {
            error: error instanceof Error ? error.message : 'Could not create the Jira Task.',
          });
        } finally {
          busy.delete(id);
        }
      });
    },
  };
}
