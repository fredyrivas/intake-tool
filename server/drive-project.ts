import { readFile, rename, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { GoogleAuth } from 'google-auth-library';
import type { Plugin } from 'vite';
import { createBriefSummaryPdf, type BriefPdfInput } from '../src/brief-pdf.ts';
import { fileLimits, fileTypes, type Attachment, type Values } from '../shared/brief-contract.ts';
import {
  driveFingerprint,
  driveRecordFile,
  readDriveRecord,
  type DriveFolder,
  type DriveRecord,
} from './drive-record.ts';

const driveScope = 'https://www.googleapis.com/auth/drive';
const folderMimeType = 'application/vnd.google-apps.folder';
const spreadsheetMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const maxRequestBytes = 22 * 1024 * 1024;
const legacyFolderNames = ['Agent-provided documents', 'Client-provided documents'];

type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  webViewLink?: string;
};

type DriveClient = Awaited<ReturnType<GoogleAuth['getClient']>>;

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

function safeName(value: string, fallback: string) {
  return (
    value
      .normalize('NFC')
      .replace(/[\\/\r\n\0]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || fallback
  );
}

function extension(name: string) {
  const match = name.match(/(\.[a-zA-Z0-9]{1,10})$/);
  return match?.[1]?.toLowerCase() || '';
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
    return document;
  });
}

function validateValues(value: unknown): Values {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid brief values.');
  const values: Values = {};
  for (const [fieldId, candidate] of Object.entries(value)) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(fieldId) || !Array.isArray(candidate)) continue;
    const entries = candidate.filter(
      (item): item is string => typeof item === 'string' && item.length <= 6000,
    );
    if (entries.length) values[fieldId] = entries.slice(0, 50);
  }
  return values;
}

function validatePdf(value: unknown, projectName: string): BriefPdfInput {
  if (!value || typeof value !== 'object') throw new Error('Invalid PDF summary.');
  const pdf = value as Partial<BriefPdfInput>;
  if (
    typeof pdf.summary !== 'string' ||
    pdf.summary.length > 12000 ||
    typeof pdf.status !== 'string' ||
    pdf.status.length > 200 ||
    !Array.isArray(pdf.rows) ||
    pdf.rows.length > 200
  )
    throw new Error('Invalid PDF summary.');
  return {
    projectName,
    summary: pdf.summary,
    status: pdf.status,
    rows: pdf.rows.map((row) => {
      if (
        !row ||
        typeof row.label !== 'string' ||
        row.label.length > 300 ||
        typeof row.value !== 'string' ||
        row.value.length > 12000
      )
        throw new Error('Invalid PDF row.');
      return { label: row.label, value: row.value, unresolved: Boolean(row.unresolved) };
    }),
  };
}

function validatePayload(value: unknown) {
  if (!value || typeof value !== 'object') throw new Error('Invalid Drive project.');
  const payload = value as Record<string, unknown>;
  const projectName =
    typeof payload.projectName === 'string' ? safeName(payload.projectName, '') : '';
  if (!projectName) throw new Error('A project name is required.');
  return {
    projectName,
    values: validateValues(payload.values),
    documents: validateDocuments(payload.documents),
    pdf: validatePdf(payload.pdf, projectName),
  };
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findChild(client: DriveClient, parentId: string, name: string, mimeType?: string) {
  const clauses = [
    `'${escapeDriveQuery(parentId)}' in parents`,
    `name = '${escapeDriveQuery(name)}'`,
    'trashed = false',
  ];
  if (mimeType) clauses.push(`mimeType = '${escapeDriveQuery(mimeType)}'`);
  const result = await client.request<{ files?: DriveFile[] }>({
    url: 'https://www.googleapis.com/drive/v3/files',
    method: 'GET',
    params: {
      q: clauses.join(' and '),
      spaces: 'drive',
      fields: 'files(id,name,mimeType,webViewLink)',
      pageSize: 10,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    },
  });
  return result.data.files?.[0] || null;
}

async function ensureFolder(
  client: DriveClient,
  parentId: string,
  name: string,
  previousNames: string[] = [],
) {
  const existing = await findChild(client, parentId, name, folderMimeType);
  if (existing) return existing;
  for (const previousName of previousNames) {
    const previous = await findChild(client, parentId, previousName, folderMimeType);
    if (!previous) continue;
    const result = await client.request<DriveFile>({
      url: `https://www.googleapis.com/drive/v3/files/${previous.id}`,
      method: 'PATCH',
      params: { supportsAllDrives: true, fields: 'id,name,mimeType,webViewLink' },
      data: { name },
    });
    return result.data;
  }
  const result = await client.request<DriveFile>({
    url: 'https://www.googleapis.com/drive/v3/files',
    method: 'POST',
    params: { supportsAllDrives: true, fields: 'id,name,mimeType,webViewLink' },
    data: { name, mimeType: folderMimeType, parents: [parentId] },
  });
  return result.data;
}

function folderReference(folder: DriveFile): DriveFolder {
  return {
    id: folder.id,
    url: folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`,
  };
}

async function uploadFile(
  client: DriveClient,
  parentId: string,
  name: string,
  mimeType: string,
  bytes: Buffer | Uint8Array,
) {
  let file = await findChild(client, parentId, name);
  if (!file) {
    const created = await client.request<DriveFile>({
      url: 'https://www.googleapis.com/drive/v3/files',
      method: 'POST',
      params: { supportsAllDrives: true, fields: 'id,name,mimeType,webViewLink' },
      data: { name, mimeType, parents: [parentId] },
    });
    file = created.data;
  }
  await client.request({
    url: `https://www.googleapis.com/upload/drive/v3/files/${file.id}`,
    method: 'PATCH',
    params: { uploadType: 'media', supportsAllDrives: true },
    headers: { 'Content-Type': mimeType },
    data: Buffer.from(bytes),
  });
  return file;
}

function uniqueDocumentName(name: string, used: Set<string>) {
  const safe = safeName(name, 'Document');
  const suffix = extension(safe);
  const stem = suffix ? safe.slice(0, -suffix.length) : safe;
  let candidate = safe;
  let index = 2;
  while (used.has(candidate.toLocaleLowerCase())) {
    candidate = `${stem}-${index}${suffix}`;
    index += 1;
  }
  used.add(candidate.toLocaleLowerCase());
  return candidate;
}

async function listChildren(client: DriveClient, parentId: string) {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const result = await client.request<{ files?: DriveFile[]; nextPageToken?: string }>({
      url: 'https://www.googleapis.com/drive/v3/files',
      method: 'GET',
      params: {
        q: `'${escapeDriveQuery(parentId)}' in parents and trashed = false`,
        spaces: 'drive',
        fields: 'nextPageToken,files(id,name,mimeType,webViewLink)',
        pageSize: 100,
        pageToken,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      },
    });
    files.push(...(result.data.files || []));
    pageToken = result.data.nextPageToken;
  } while (pageToken);
  return files;
}

async function trashTree(client: DriveClient, file: DriveFile) {
  if (file.mimeType === folderMimeType) {
    const children = await listChildren(client, file.id);
    for (const child of children) await trashTree(client, child);
  }
  await client.request({
    url: `https://www.googleapis.com/drive/v3/files/${file.id}`,
    method: 'PATCH',
    params: { supportsAllDrives: true },
    data: { trashed: true },
  });
}

async function removeLegacyFolders(client: DriveClient, projectId: string) {
  const children = await listChildren(client, projectId);
  for (const folder of children) {
    if (folder.mimeType === folderMimeType && legacyFolderNames.includes(folder.name || ''))
      await trashTree(client, folder);
  }
}

type DriveProjectStructureInput = {
  projectId: string;
  projectName: string;
  values: Values;
  documents: Attachment[];
  pdf: BriefPdfInput;
  deliverablesTemplate: Uint8Array;
};

export async function createDriveProjectStructure(
  client: DriveClient,
  input: DriveProjectStructureInput,
) {
  await removeLegacyFolders(client, input.projectId);
  const intakeFolder = await ensureFolder(client, input.projectId, 'Intake Tool Brief', [
    'intake tool brief',
  ]);
  const briefFolder = await ensureFolder(client, input.projectId, 'Brief', ['brief']);
  const matrixFolder = await ensureFolder(client, input.projectId, 'Adapt Matrix');
  const deliverablesFolder = await ensureFolder(client, input.projectId, 'Deliverables & Specs');
  const workingFilesFolder = await ensureFolder(client, input.projectId, 'Working Files');
  const otherDocumentsFolder = await ensureFolder(client, input.projectId, 'Other Documents', [
    'Other documents',
  ]);
  const documentsById = new Map(input.documents.map((document) => [document.id, document]));
  const classifiedDocumentIds = new Set<string>();

  for (const { fieldId, folder, baseName } of [
    { fieldId: 'creativeDirection', folder: briefFolder, baseName: 'Creative Direction' },
    { fieldId: 'assetMatrix', folder: matrixFolder, baseName: 'Asset Matrix' },
  ]) {
    const uploaded = (input.values[fieldId] || [])
      .map((id) => documentsById.get(id))
      .filter((document): document is Attachment => Boolean(document));
    for (const [index, document] of uploaded.entries()) {
      classifiedDocumentIds.add(document.id);
      const suffix = extension(document.name);
      await uploadFile(
        client,
        folder.id,
        `${baseName}${index ? `-${index + 1}` : ''}${suffix}`,
        document.mimeType,
        Buffer.from(document.data, 'base64'),
      );
    }
  }

  const assetMatrixLink = input.values.assetMatrixLink?.[0]?.trim();
  if (assetMatrixLink) {
    await uploadFile(
      client,
      matrixFolder.id,
      'Asset Matrix Source URL.txt',
      'text/plain',
      Buffer.from(assetMatrixLink, 'utf8'),
    );
  }

  const otherDocumentNames = new Set<string>();
  for (const document of input.documents) {
    if (classifiedDocumentIds.has(document.id)) continue;
    await uploadFile(
      client,
      otherDocumentsFolder.id,
      uniqueDocumentName(document.name, otherDocumentNames),
      document.mimeType,
      Buffer.from(document.data, 'base64'),
    );
  }

  await uploadFile(
    client,
    intakeFolder.id,
    'Intake Tool Brief.pdf',
    'application/pdf',
    createBriefSummaryPdf(input.pdf),
  );
  await uploadFile(
    client,
    deliverablesFolder.id,
    'Deliverables & Specs Template.xlsx',
    spreadsheetMimeType,
    input.deliverablesTemplate,
  );

  return {
    brief: folderReference(briefFolder),
    adaptMatrix: folderReference(matrixFolder),
    deliverablesAndSpecs: folderReference(deliverablesFolder),
    workingFiles: folderReference(workingFilesFolder),
  };
}

export function driveProjectPlugin(
  config: {
    parentFolderId: string;
    credentialsFile?: string;
  },
  rootDirectory = process.cwd(),
): Plugin {
  const auth = new GoogleAuth({
    scopes: [driveScope],
    ...(config.credentialsFile ? { keyFilename: config.credentialsFile } : {}),
  });
  let busy = false;

  return {
    name: 'local-drive-project',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split('?')[0] || '';
        const match = pathname.match(/^\/api\/briefs\/([a-f0-9-]{36})\/drive$/);
        if (!match) return next();
        if (request.method !== 'POST' && request.method !== 'GET')
          return reply(response, 405, { error: 'Method not allowed.' });
        if (!isLocalRequest(request))
          return reply(response, 403, { error: 'Local requests only.' });
        if (request.method === 'GET') {
          try {
            const briefFile = path.join(rootDirectory, 'briefs', match[1], 'brief.json');
            const brief = JSON.parse(await readFile(briefFile, 'utf8')) as {
              name?: string;
              draft?: { values?: Values };
              documents?: Attachment[];
            };
            const record = await readDriveRecord(rootDirectory, match[1]);
            if (!record) return reply(response, 404, { error: 'Create the Drive project first.' });
            if (record.fingerprint !== driveFingerprint(brief))
              return reply(response, 409, { error: 'Update the Drive project for this brief.' });
            return reply(response, 200, { url: record.root.url, warnings: record.warnings });
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT')
              return reply(response, 404, { error: 'Brief not found.' });
            return reply(response, 502, { error: 'Could not load the Drive project.' });
          }
        }
        if (!request.headers['content-type']?.startsWith('application/json'))
          return reply(response, 415, { error: 'JSON required.' });
        if (!config.parentFolderId)
          return reply(response, 503, { error: 'Google Drive is not configured.' });
        if (busy)
          return reply(response, 429, { error: 'A Drive project is already being created.' });

        busy = true;
        try {
          const requested = await readJson(request);
          const briefFile = path.join(rootDirectory, 'briefs', match[1], 'brief.json');
          const brief = JSON.parse(await readFile(briefFile, 'utf8')) as {
            name?: string;
            draft?: { values?: Values };
            documents?: Attachment[];
            publication?: Record<string, boolean>;
          };
          const sourceFingerprint = driveFingerprint(brief);
          const values = brief.draft?.values || {};
          if (!values.brand?.[0] || !values.projectTitle?.[0])
            return reply(response, 422, {
              error: 'A brand and project title are required before creating a Drive project.',
            });
          const payload = validatePayload({
            ...(requested as Record<string, unknown>),
            projectName: brief.name,
            values,
          });
          const client = await auth.getClient();
          const previous = await readDriveRecord(rootDirectory, match[1]);
          const project = previous
            ? { id: previous.root.id, webViewLink: previous.root.url }
            : await ensureFolder(client, config.parentFolderId, payload.projectName);
          const deliverablesTemplate = await readFile(
            path.join(rootDirectory, 'docs', 'Deliverables & Specs Template.xlsx'),
          );
          const folders = await createDriveProjectStructure(client, {
            projectId: project.id,
            projectName: payload.projectName,
            values: payload.values,
            documents: brief.documents || [],
            pdf: payload.pdf,
            deliverablesTemplate,
          });

          const documentIds = new Set((brief.documents || []).map((document) => document.id));
          const warnings: string[] = [];
          if (!(values.creativeDirection || []).some((id) => documentIds.has(id)))
            warnings.push('Creative Direction was not supplied with the current brief.');
          if (
            !(values.assetMatrix || []).some((id) => documentIds.has(id)) &&
            !values.assetMatrixLink?.[0]
          )
            warnings.push('Asset Matrix was not supplied with the current brief.');
          const record: DriveRecord = {
            fingerprint: sourceFingerprint,
            root: folderReference(project),
            folders,
            warnings,
          };
          const recordPath = driveRecordFile(rootDirectory, match[1]);
          const recordTemporary = `${recordPath}.tmp`;
          await writeFile(recordTemporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
          await rename(recordTemporary, recordPath);
          const latestBrief = JSON.parse(await readFile(briefFile, 'utf8')) as typeof brief;
          if (driveFingerprint(latestBrief) !== sourceFingerprint)
            return reply(response, 409, {
              error:
                'The brief changed while Drive was being updated. Update the Drive project again.',
            });
          if (!latestBrief.publication?.drive) {
            const temporary = `${briefFile}.tmp`;
            await writeFile(
              temporary,
              `${JSON.stringify({ ...latestBrief, publication: { ...latestBrief.publication, drive: true } }, null, 2)}\n`,
              'utf8',
            );
            await rename(temporary, briefFile);
          }

          return reply(response, 201, {
            id: project.id,
            name: payload.projectName,
            url: record.root.url,
            warnings,
          });
        } catch (error) {
          console.error('[drive-project] request failed', error);
          const message =
            error instanceof Error ? error.message : 'Could not create the Drive project.';
          return reply(response, 502, { error: message });
        } finally {
          busy = false;
        }
      });
    },
  };
}
