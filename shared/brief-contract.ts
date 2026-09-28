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
const route = (...any: string[]): Condition => ({ field: 'requestTypes', any });
const delivery = (...any: string[]): Condition => ({ field: 'deliveryTypes', any });
const need = (field: string, ...any: string[]): Condition => ({ field, any });
const field = (
  id: string,
  label: string,
  type: Field['type'] = 'text',
  when: Condition[] = [],
  required = false,
  options?: string[],
  template?: Field['template'],
): Field => ({
  id,
  label,
  type,
  when,
  required,
  ...(options ? { options } : {}),
  ...(template ? { template } : {}),
});

// Only Module 01 fields in the deconstructed Workspace flow are required.
// Work route is confirmed separately in scope to determine the active form path.
export const fields: Field[] = [
  field('projectName', 'Project name', 'text', [], true),
  field('projectTitle', 'Project title'),
  field('brand', 'Brand', 'multi', [], true, [
    'Glade',
    'Drano',
    'Scrubbing Bubbles',
    'Ziploc',
    'Windex',
    'Pledge',
    'OFF!',
    'Raid',
    'STEM',
    'Thermacell',
    'Baygon',
    'Scale',
  ]),
  field('region', 'Region', 'multi', [], true, [
    'USA',
    'Canada',
    'Puerto Rico',
    'Dominican Republic',
    'Other',
  ]),
  field('mainApproverEmail', 'Main approver (email)', 'email', [], true),
  field('reviewerEmails', 'Reviewers / project contributors (email)', 'emails'),
  field('assetType', 'Asset type', 'select', [], true, ['Ecomm', 'ATL', 'Shopper']),
  field('expectedDeliveryDate', 'Expected delivery date', 'date', [], true),
  field('mediaPlacementRetailer', 'Media placement / retailer', 'text', [], true),
  field('totalAssets', 'Total number of assets', 'number', [], true),
  field('creativeDirection', 'Creative Direction (template)', 'document', [], true, undefined, {
    label: 'Creative Direction template',
    url: 'https://docs.google.com/presentation/d/1rN2L-kF1H-qEuBvmree7RadybgNM2EvT/edit?usp=drive_link&ouid=115015085389003782788&rtpof=true&sd=true',
  }),
  field('requestTypes', 'Type of Content Brief', 'multi', [], false, [
    'CREATE',
    'EVOLVE',
    'ACCELERATE',
    'INNOVATE',
    '.com Copy Optimization',
    'QR Generation Request',
    'Delivery only',
  ]),
  field('createDeliverables', 'CREATE deliverables', 'multi', [route('CREATE')], false, [
    'National campaign films / TVC',
    'National campaign films / CTV',
    'National campaign films / OLV',
    'National campaign films / Social',
    'Evergreen content / Sponsored videos',
    'Evergreen content / OLV',
    'Evergreen content / Social',
    'Evergreen content / Statics',
    'Big idea production',
  ]),
  ...[
    ['businessContext', 'Business context / objective'],
    ['consumerInsights', 'Consumer insights driving the work'],
    ['audience', 'Audience'],
    ['askGoal', 'The ask & goal'],
    ['communicationObjective', 'Communication objective'],
    ['consumerTakeaway', 'Consumers takeaway (emotional / functional)'],
    ['mandatories', 'Mandatories'],
    ['outOfScope', 'Out of scope'],
    ['research', 'Research and insights'],
    ['creativeNotes', 'Additional notes or context'],
  ].map(([id, label]) => field(id, label, 'text', [route('CREATE')])),
  field('creativeReferences', 'Attachments / visual references', 'document', [route('CREATE')]),
  field('evolveDeliverables', 'EVOLVE deliverables', 'multi', [route('EVOLVE')], false, [
    'Social',
    'Static',
    'Promotional',
    'HTVs',
    'Adapts / refreshes',
  ]),
  field('annualCampaign', 'Annual campaign / reference deck (file)', 'document', [route('EVOLVE')]),
  field('annualCampaignLink', 'Annual campaign / reference deck (link)', 'link', [route('EVOLVE')]),
  field('contentMatrix', 'Content matrix (file)', 'document', [route('EVOLVE')]),
  field('contentMatrixLink', 'Content matrix (link)', 'link', [route('EVOLVE')]),
  field(
    'assetMatrix',
    'Completed asset matrix',
    'document',
    [route('EVOLVE', 'ACCELERATE', 'INNOVATE')],
    false,
    undefined,
    {
      label: 'Asset Matrix',
      url: 'https://docs.google.com/spreadsheets/d/1hi-6wABS63b-KmD4ZJE1OyMOW_FC98JN/edit?usp=drive_link&ouid=115015085389003782788&rtpof=true&sd=true',
    },
  ),
  field('assetMatrixLink', 'Completed asset matrix (link)', 'link', [
    route('EVOLVE', 'ACCELERATE', 'INNOVATE'),
  ]),
  field('workDescription', 'Work instructions', 'text', [
    route('EVOLVE', 'ACCELERATE', 'INNOVATE'),
  ]),
  field('supportingReferences', 'Creative references / supporting files', 'document', [
    route('EVOLVE', 'ACCELERATE', 'INNOVATE'),
  ]),
  field('supportingLinks', 'Creative references / supporting links', 'link', [
    route('EVOLVE', 'ACCELERATE', 'INNOVATE'),
  ]),
  field('partnershipContext', 'Partnership context (if applicable)', 'text', [
    route('EVOLVE', 'ACCELERATE'),
  ]),
  field('evolveNeeds', 'EVOLVE production needs', 'multi', [route('EVOLVE')], false, [
    'Specific music',
    'Stock materials',
    'VO recording',
    'Translation',
    '__none__',
  ]),
  field('musicDetails', 'Music details', 'text', [
    route('EVOLVE'),
    need('evolveNeeds', 'Specific music'),
  ]),
  field('musicReferences', 'Music reference files', 'document', [
    route('EVOLVE'),
    need('evolveNeeds', 'Specific music'),
  ]),
  ...[
    ['voLanguage', 'Voice-over market / language'],
    ['castingBrief', 'Casting brief (talents, gender, tone, age)'],
    ['buyoutDetails', 'Buyout details (duration, countries, media, usage)'],
  ].map(([id, label]) =>
    field(id, label, 'text', [route('EVOLVE'), need('evolveNeeds', 'VO recording')]),
  ),
  field(
    'accelerateDeliverables',
    'ACCELERATE deliverables',
    'multi',
    [route('ACCELERATE')],
    false,
    [
      'eComm digital retailer pages assets',
      'eComm Video',
      'Shopper / Media and printed non-displays',
      'Shopper / 3D display',
    ],
  ),
  field(
    'assetSubtype',
    'Asset subtype',
    'multi',
    [route('ACCELERATE'), need('accelerateDeliverables', 'eComm digital retailer pages assets')],
    false,
    [
      'Base+ tiles',
      'Beauty Shots',
      'Brand store assets',
      'Collection video',
      'Mobile hero images',
      'Enhanced content',
      'Marketing copy',
    ],
  ),
  field('vizitLink', 'BOS VIZIT folder link (if applicable)', 'link', [
    route('ACCELERATE'),
    need('accelerateDeliverables', 'eComm digital retailer pages assets'),
  ]),
  field('videoSpecs', 'Video work instructions and specifications', 'text', [
    route('ACCELERATE'),
    need('accelerateDeliverables', 'eComm Video'),
  ]),
  field('accelerateNeeds', 'ACCELERATE production needs', 'multi', [route('ACCELERATE')], false, [
    'Stock materials',
    'Translation',
    '__none__',
  ]),
  field('stockAvailability', 'Stock availability', 'select', [], false, [
    'I have stock materials',
    'Help me find stock materials',
  ]),
  field('stockMaterials', 'Stock materials (file)', 'document', [
    route('EVOLVE', 'ACCELERATE'),
    need('stockAvailability', 'I have stock materials'),
  ]),
  field('stockMaterialsLink', 'Stock materials (link)', 'link', [
    route('EVOLVE', 'ACCELERATE'),
    need('stockAvailability', 'I have stock materials'),
  ]),
  field('stockDirection', 'Stock references / direction', 'document', [
    route('EVOLVE', 'ACCELERATE'),
    need('stockAvailability', 'Help me find stock materials'),
  ]),
  field('translationLanguage', 'Translation market / language', 'multi', [], false, [
    'US_EN',
    'US_ES',
    'CA_EN',
    'CA_FR',
    'PR_ES',
    'PR_EN',
    'DO_ES',
    'Other',
  ]),
  field('translationInstructions', 'Translation instructions'),
  field('translationCopy', 'Copy document for translation', 'document'),
  field('otherProductionNotes', 'Other production notes', 'text', [route('EVOLVE', 'ACCELERATE')]),
  field('otherProductionFiles', 'Other production attachments', 'document', [route('EVOLVE')]),
  field('adaptInstructions', 'Adapt instructions', 'document', [route('ACCELERATE')]),
  field(
    'marketingCopy',
    'Marketing copy instructions (if applicable)',
    'document',
    [route('ACCELERATE')],
    false,
    undefined,
    {
      label: 'Marketing Copy Checklist',
      url: 'https://docs.google.com/spreadsheets/d/1JbjhagCpaqqC6Y5h62auDbciqLqzrg7u/edit?usp=drive_link&ouid=115015085389003782788&rtpof=true&sd=true',
    },
  ),
  field('innovateDeliverables', 'INNOVATE deliverables', 'multi', [route('INNOVATE')], false, [
    'KV',
    'PDP assets',
    'B+ tiles',
    'Brand page content',
    'In-store display',
    'HTVs / sponsored brand videos',
    'Social post',
  ]),
  field('copyServices', 'Copy services', 'multi', [route('.com Copy Optimization')], false, [
    'Copy Optimization',
    'FAQ creation',
    'New Article Review',
  ]),
  field('knowledgeBase', 'Tone of voice, product information and legal guidelines', 'document', [
    route('.com Copy Optimization'),
  ]),
  field('copyLinks', 'Articles to optimize', 'link', [
    route('.com Copy Optimization'),
    need('copyServices', 'Copy Optimization'),
  ]),
  field('faqLinks', 'Articles for FAQ creation', 'link', [
    route('.com Copy Optimization'),
    need('copyServices', 'FAQ creation'),
  ]),
  field('newArticles', 'New articles for review', 'document', [
    route('.com Copy Optimization'),
    need('copyServices', 'New Article Review'),
  ]),
  field(
    'qrTemplate',
    'Completed QR Template form',
    'document',
    [route('QR Generation Request')],
    false,
    undefined,
    {
      label: 'QR Code Request Form',
      url: 'https://docs.google.com/document/d/1zOvViSpfrOCo3hvYb0ar4IttLg2WnipP/edit?usp=drive_link&ouid=115015085389003782788&rtpof=true&sd=true',
    },
  ),
  field('deliveryTypes', 'Delivery methods', 'multi', [], false, [
    'Directly to vendor / 3rd party',
    'Directly to media agency',
    'Directly to SCJ marketer',
    'Extreme Reach (TVC)',
    'Social posting',
    'Digital Shopper',
    'Ecomm (Salsify)',
    'Other delivery need',
  ]),
  field('vendorDetails', 'Vendor delivery instructions & contact details', 'text', [
    delivery('Directly to vendor / 3rd party'),
  ]),
  field('vendorInstructions', 'Vendor delivery instructions file', 'document', [
    delivery('Directly to vendor / 3rd party'),
  ]),
  field('agencyDetails', 'Media agency delivery instructions & contact details', 'text', [
    delivery('Directly to media agency'),
  ]),
  field('agencyInstructions', 'Media agency delivery instructions file', 'document', [
    delivery('Directly to media agency'),
  ]),
  field('otherDeliveryDetails', 'Other delivery instructions & contact details', 'text', [
    delivery('Other delivery need'),
  ]),
  field('otherDeliveryInstructions', 'Other delivery instructions file', 'document', [
    delivery('Other delivery need'),
  ]),
  field('firstAirDate', 'First air date', 'date', [delivery('Extreme Reach (TVC)')]),
  field('endAirDate', 'End air date', 'date', [delivery('Extreme Reach (TVC)')]),
  field('mediaPlan', 'Media plan', 'document', [delivery('Extreme Reach (TVC)')]),
  field('mediaPlanLink', 'Media plan link', 'link', [delivery('Extreme Reach (TVC)')]),
  field('preClearance', 'Pre-clearance requirement', 'text', [delivery('Extreme Reach (TVC)')]),
  field('clearance', 'Clearance requirement', 'text', [delivery('Extreme Reach (TVC)')]),
  field('localClearance', 'Local-clearance information', 'document', [
    delivery('Extreme Reach (TVC)'),
  ]),
  field('socialDestinations', 'Social destinations', 'multi', [delivery('Social posting')], false, [
    'YouTube',
    'Social',
    'Other',
  ]),
  field('youtubeInstructions', 'YouTube titles, descriptions and posting dates per asset', 'text', [
    delivery('Social posting'),
    need('socialDestinations', 'YouTube'),
  ]),
  field('youtubeFiles', 'YouTube instructions file', 'document', [
    delivery('Social posting'),
    need('socialDestinations', 'YouTube'),
  ]),
  field('socialInstructions', 'Social copy and posting dates per asset', 'text', [
    delivery('Social posting'),
    need('socialDestinations', 'Social'),
  ]),
  field('socialFiles', 'Social instructions file', 'document', [
    delivery('Social posting'),
    need('socialDestinations', 'Social'),
  ]),
  field('otherSocialInstructions', 'Other social destination instructions per asset', 'text', [
    delivery('Social posting'),
    need('socialDestinations', 'Other'),
  ]),
  field('shopperCopy', 'Digital Shopper copy instructions per asset', 'text', [
    delivery('Digital Shopper'),
  ]),
  field('ecommerceTemplate', 'E-commerce delivery-details template', 'document', [
    delivery('Ecomm (Salsify)'),
  ]),
  field(
    'ecommerceMode',
    'Should assets append or replace existing assets?',
    'select',
    [delivery('Ecomm (Salsify)')],
    false,
    ['Append', 'Replace'],
  ),
  field('ecommerceOrder', 'Should assets appear in a specific order?', 'text', [
    delivery('Ecomm (Salsify)'),
  ]),
  field(
    'ecommerceProperties',
    'E-commerce properties',
    'multi',
    [delivery('Ecomm (Salsify)')],
    false,
    ['Base', 'Base+', 'Enhanced content', 'eRetailer specific'],
  ),
  field('ecommerceInstructions', 'E-commerce delivery instructions (if applicable)', 'text', [
    delivery('Ecomm (Salsify)'),
  ]),
  field('ecommerceFiles', 'E-commerce delivery files', 'document', [delivery('Ecomm (Salsify)')]),
  field('needsOpenFiles', 'Editable files', 'select', [], false, ['Yes', 'No']),
  field('notes', 'Additional notes'),
  field('attachments', 'Additional attachments', 'document'),
  field('links', 'Additional links', 'link'),
];

export const coreBrands = fields.find((field) => field.id === 'brand')!.options!;

export function brandExceptionNotes(brands: string[] = []): string[] {
  return brands
    .filter((brand) => !coreBrands.some((core) => core.toLowerCase() === brand.toLowerCase()))
    .map(
      (brand) =>
        `Brand exception: ${brand} is also included in this brief, despite being outside of the core 12 NACB Brands.`,
    );
}

// Contact details are collected directly by the application and are never model context.
export const privateFieldIds = new Set(['mainApproverEmail', 'reviewerEmails']);
export const modelFields = fields.filter((field) => !privateFieldIds.has(field.id));

export function activeFields(values: Values): Field[] {
  const hasNeed = (value: string) =>
    (values.requestTypes?.includes('EVOLVE') && values.evolveNeeds?.includes(value)) ||
    (values.requestTypes?.includes('ACCELERATE') && values.accelerateNeeds?.includes(value));
  return fields.filter((f) => {
    if (f.id === 'stockAvailability') return hasNeed('Stock materials');
    if (f.id.startsWith('translation')) return hasNeed('Translation');
    return f.when.every((condition) =>
      condition.any.some((v) => values[condition.field]?.includes(v)),
    );
  });
}

export const alternativeFieldGroups = [
  ['annualCampaign', 'annualCampaignLink'],
  ['contentMatrix', 'contentMatrixLink'],
  ['assetMatrix', 'assetMatrixLink'],
  ['supportingReferences', 'supportingLinks'],
  ['stockMaterials', 'stockMaterialsLink'],
  ['mediaPlan', 'mediaPlanLink'],
  ['attachments', 'links'],
] as const;

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
export type AnalysisPhase = 'scope' | 'document-enrichment' | 'follow-up' | 'final-review';
export type AiRequestTrace = {
  id: string;
  phase: AnalysisPhase;
  model: string;
  thinkingLevel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  thinkingTokens: number | null;
  totalTokens: number | null;
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
  for (const p of a.proposals) {
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
    if (
      p.source.kind === 'document' &&
      (!documents.some((d) => d.id === p.source.documentId) ||
        !p.source.excerpt.trim() ||
        (documents.find((d) => d.id === p.source.documentId)?.mimeType === 'application/pdf' &&
          p.source.page < 1))
    )
      throw new Error('Missing document evidence.');
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
        q.options.length >= 2 &&
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
