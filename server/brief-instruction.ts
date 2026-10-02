import {
  activeFields,
  documentRoles,
  modelFields,
  moduleIdByFieldId,
  presentationMimeType,
  validValue,
  type AnalysisPhase,
  type Attachment,
  type Values,
} from '../shared/brief-contract.ts';
import briefInterpretation from '../shared/brief-interpretation.json' with { type: 'json' };
import briefWorkflow from '../shared/brief-workflow.json' with { type: 'json' };
import systemInstructions from '../shared/brief-system-instructions.json' with { type: 'json' };
import { BRIEF_CONFIG_VERSION } from '../shared/brief-context.ts';

export const BRIEF_INSTRUCTION_VERSION = BRIEF_CONFIG_VERSION;
const blocks = new Map(
  [
    ...systemInstructions.common,
    ...systemInstructions.response,
    ...systemInstructions.tasks,
    ...briefInterpretation.general,
    ...briefInterpretation.byField,
    ...briefInterpretation.documents,
  ].map((block) => [block.id, block]),
);

export function catalogForPhase(
  phase: AnalysisPhase,
  values: Values,
  documents: Attachment[] = [],
) {
  const eligible = modelFields.filter((field) => field.id !== 'projectName');
  const active = new Set(activeFields(values).map((field) => field.id));
  switch (briefWorkflow.tasks[phase].catalog) {
    case 'module-01':
      return eligible.filter((field) => moduleIdByFieldId.get(field.id) === '01');
    case 'routes':
      return eligible.filter((field) => field.id === 'requestTypes');
    case 'route-modules-02-04': {
      // Include reachable child choices, while keeping the selected routes fixed.
      const reachableValues = { ...values };
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const field of activeFields(reachableValues)) {
          if (field.id !== 'requestTypes' && field.options && !reachableValues[field.id]) {
            reachableValues[field.id] = field.options;
            expanded = true;
          }
        }
      }
      const reachable = new Set(activeFields(reachableValues).map((field) => field.id));
      return eligible.filter((field) => reachable.has(field.id) && moduleIdByFieldId.get(field.id) !== '01' && field.id !== 'requestTypes');
    }
    case 'none':
      return [];
    case 'module-01-and-routes':
      return eligible.filter(
        (field) => moduleIdByFieldId.get(field.id) === '01' || field.id === 'requestTypes',
      );
    case 'missing-module-01':
      return eligible.filter(
        (field) =>
          moduleIdByFieldId.get(field.id) === '01' &&
          field.required &&
          !validValue(field, values[field.id], documents),
      );
    case 'active-modules-02-04':
      return eligible.filter(
        (field) =>
          active.has(field.id) &&
          moduleIdByFieldId.get(field.id) !== '01' &&
          field.id !== 'requestTypes',
      );
    default:
      return eligible.filter((field) => active.has(field.id) && field.id !== 'requestTypes');
  }
}

export function systemInstructionForPhase(phase: AnalysisPhase, fieldIds: string[]) {
  const task = briefWorkflow.tasks[phase];
  const ids = [
    ...task.instructionIds,
    ...task.generalRuleIds,
    ...task.documentRuleIds,
    ...(task.fieldCriteria
      ? briefInterpretation.byField
          .filter((rule) => rule.fieldIds.some((id) => fieldIds.includes(id)))
          .map((rule) => rule.id)
      : []),
  ];
  return ids
    .map((id) => {
      const block = blocks.get(id);
      if (!block) throw new Error(`Missing brief instruction block: ${id}`);
      return block.text;
    })
    .join('\n\n');
}

export const ROUTE_DECISION_GUIDE = {
  policy: briefInterpretation.routeDecisionGuide.policy,
  routes: briefInterpretation.routeDecisionGuide.routes,
};

// Expand shared definitions to avoid relying on provider-specific $ref support.
function sourceSchema(documents: Attachment[], fact: boolean) {
  const source = briefWorkflow.responseContracts.definitions.source;
  const branches = [false, true].flatMap((paginated) => {
    const ids = documents.filter((document) =>
      ['application/pdf', presentationMimeType].includes(document.mimeType) === paginated,
    ).map((document) => document.id);
    if (!ids.length) return [];
    return [{
      ...source,
      properties: {
        ...source.properties,
        kind: { type: 'string', enum: ['document'] },
        documentId: { type: 'string', enum: ids },
        page: paginated ? { type: 'integer', minimum: 1 } : { type: 'integer', enum: [0] },
        excerpt: { type: 'string', description: 'A non-empty supporting excerpt from this document. Copy validated sourceFacts evidence when applicable.' },
      },
    }];
  });
  for (const kind of fact ? ['note'] : ['note', 'interpretation']) {
    branches.push({
      ...source,
      properties: {
        ...source.properties,
        kind: { type: 'string', enum: [kind] },
        documentId: { type: 'string', enum: [''] },
        page: { type: 'integer', enum: [0] },
        excerpt: { type: 'string', description: 'Requester text for a note, or reasoning for an interpretation. Never change document evidence into a note or interpretation.' },
      },
    });
  }
  // Extracted facts cannot use web evidence; interpretation URLs are also invalid.
  for (const branch of branches) {
    if (fact || branch.properties.kind.enum.includes('interpretation'))
      delete (branch.properties as Record<string, unknown>).webUrl;
  }
  return { anyOf: branches };
}

function expandSchema(value: unknown, documents?: Attachment[], fact = false): unknown {
  if (Array.isArray(value)) return value.map((child) => expandSchema(child, documents, fact));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (typeof record.$ref === 'string') {
    const key = record.$ref.replace('#/$defs/', '');
    if (key === 'documentRole') return { type: 'string', enum: documentRoles };
    if (key === 'source' && documents) return sourceSchema(documents, fact);
    const definitions = briefWorkflow.responseContracts.definitions;
    if (!(key in definitions)) throw new Error(`Unknown schema definition: ${key}`);
    return expandSchema(definitions[key as keyof typeof definitions], documents, fact || key === 'facts');
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [key, expandSchema(child, documents, fact)]),
  );
}

// Vertex Interactions rejects maxItems in response_format with 400 invalid_request.
// Array limits are still enforced when the response is parsed locally.
function interactionSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(interactionSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'maxItems')
      .map(([key, child]) => [key, interactionSchema(child)]),
  );
}

export const analysisSchema = expandSchema(
  briefWorkflow.responseContracts.analysis,
) as typeof briefWorkflow.responseContracts.analysis;
export function analysisSchemaForPhase(phase: AnalysisPhase, catalog = catalogForPhase(phase, {}), documents: Attachment[] = []) {
  const contract = briefWorkflow.tasks[phase].contract;
  if (contract === 'reading')
    return interactionSchema(
      expandSchema(briefWorkflow.responseContracts.reading, documents),
    ) as Record<string, unknown>;
  const fieldIds = catalog.map((field) => field.id);
  const questionIds = catalog
    .filter((field) => field.required || (['scope', 'route-selection'].includes(phase) && field.id === 'requestTypes'))
    .map((field) => field.id);
  const schema = expandSchema(briefWorkflow.responseContracts.analysis, documents) as typeof analysisSchema;
  const proposals = schema.properties.proposals;
  const questions = schema.properties.questions;
  return interactionSchema({
    ...schema,
    required: [
      ...schema.required,
      ...(contract === 'enrichment' ? ['facts', 'documentClassifications'] : []),
    ],
    properties: {
      ...schema.properties,
      proposals: {
        ...proposals,
        ...(!fieldIds.length ? { maxItems: 0 } : {}),
        items: {
          ...proposals.items,
          properties: {
            ...proposals.items.properties,
            fieldId: { type: 'string', ...(fieldIds.length ? { enum: fieldIds } : {}) },
          },
        },
      },
      questions: {
        ...questions,
        ...(phase === 'final-review' || !questionIds.length ? { maxItems: 0 } : {}),
        items: {
          ...questions.items,
          properties: {
            ...questions.items.properties,
            fieldId: { type: 'string', ...(questionIds.length ? { enum: questionIds } : {}) },
          },
        },
      },
      ...(contract === 'enrichment'
        ? {
            facts: expandSchema(briefWorkflow.responseContracts.definitions.facts, documents, true),
            documentClassifications: expandSchema(
              briefWorkflow.responseContracts.definitions.documentClassifications,
            ),
          }
        : {}),
    },
  }) as typeof analysisSchema;
}
