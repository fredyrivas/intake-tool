import catalog from './brief-catalog.json' with { type: 'json' };
import interpretation from './brief-interpretation.json' with { type: 'json' };
import workflow from './brief-workflow.json' with { type: 'json' };
import instructions from './brief-system-instructions.json' with { type: 'json' };
import { documentRoles, parseAnalysis, type Attachment, type Source } from './brief-contract.ts';

export const BRIEF_CONFIG_VERSION = [
  catalog.version,
  interpretation.version.instruction,
  workflow.version,
  instructions.version,
].join('/');
export type DocumentClassification = {
  documentId: string;
  fieldId: 'creativeDirection' | 'contentMatrix' | 'assetMatrix' | 'other';
  page: number;
  excerpt: string;
};
export type SourceReading = {
  summary: string;
  facts: { topic: string; value: string; source: Source }[];
  documentClassifications: DocumentClassification[];
  warnings: string[];
};
export type DocumentStamp = { id: string; name: string; mimeType: string; digest: string };
export type AnalysisContext = {
  version: 1;
  configurationVersion: string;
  intentDigest: string;
  documents: DocumentStamp[];
  reading: SourceReading;
  readingInteractionId: string;
  latestInteractionId: string;
};
const digestPattern = /^[a-f0-9]{64}$/;
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
export async function digest(value: string) {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export async function stampDocuments(documents: Attachment[]): Promise<DocumentStamp[]> {
  return Promise.all(
    documents.map(async ({ id, name, mimeType, data }) => ({
      id,
      name,
      mimeType,
      digest: await digest(data),
    })),
  );
}
export function contextMatches(
  context: AnalysisContext | null,
  intentDigest: string,
  documents: DocumentStamp[],
) {
  return Boolean(
    context &&
    context.configurationVersion === BRIEF_CONFIG_VERSION &&
    context.intentDigest === intentDigest &&
    context.documents.every((old) =>
      documents.some(
        (current) =>
          current.id === old.id &&
          current.name === old.name &&
          current.mimeType === old.mimeType &&
          current.digest === old.digest,
      ),
    ),
  );
}

export function parseSourceReading(input: unknown, documents: Attachment[]): SourceReading {
  if (!input || typeof input !== 'object') throw new Error('Invalid source reading.');
  const reading = input as SourceReading;
  if (
    !Array.isArray(reading.facts) ||
    reading.facts.length > 150 ||
    !Array.isArray(reading.documentClassifications) ||
    reading.documentClassifications.length > documents.length * 3
  )
    throw new Error('Invalid source reading.');
  // Reuse the same source/attachment validation used for field proposals.
  parseAnalysis(
    { summary: reading.summary, warnings: reading.warnings, questions: [], proposals: [] },
    documents,
  );
  for (const fact of reading.facts) {
    if (
      !text(fact.topic, 200) ||
      !text(fact.value, 6000) ||
      !fact.source ||
      !['document', 'note'].includes(fact.source.kind) ||
      !text(fact.source.excerpt, 2000) ||
      fact.source.webUrl !== undefined
    )
      throw new Error('Invalid extracted fact.');
    parseAnalysis(
      {
        summary: 'Fact',
        warnings: [],
        questions: [],
        proposals: [{ fieldId: 'notes', values: [fact.value], source: fact.source }],
      },
      documents,
    );
  }
  const seen = new Map<string, Set<string>>();
  for (const item of reading.documentClassifications) {
    const doc = documents.find((document) => document.id === item.documentId);
    const roles = seen.get(item.documentId) ?? new Set<string>();
    if (
      !doc ||
      !documentRoles.includes(item.fieldId) ||
      !text(item.excerpt, 2000) ||
      !Number.isInteger(item.page) ||
      item.page < 0 ||
      (item.fieldId !== 'other' &&
        [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ].includes(doc.mimeType) &&
        item.page < 1) ||
      roles.has(item.fieldId) ||
      (roles.size && (roles.has('other') || item.fieldId === 'other'))
    )
      throw new Error('Invalid document classification.');
    roles.add(item.fieldId);
    seen.set(item.documentId, roles);
  }
  if (seen.size !== documents.length) throw new Error('Incomplete document classification.');
  return {
    summary: reading.summary,
    facts: reading.facts,
    documentClassifications: reading.documentClassifications,
    warnings: reading.warnings,
  };
}

/** Invalid or old saved contexts can always be rebuilt from the saved sources. */
export function restoreAnalysisContext(
  input: unknown,
  documents: Attachment[],
): AnalysisContext | null {
  try {
    if (!input || typeof input !== 'object') return null;
    const context = input as AnalysisContext;
    if (
      context.version !== 1 ||
      context.configurationVersion !== BRIEF_CONFIG_VERSION ||
      !digestPattern.test(context.intentDigest) ||
      !text(context.latestInteractionId, 2048) ||
      !text(context.readingInteractionId, 2048) ||
      !Array.isArray(context.documents) ||
      context.documents.length > documents.length ||
      new Set(context.documents.map((doc) => doc.id)).size !== context.documents.length
    )
      return null;
    for (const stamp of context.documents) {
      if (
        !digestPattern.test(stamp.digest) ||
        !documents.some(
          (doc) =>
            doc.id === stamp.id && doc.name === stamp.name && doc.mimeType === stamp.mimeType,
        )
      )
        return null;
    }
    const reading = parseSourceReading(
      context.reading,
      documents.filter((doc) => context.documents.some((stamp) => stamp.id === doc.id)),
    );
    return {
      version: 1,
      configurationVersion: BRIEF_CONFIG_VERSION,
      intentDigest: context.intentDigest,
      documents: context.documents,
      reading,
      readingInteractionId: context.readingInteractionId,
      latestInteractionId: context.latestInteractionId,
    };
  } catch {
    return null;
  }
}
