import briefCatalog from './brief-catalog.json' with { type: 'json' };
import briefWorkflow from './brief-workflow.json' with { type: 'json' };

export type Values = Record<string, string[]>;
export type Condition = { field: string; any: string[] };
export type Field = {
  id: string;
  label: string;
  type: 'text' | 'email' | 'emails' | 'number' | 'date' | 'select' | 'multi' | 'document' | 'link';
  required: boolean;
  when: Condition[];
  options?: string[];
  template?: {
    label: string;
    url: string;
  };
};
// Expand module defaults into the existing runtime field contract.
export const fields: Field[] = briefCatalog.modules.flatMap((module) =>
  module.fields.map((field) => ({
    id: field.id,
    label: field.label,
    type: field.type,
    when: 'when' in field ? field.when : [],
    required: 'required' in field ? field.required : module.requiredDefault,
    ...('options' in field ? { options: field.options } : {}),
    ...('template' in field ? { template: field.template } : {}),
  })),
) as Field[];
export const moduleIdByFieldId = new Map(
  briefCatalog.modules.flatMap((module) =>
    module.fields.map((field) => [field.id, module.id] as const),
  ),
);
export const automaticMessages = briefWorkflow.automaticMessages;

export const coreBrands = fields.find((field) => field.id === 'brand')!.options!;

export function brandExceptionNotes(brands: string[] = []): string[] {
  return brands
    .filter((brand) => !coreBrands.some((core) => core.toLowerCase() === brand.toLowerCase()))
    .map(
      (brand) =>
        `Brand exception: ${brand} is also included in this brief, despite being outside of the core 12 NACB Brands.`,
    );
}

// Only fields explicitly excluded by catalog policy are omitted from model context.
export const privateFieldIds = new Set<string>(briefCatalog.sharedPolicies.privateFieldIds);
export const modelFields = fields.filter((field) => !privateFieldIds.has(field.id));
export const documentRoles = briefCatalog.sharedPolicies.documentRoles;

export function activeFields(values: Values): Field[] {
  const matches = (conditions: Condition[]) =>
    conditions.every((condition) =>
      condition.any.some((value) => values[condition.field]?.includes(value)),
    );
  return fields.filter((field) => {
    const special = briefCatalog.sharedPolicies.specialActivation.find((rule) =>
      rule.fieldIds.includes(field.id),
    );
    return matches(field.when) && (!special || special.whenAny.some((group) => matches(group)));
  });
}

export const alternativeFieldGroups = briefCatalog.sharedPolicies.alternativeFieldGroups as [string, string][];

export function fieldIsRequired(field: Field, _conditionalRequiredFieldIds: string[] = []) {
  void _conditionalRequiredFieldIds;
  return field.required;
}

/**
 * Keep model output on the deterministic branch selected by requestTypes and
 * any nested choices proposed in the same response.
 */
export function analysisForActivePath(analysis: Analysis, confirmed: Values): Analysis {
  const proposed = Object.fromEntries(
    analysis.proposals.map((proposal) => [proposal.fieldId, proposal.values]),
  );
  const branchValues = confirmed.requestTypes ? confirmed : { ...confirmed, ...proposed };
  const allowed = new Set(activeFields(branchValues).map((field) => field.id));
  const routeIsLocked = Boolean(confirmed.requestTypes);
  const questionGroups = new Set<string>();

  return {
    ...analysis,
    proposals: analysis.proposals.filter(
      (proposal) =>
        allowed.has(proposal.fieldId) && (!routeIsLocked || proposal.fieldId !== 'requestTypes'),
    ),
    questions: analysis.questions.filter((question) => {
      if (!allowed.has(question.fieldId) || (routeIsLocked && question.fieldId === 'requestTypes'))
        return false;
      if (
        modelFields.find((field) => field.id === question.fieldId)?.type === 'document' &&
        (confirmed[question.fieldId]?.length || proposed[question.fieldId]?.length)
      )
        return false;
      const alternatives = alternativeFieldGroups.find((group) =>
        group.some((fieldId) => fieldId === question.fieldId),
      );
      if (!alternatives) return true;
      if (alternatives.some((fieldId) => confirmed[fieldId]?.length || proposed[fieldId]?.length))
        return false;
      const groupId = alternatives[0];
      if (questionGroups.has(groupId)) return false;
      questionGroups.add(groupId);
      return true;
    }),
  };
}
export type Attachment = { id: string; name: string; mimeType: string; data: string };
export const fileLimits = { count: 6, each: 8 * 1024 * 1024, total: 15 * 1024 * 1024 };
export const presentationMimeType =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const spreadsheetMimeType =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const fileTypes = [
  'application/pdf',
  'text/plain',
  'image/png',
  'image/jpeg',
  presentationMimeType,
  spreadsheetMimeType,
];
const extensionMimeTypes: Record<string, string> = {
  '.pptx': presentationMimeType,
  '.xlsx': spreadsheetMimeType,
};

/** Browsers do not always populate File.type for Office files, so use the safe extension fallback. */
export function acceptedFileMimeType(name: string, suppliedType: string): string | null {
  if (fileTypes.includes(suppliedType)) return suppliedType;
  return extensionMimeTypes[name.toLowerCase().slice(name.lastIndexOf('.'))] || null;
}

/** Canonical name: SC Johnson - Brand(s) - Project title - IT-identifier. */
export function generatedProjectName(values: Values, projectId?: string): string {
  const existingId = values.projectName?.[0]?.match(/ - (IT-[A-F0-9]+)$/i)?.[1];
  const id = projectId
    ? `IT-${projectId.replace(/-/g, '').toUpperCase()}`
    : existingId || 'IT-PENDING';
  const brand =
    values.brand
      ?.map((value) => value.trim())
      .filter(Boolean)
      .join(' + ') || 'Brand pending';
  const title = values.projectTitle?.[0]?.trim() || 'Project title pending';
  return `SC Johnson - ${brand} - ${title} - ${id}`;
}
export type Source = {
  kind: 'document' | 'note' | 'interpretation';
  documentId: string;
  page: number;
  excerpt: string;
  webUrl?: string;
};
export type Proposal = { fieldId: string; values: string[]; source: Source };
export type Analysis = {
  summary: string;
  proposals: Proposal[];
  questions: { fieldId: string; prompt: string; context?: string; options: string[] }[];
  conditionalRequiredFieldIds: string[];
  warnings: string[];
};
export type AnalysisPhase = 'general-information' | 'route-selection' | 'route-details' | 'document-reading' | 'scope' | 'document-enrichment' | 'follow-up' | 'final-review';
export type AnalysisProgress = {
  phase: AnalysisPhase;
  stage: 'preparation' | 'submission' | 'provider' | 'retrying' | 'validation' | 'checkpoint';
};
export type AiRequestTrace = {
  id: string;
  phase: AnalysisPhase;
  model: string;
  thinkingLevel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNAVAILABLE';
  reason: string;
  durationMs: number;
  totalDurationMs?: number;
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;
  outcome?: 'completed' | 'failed';
  errorCode?: string;
  failureStage?: 'request' | 'preparation' | 'provider' | 'response' | 'validation' | 'network' | 'polling' | 'checkpoint';
  origin?: 'browser' | 'server' | 'gemini';
  httpStatus?: number;
  configurationVersion?: string;
  providerStatus?: number;
  interactionStatus?: string;
  timeoutMs?: number;
  attempts?: {
    thinkingLevel: AiRequestTrace['thinkingLevel'];
    durationMs: number;
    interactionStatus?: string;
    interactionId?: string;
    initialInteractionStatus?: string;
    statusChecks?: number;
    stepTypes?: string[];
    providerStatus?: number;
    responseCharacters?: number;
    inputTokens: number | null;
    outputTokens: number | null;
    thinkingTokens: number | null;
    totalTokens: number | null;
    errorCode?: string;
    validationIssue?: string;
    validationDetail?: EvidenceValidationError['detail'];
  }[];
  requestSummary?: {
    catalogFields: number;
    confirmedFields: number;
    documentMetadata: number;
    documentContents: number;
    documentBytes: number;
    preparationMs?: number;
    promptCharacters?: number;
    inlineParts?: number;
    inlineBytes?: number;
  };
  createdAt: string;
};
export function validValue(f: Field, values: unknown, documents: Attachment[]): values is string[] {
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.length > 40 ||
    !values.every((v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 6000)
  )
    return false;
  if (!['multi', 'document', 'link', 'emails'].includes(f.type) && values.length !== 1)
    return false;
  if (f.id === 'brand') {
    if (
      values.some((value) => value.trim() !== value || value.length > 80 || /[\r\n]/.test(value)) ||
      new Set(values.map((value) => value.toLowerCase())).size !== values.length
    )
      return false;
  } else if (f.options && !values.every((v) => f.options!.includes(v))) return false;
  if (values.includes('__none__') && values.length !== 1) return false;
  if (f.type === 'document' && !values.every((v) => documents.some((d) => d.id === v)))
    return false;
  if (
    f.type === 'number' &&
    !values.every((v) => /^[1-9]\d*$/.test(v) && Number.isSafeInteger(Number(v)))
  )
    return false;
  if (
    ['email', 'emails'].includes(f.type) &&
    !values.every((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
  )
    return false;
  if (
    f.type === 'date' &&
    !values.every(
      (v) =>
        /^\d{4}-\d{2}-\d{2}$/.test(v) &&
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
    )
  )
    return false;
  if (
    f.type === 'link' &&
    !values.every((v) => {
      try {
        const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname)
        );
      } catch {
        return false;
      }
    })
  )
    return false;
  return true;
}
export function cleanValues(input: unknown, documents: Attachment[]): Values {
  const result: Values = {};
  if (input && typeof input === 'object')
    for (const f of fields) {
      const value = (input as Values)[f.id];
      if (validValue(f, value, documents)) result[f.id] = value;
    }
  return Object.fromEntries(
    Object.entries(result).filter(([id]) => activeFields(result).some((f) => f.id === id)),
  );
}

export function capitalizeToolNames(value: string): string {
  return value.replace(/\b(bos|vizit)\b/gi, (name) => name.toUpperCase());
}

export function capitalizeAnalysisCopy(analysis: Analysis): Analysis {
  return {
    ...analysis,
    summary: capitalizeToolNames(analysis.summary),
    questions: analysis.questions.map((question) => ({
      ...question,
      prompt: capitalizeToolNames(question.prompt),
      context: question.context ? capitalizeToolNames(question.context) : question.context,
    })),
    warnings: analysis.warnings.map(capitalizeToolNames),
  };
}

export class EvidenceValidationError extends Error {
  detail: { fieldId: string; proposalIndex: number; path: string; rule: string };
  proposal: Proposal;

  constructor(message: string, proposal: Proposal, proposalIndex: number, property: string, rule: string) {
    super(message);
    this.proposal = proposal;
    this.detail = {
      fieldId: proposal.fieldId,
      proposalIndex,
      path: `proposals[${proposalIndex}].source${property ? `.${property}` : ''}`,
      rule,
    };
  }
}

export function parseAnalysis(input: unknown, documents: Attachment[]): Analysis {
  if (!input || typeof input !== 'object') throw new Error('Invalid analysis response.');
  const a = input as Analysis;
  if (
    typeof a.summary !== 'string' ||
    !a.summary.trim() ||
    a.summary.length > 6000 ||
    !Array.isArray(a.proposals) ||
    a.proposals.length > 100 ||
    !Array.isArray(a.questions) ||
    a.questions.length > 60 ||
    !Array.isArray(a.warnings) ||
    a.warnings.length > 20
  )
    throw new Error('Invalid analysis response.');
  for (const [proposalIndex, p] of a.proposals.entries()) {
    const f = modelFields.find((f) => f.id === p.fieldId);
    if (
      !f ||
      !validValue(f, p.values, documents) ||
      !p.source ||
      !['document', 'note', 'interpretation'].includes(p.source.kind) ||
      typeof p.source.documentId !== 'string' ||
      typeof p.source.excerpt !== 'string' ||
      p.source.excerpt.length > 2000 ||
      (p.source.webUrl !== undefined &&
        (p.fieldId !== 'mediaPlacementRetailer' ||
          p.source.kind === 'interpretation' ||
          typeof p.source.webUrl !== 'string' ||
          !/^https:\/\/[^\s]+$/i.test(p.source.webUrl))) ||
      !Number.isInteger(p.source.page) ||
      p.source.page < 0
    )
      throw new Error('Invalid proposed field or source.');
    if (['email', 'emails'].includes(f.type) && (p.source.kind === 'interpretation' || !p.values.every((value) => p.source.excerpt.toLowerCase().includes(value.toLowerCase()))))
      throw new Error('Email proposals require explicit role-labeled evidence.');
    if (p.source.kind === 'document') {
      const document = documents.find((d) => d.id === p.source.documentId);
      if (!document)
        throw new EvidenceValidationError('Missing document evidence.', p, proposalIndex, 'documentId',
          'Use the exact ID of a provided attachment; filenames and invented IDs are not attachment IDs.');
      if (!p.source.excerpt.trim())
        throw new EvidenceValidationError('Missing document evidence.', p, proposalIndex, 'excerpt',
          'Document evidence requires a non-empty supporting excerpt.');
      if (['application/pdf', presentationMimeType].includes(document.mimeType) && p.source.page < 1)
        throw new EvidenceValidationError('Missing document evidence.', p, proposalIndex, 'page',
          'PDF evidence requires a 1-based page; PPTX evidence requires a 1-based slide. Do not invent a locator.');
    }
    if (p.source.kind !== 'document' && (p.source.documentId !== '' || p.source.page !== 0))
      throw new EvidenceValidationError('Invalid non-document evidence.', p, proposalIndex, '',
        'Note and interpretation sources require documentId "" and page 0. Keep document evidence as kind document.');
  }
  if (
    !a.questions.every((q) => {
      const f = modelFields.find((candidate) => candidate.id === q.fieldId);
      return (
        Boolean(f) &&
        typeof q.prompt === 'string' &&
        q.prompt.length <= 1000 &&
        (q.context === undefined || (typeof q.context === 'string' && q.context.length <= 300)) &&
        Array.isArray(q.options) &&
        (q.options.length === 0 || q.options.length >= 2) &&
        q.options.length <= 40 &&
        q.options.every(
          (option) =>
            typeof option === 'string' &&
            option.trim().length > 0 &&
            option.length <= 300 &&
            (!f?.options || f.options.includes(option)),
        ) &&
        new Set(q.options).size === q.options.length
      );
    }) ||
    !a.warnings.every((w) => typeof w === 'string' && w.length <= 2000)
  )
    throw new Error('Invalid questions.');
  return capitalizeAnalysisCopy({
    ...a,
    conditionalRequiredFieldIds: [],
    questions: a.questions.map((question) => {
      const options = modelFields.find((f) => f.id === question.fieldId)?.options;
      return options ? { ...question, options: [...options] } : question;
    }),
  });
}
