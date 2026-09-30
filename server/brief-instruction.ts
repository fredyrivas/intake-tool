import {
  activeFields,
  documentRoles,
  modelFields,
  moduleIdByFieldId,
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
function expandSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(expandSchema);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (typeof record.$ref === 'string') {
    const key = record.$ref.replace('#/$defs/', '');
    if (key === 'documentRole') return { type: 'string', enum: documentRoles };
    const definitions = briefWorkflow.responseContracts.definitions;
    if (!(key in definitions)) throw new Error(`Unknown schema definition: ${key}`);
    return expandSchema(definitions[key as keyof typeof definitions]);
  }
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [key, expandSchema(child)]),
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
export function analysisSchemaForPhase(phase: AnalysisPhase, catalog = catalogForPhase(phase, {})) {
  const contract = briefWorkflow.tasks[phase].contract;
  if (contract === 'reading')
    return interactionSchema(
      expandSchema(briefWorkflow.responseContracts.reading),
    ) as Record<string, unknown>;
  const fieldIds = catalog.map((field) => field.id);
  const questionIds = catalog
    .filter((field) => field.required || (phase === 'scope' && field.id === 'requestTypes'))
    .map((field) => field.id);
  const proposals = analysisSchema.properties.proposals;
  const questions = analysisSchema.properties.questions;
  return interactionSchema({
    ...analysisSchema,
    required: [
      ...analysisSchema.required,
      ...(contract === 'enrichment' ? ['facts', 'documentClassifications'] : []),
    ],
    properties: {
      ...analysisSchema.properties,
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
            facts: expandSchema(briefWorkflow.responseContracts.definitions.facts),
            documentClassifications: expandSchema(
              briefWorkflow.responseContracts.definitions.documentClassifications,
            ),
          }
        : {}),
    },
  }) as typeof analysisSchema;
}
