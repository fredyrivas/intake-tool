import { test } from 'node:test';
import assert from 'node:assert/strict';
import catalog from './brief-catalog.json' with { type: 'json' };
import interpretation from './brief-interpretation.json' with { type: 'json' };
import workflow from './brief-workflow.json' with { type: 'json' };
import { activeFields, fields, modelFields, moduleIdByFieldId } from './brief-contract.ts';
import instructions from './brief-system-instructions.json' with { type: 'json' };
import {
  systemInstructionForPhase,
  catalogForPhase,
  analysisSchemaForPhase,
} from '../server/brief-instruction.ts';

test('four modules define valid fields, defaults and conditional references', () => {
  assert.deepEqual(
    catalog.modules.map((module) => module.id),
    ['01', '02', '03', '04'],
  );
  assert.deepEqual(
    catalog.modules.map((module) => module.requiredDefault),
    [true, false, false, false],
  );
  const byId = new Map(fields.map((field) => [field.id, field]));
  assert.equal(byId.size, fields.length, 'field IDs must be unique');
  const validTypes = new Set([
    'text',
    'email',
    'emails',
    'number',
    'date',
    'select',
    'multi',
    'document',
    'link',
  ]);
  const checkConditions = (conditions) => {
    for (const condition of conditions) {
      const parent = byId.get(condition.field);
      assert.ok(parent, 'Unknown parent field: ' + condition.field);
      assert.ok(condition.any.length, 'Empty condition for ' + condition.field);
      for (const option of condition.any)
        assert.ok(
          parent.options?.includes(option),
          'Unknown option ' + condition.field + ': ' + option,
        );
    }
  };

  for (const module of catalog.modules) {
    for (const raw of module.fields) {
      const field = byId.get(raw.id);
      assert.equal(moduleIdByFieldId.get(raw.id), module.id);
      assert.ok(validTypes.has(field.type), 'Unknown field type: ' + field.id);
      assert.equal(field.required, raw.required ?? module.requiredDefault);
      if (field.type === 'select' || field.type === 'multi')
        assert.ok(field.options?.length, 'Missing options: ' + field.id);
      if (field.options)
        assert.equal(
          new Set(field.options).size,
          field.options.length,
          'Repeated option: ' + field.id,
        );
      checkConditions(field.when);
    }
  }
  assert.equal(byId.get('projectTitle').required, true);
  assert.equal(byId.get('reviewerEmails').required, false);
  for (const activation of catalog.sharedPolicies.specialActivation) {
    for (const id of activation.fieldIds) assert.ok(byId.has(id), 'Unknown active field: ' + id);
    for (const group of activation.whenAny) checkConditions(group);
  }
  for (const group of catalog.sharedPolicies.alternativeFieldGroups) {
    assert.equal(group.length, 2, 'Each alternative group pairs a file and a link');
    for (const id of group) assert.ok(byId.has(id), 'Unknown alternative field: ' + id);
  }
  for (const id of catalog.sharedPolicies.privateFieldIds)
    assert.ok(byId.has(id) && !modelFields.some((field) => field.id === id));
  assert.ok(
    activeFields({ requestTypes: ['EVOLVE'], evolveNeeds: ['Translation'] }).some(
      (field) => field.id === 'translationLanguage',
    ),
  );
});

test('task configuration resolves unique instruction, field and schema references', () => {
  const byId = new Map(fields.map((field) => [field.id, field]));
  assert.deepEqual(
    Object.keys(interpretation.routeDecisionGuide.routes),
    byId.get('requestTypes').options,
  );
  for (const rule of interpretation.byField)
    for (const id of rule.fieldIds) assert.ok(byId.has(id));
  const blocks = [
    ...interpretation.general,
    ...interpretation.byField,
    ...interpretation.documents,
    ...instructions.common,
    ...instructions.response,
    ...instructions.tasks,
  ];
  const blockIds = new Set(blocks.map((block) => block.id));
  assert.equal(blockIds.size, blocks.length);
  const used = new Set(interpretation.byField.map((block) => block.id));
  for (const [phase, task] of Object.entries(workflow.tasks)) {
    for (const id of [...task.instructionIds, ...task.generalRuleIds, ...task.documentRuleIds]) {
      assert.ok(blockIds.has(id), id);
      used.add(id);
    }
    const prompt = systemInstructionForPhase(
      phase,
      catalogForPhase(phase, {}).map((field) => field.id),
    );
    assert.ok(
      prompt.includes(instructions.tasks.find((block) => block.id === 'task-' + phase).text),
    );
    for (const other of instructions.tasks.filter((block) => block.id !== 'task-' + phase))
      assert.ok(!prompt.includes(other.text));
    assert.ok(!JSON.stringify(analysisSchemaForPhase(phase)).includes('$ref'));
    assert.ok(!JSON.stringify(analysisSchemaForPhase(phase)).includes('maxItems'));
  }
  assert.deepEqual(used, blockIds);
  assert.ok(
    interpretation.byField
      .find((rule) => rule.id === 'project-name')
      .text.includes('resolved in Clarify'),
  );
  assert.deepEqual(
    analysisSchemaForPhase('document-reading').properties.documentClassifications.items.properties
      .fieldId.enum,
    catalog.sharedPolicies.documentRoles,
  );
});

test('task catalogs and criteria stay within their intended scope', () => {
  assert.deepEqual(catalogForPhase('document-reading', {}), []);
  const scope = catalogForPhase('scope', {});
  assert.equal(scope.length, 11);
  assert.ok(scope.some((field) => field.id === 'mainApproverEmail'));
  assert.ok(!scope.some((field) => field.id === 'projectName'));
  assert.ok(
    scope.every((field) => moduleIdByFieldId.get(field.id) === '01' || field.id === 'requestTypes'),
  );
  const reading = systemInstructionForPhase('document-reading', []);
  assert.ok(
    !reading.includes(interpretation.byField.find((rule) => rule.id === 'work-routes').text),
  );
  const followUp = catalogForPhase('follow-up', { brand: ['Glade'] });
  assert.ok(
    followUp.every(
      (field) => field.required && moduleIdByFieldId.get(field.id) === '01' && field.id !== 'brand',
    ),
  );
  const review = catalogForPhase('final-review', { requestTypes: ['EVOLVE'] });
  assert.ok(
    review.every(
      (field) => moduleIdByFieldId.get(field.id) !== '01' && field.id !== 'requestTypes',
    ),
  );
  assert.ok(!review.some((field) => field.id === 'businessContext'));
  assert.ok(
    !systemInstructionForPhase(
      'final-review',
      review.map((field) => field.id),
    ).includes(interpretation.byField.find((rule) => rule.id === 'project-name').text),
  );
});
