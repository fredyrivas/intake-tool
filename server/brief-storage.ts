import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import {
  fileLimits,
  fileTypes,
  generatedProjectName,
  type Attachment,
  type Values,
} from '../shared/brief-contract.ts';

const maxRequestBytes = 22 * 1024 * 1024;

type StoredBrief = {
  id: string;
  name: string;
  projectId?: string;
  publication?: { jira?: true; drive?: true };
  createdAt: string;
  updatedAt: string;
  draft: Record<string, unknown>;
  documents: Attachment[];
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

async function readJson(request: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > maxRequestBytes) throw new Error('Request is too large.');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function validateDocuments(value: unknown): Attachment[] {
  if (!Array.isArray(value) || value.length > fileLimits.count) throw new Error('Invalid files.');
  let total = 0;
  const ids = new Set<string>();
  return value.map((candidate) => {
    const document = candidate as Attachment;
    if (
      !document ||
      typeof document.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(document.id) ||
      ids.has(document.id) ||
      typeof document.name !== 'string' ||
      document.name.length > 200 ||
      !fileTypes.includes(document.mimeType) ||
      typeof document.data !== 'string' ||
      document.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(document.data)
    )
      throw new Error('Invalid file.');
    const bytes = Buffer.from(document.data, 'base64');
    total += bytes.length;
    ids.add(document.id);
    if (!bytes.length || bytes.length > fileLimits.each || total > fileLimits.total)
      throw new Error('Files exceed the upload limit.');
    return {
      id: document.id,
      name: document.name,
      mimeType: document.mimeType,
      data: document.data,
    };
  });
}

function validatePayload(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Invalid brief.');
  const payload = value as { draft?: unknown; documents?: unknown };
  if (!payload.draft || typeof payload.draft !== 'object' || Array.isArray(payload.draft))
    throw new Error('Invalid brief.');
  return {
    draft: payload.draft as Record<string, unknown>,
    documents: validateDocuments(payload.documents),
  };
}

function briefName(draft: Record<string, unknown>, projectId?: string) {
  const values = draft.values as Record<string, unknown> | undefined;
  if (values && projectId) return generatedProjectName(values as Values, projectId);
  const projectName = values?.projectName;
  if (Array.isArray(projectName) && typeof projectName[0] === 'string' && projectName[0].trim())
    return projectName[0].trim().slice(0, 200);
  const intent = draft.intent;
  if (typeof intent === 'string' && intent.trim())
    return intent.trim().replace(/\s+/g, ' ').slice(0, 80);
  return 'Untitled brief';
}

function sameValues(left: string[] | undefined, right: string[] | undefined) {
  return JSON.stringify(left || []) === JSON.stringify(right || []);
}

export function canonicalProjectId(id: string, used: Set<string>) {
  const compact = id.replace(/-/g, '').toUpperCase();
  for (let length = 8; length <= compact.length; length += 1) {
    const candidate = `IT-${compact.slice(0, length)}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('Could not allocate a unique project identifier.');
}

function summary(brief: StoredBrief) {
  const values = brief.draft.values as Record<string, string[]> | undefined;
  return {
    id: brief.id,
    name: brief.name,
    createdAt: brief.createdAt,
    updatedAt: brief.updatedAt,
    stage: brief.draft.stage,
    route: values?.requestTypes?.join(', ') || '',
    brands: Array.isArray(values?.brand) ? values.brand : [],
    dueDate: values?.expectedDeliveryDate?.[0] || null,
    projectId: brief.projectId,
    published: Boolean(brief.publication?.jira || brief.publication?.drive || !brief.projectId),
  };
}

export function briefStoragePlugin(rootDirectory = process.cwd()): Plugin {
  const briefsDirectory = path.resolve(rootDirectory, 'briefs');
  const fileFor = (id: string) => path.join(briefsDirectory, id, 'brief.json');

  return {
    name: 'local-brief-storage',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url || '/', 'http://localhost');
        if (!requestUrl.pathname.startsWith('/api/briefs')) return next();
        if (!isLocalRequest(request))
          return reply(response, 403, { error: 'Local requests only.' });

        const match = requestUrl.pathname.match(/^\/api\/briefs(?:\/([a-f0-9-]{36}))?$/);
        if (!match) return next();
        const id = match[1];

        try {
          if (request.method === 'GET' && !id) {
            await mkdir(briefsDirectory, { recursive: true });
            const entries = await readdir(briefsDirectory, { withFileTypes: true });
            const briefs = await Promise.all(
              entries
                .filter((entry) => entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name))
                .map(async (entry) => {
                  try {
                    return JSON.parse(await readFile(fileFor(entry.name), 'utf8')) as StoredBrief;
                  } catch {
                    return null;
                  }
                }),
            );
            return reply(
              response,
              200,
              briefs
                .filter((brief): brief is StoredBrief => Boolean(brief))
                .map(summary)
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
            );
          }

          if (request.method === 'GET' && id) {
            const brief = JSON.parse(await readFile(fileFor(id), 'utf8')) as StoredBrief;
            return reply(response, 200, { ...brief, published: summary(brief).published });
          }

          if (request.method === 'DELETE' && id) {
            await rm(path.join(briefsDirectory, id), { recursive: true, force: false });
            return reply(response, 200, { ok: true });
          }

          if ((request.method === 'POST' && !id) || (request.method === 'PUT' && id)) {
            if (!request.headers['content-type']?.startsWith('application/json'))
              return reply(response, 415, { error: 'JSON required.' });
            const payload = validatePayload(await readJson(request));
            const briefId = id || randomUUID();
            let existing: StoredBrief | null = null;
            if (id) {
              try {
                existing = JSON.parse(await readFile(fileFor(id), 'utf8')) as StoredBrief;
              } catch {
                return reply(response, 404, { error: 'Brief not found.' });
              }
            }
            const incomingValues = payload.draft.values as Values | undefined;
            const existingValues = existing?.draft.values as Values | undefined;
            if (
              (existing?.publication || (existing && !existing.projectId)) &&
              (!sameValues(incomingValues?.brand, existingValues?.brand) ||
                incomingValues?.projectTitle?.[0] !== existingValues?.projectTitle?.[0])
            )
              return reply(response, 409, {
                error: 'Brand and project title are locked after publishing to Jira or Drive.',
              });
            await mkdir(briefsDirectory, { recursive: true });
            const entries = await readdir(briefsDirectory, { withFileTypes: true });
            const stored = await Promise.all(
              entries
                .filter((entry) => entry.isDirectory() && entry.name !== briefId)
                .map(async (entry) => {
                  try {
                    return JSON.parse(await readFile(fileFor(entry.name), 'utf8')) as StoredBrief;
                  } catch {
                    return null;
                  }
                }),
            );
            const usedProjectIds = new Set(
              stored.flatMap((brief) => (brief?.projectId ? [brief.projectId] : [])),
            );
            const projectId =
              existing?.projectId ||
              (existing ? undefined : canonicalProjectId(briefId, usedProjectIds));
            const values = (payload.draft.values || {}) as Values;
            payload.draft.values = {
              ...values,
              projectName: projectId
                ? [generatedProjectName(values, projectId.slice(3))]
                : [existing!.name],
            };
            const now = new Date().toISOString();
            const brief: StoredBrief = {
              id: briefId,
              name: projectId ? briefName(payload.draft, projectId) : existing!.name,
              projectId,
              publication: existing?.publication,
              createdAt: existing?.createdAt || now,
              updatedAt: now,
              draft: payload.draft,
              documents: payload.documents,
            };
            const directory = path.join(briefsDirectory, briefId);
            await mkdir(directory, { recursive: true });
            const temporaryFile = path.join(directory, 'brief.json.tmp');
            await writeFile(temporaryFile, `${JSON.stringify(brief, null, 2)}\n`, 'utf8');
            await rename(temporaryFile, fileFor(briefId));
            return reply(response, id ? 200 : 201, {
              ...summary(brief),
              projectName: (payload.draft.values as Values).projectName?.[0],
            });
          }

          return reply(response, 405, { error: 'Method not allowed.' });
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'ENOENT') return reply(response, 404, { error: 'Brief not found.' });
          return reply(response, 400, {
            error: error instanceof Error ? error.message : 'Could not save the brief.',
          });
        }
      });
    },
  };
}
