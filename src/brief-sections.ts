import {
  activeFields,
  alternativeFieldGroups,
  fields,
  fieldIsRequired,
  moduleIdByFieldId,
  validValue,
  type Attachment,
  type Field,
  type Proposal,
  type Values,
} from '../shared/brief-contract.ts';

const deliverableIds = new Set([
  'requestTypes',
  'createDeliverables',
  'evolveDeliverables',
  'accelerateDeliverables',
  'innovateDeliverables',
  'copyServices',
]);
const productionIds = new Set([
  'evolveNeeds',
  'accelerateNeeds',
  'musicDetails',
  'musicReferences',
  'voLanguage',
  'castingBrief',
  'buyoutDetails',
  'stockAvailability',
  'stockMaterials',
  'stockMaterialsLink',
  'stockDirection',
  'translationLanguage',
  'translationInstructions',
  'translationCopy',
  'otherProductionNotes',
  'otherProductionFiles',
]);

export const sectionOrder = [
  '01 · Project basics',
  '02A · Path and deliverables',
  '02B · Brief inputs',
  '02C · Production needs',
  '03 · Delivery',
  '04 · Additional information',
] as const;

export const sectionDescriptions: Record<(typeof sectionOrder)[number], string> = {
  '01 · Project basics': 'Shared information for every Workspace request.',
  '02A · Path and deliverables': 'The confirmed route determines every brief input that follows.',
  '02B · Brief inputs': 'Context and source material needed for the selected route.',
  '02C · Production needs': 'Only the production services selected above appear here.',
  '03 · Delivery': 'The chosen delivery methods reveal their own instructions and specifications.',
  '04 · Additional information': 'Optional context that does not belong to a specific requirement.',
};

export function sectionFor(field: Field) {
  const moduleId = moduleIdByFieldId.get(field.id);
  if (moduleId === '01') return '01 · Project basics';
  if (moduleId === '03') return '03 · Delivery';
  if (moduleId === '04') return '04 · Additional information';
  if (deliverableIds.has(field.id)) return '02A · Path and deliverables';
  if (productionIds.has(field.id)) return '02C · Production needs';
  return '02B · Brief inputs';
}

export function clarificationSectionsFor(values: Values) {
  const secondaryIds = new Set<string>(alternativeFieldGroups.map((group) => group[1]));
  const fields = activeFields(values).filter(
    (field) => field.required && field.id !== 'projectName' && !secondaryIds.has(field.id),
  );
  return sectionOrder
    .map((name) => ({ name, fields: fields.filter((field) => sectionFor(field) === name) }))
    .filter((section) => section.fields.length);
}

export type ClarificationItem = {
  field: Field;
  companion?: Field;
  section: (typeof sectionOrder)[number];
};

export function clarificationItemsFor(values: Values): ClarificationItem[] {
  const byId = new Map(fields.map((field) => [field.id, field]));
  return clarificationSectionsFor(values).flatMap(({ name, fields: sectionFields }) =>
    sectionFields.map((field) => ({
      field,
      companion: byId.get(alternativeFieldGroups.find((group) => group[0] === field.id)?.[1] || ''),
      section: name,
    })),
  );
}

export function clarificationItemResolved(
  item: ClarificationItem,
  values: Values,
  documents: Attachment[],
  dispositions: Record<string, 'pending' | 'not-applicable'>,
  suggested: Record<string, Proposal>,
  conditionalRequiredFieldIds: string[] = [],
) {
  const candidates = item.companion ? [item.field, item.companion] : [item.field];
  if (candidates.some((field) => suggested[field.id])) return false;
  if (candidates.some((field) => validValue(field, values[field.id], documents))) return true;
  return (
    !fieldIsRequired(item.field, conditionalRequiredFieldIds) &&
    (candidates.every((field) => dispositions[field.id] === 'not-applicable') ||
      candidates.every((field) => dispositions[field.id] === 'pending'))
  );
}
