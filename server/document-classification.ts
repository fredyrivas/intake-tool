import {
  parseAnalysis,
  type Analysis,
  type Attachment,
  type Proposal,
} from '../shared/brief-contract.ts';

type DocumentClassification = {
  documentId: string;
  fieldId: 'creativeDirection' | 'contentMatrix' | 'assetMatrix' | 'other';
  page: number;
  excerpt: string;
};

export function applyDocumentClassifications(
  input: unknown,
  documents: Attachment[],
  classifiableDocuments: Attachment[] = documents,
): Analysis {
  if (!input || typeof input !== 'object') throw new Error('Invalid analysis response.');
  const response = input as Analysis & { documentClassifications?: DocumentClassification[] };
  // Later phases include document references without content. A model may repeat
  // an earlier classification, but there is no new content to classify here.
  const classifications = classifiableDocuments.length ? response.documentClassifications : [];
  if (
    !Array.isArray(classifications) ||
    classifications.length < classifiableDocuments.length ||
    classifications.length > classifiableDocuments.length * 3
  )
    throw new Error('Incomplete document classification.');

  const documentById = new Map(classifiableDocuments.map((document) => [document.id, document]));
  const classified = new Map<string, DocumentClassification>();
  const rolesByDocument = new Map<string, Set<string>>();
  for (const item of classifications) {
    const document = documentById.get(item.documentId);
    if (
      !document ||
      !['creativeDirection', 'contentMatrix', 'assetMatrix', 'other'].includes(item.fieldId) ||
      !Number.isInteger(item.page) ||
      item.page < 0 ||
      typeof item.excerpt !== 'string' ||
      item.excerpt.length > 2000 ||
      (item.fieldId !== 'other' &&
        (!item.excerpt.trim() || (document.mimeType === 'application/pdf' && item.page < 1)))
    )
      throw new Error('Invalid document classification.');
    const roles = rolesByDocument.get(item.documentId) || new Set<string>();
    if (roles.has(item.fieldId) || (roles.size && (roles.has('other') || item.fieldId === 'other')))
      throw new Error('Invalid document classification.');
    roles.add(item.fieldId);
    rolesByDocument.set(item.documentId, roles);
    if (item.fieldId !== 'other' && !classified.has(item.fieldId))
      classified.set(item.fieldId, item);
  }
  if (rolesByDocument.size !== classifiableDocuments.length)
    throw new Error('Incomplete document classification.');

  const documentRoleFields = new Set(['creativeDirection', 'contentMatrix', 'assetMatrix']);
  const proposals: Proposal[] = response.proposals.filter(
    (proposal) => !documentRoleFields.has(proposal.fieldId),
  );
  for (const item of classified.values()) {
    proposals.push({
      fieldId: item.fieldId,
      values: [item.documentId],
      source: {
        kind: 'document',
        documentId: item.documentId,
        page: item.page,
        excerpt: item.excerpt,
      },
    });
  }
  return parseAnalysis(
    {
      summary: response.summary,
      proposals,
      questions: response.questions,
      conditionalRequiredFieldIds: response.conditionalRequiredFieldIds,
      warnings: response.warnings,
    },
    documents,
  );
}
