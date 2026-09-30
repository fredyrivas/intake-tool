import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeFields, fieldIsRequired } from '../shared/brief-contract.ts';
import {
  clarificationItemResolved,
  clarificationItemsFor,
  clarificationSectionsFor,
} from './brief-sections.ts';

test('clarification asks only unanswered required Module 01 fields', () => {
  const values = {
    requestTypes: ['EVOLVE'],
    evolveNeeds: ['VO recording'],
    deliveryTypes: ['Extreme Reach (TVC)'],
    brand: ['Glade'],
  };
  const ids = clarificationItemsFor(values).map((item) => item.field.id);
  assert.deepEqual(ids, [
    'projectTitle',
    'brand',
    'region',
    'mainApproverEmail',
    'assetType',
    'expectedDeliveryDate',
    'mediaPlacementRetailer',
    'totalAssets',
    'creativeDirection',
  ]);
  assert.ok(!ids.includes('reviewerEmails'));
  assert.ok(!ids.includes('requestTypes'));
  assert.ok(!ids.includes('firstAirDate'));
  assert.ok(!ids.includes('buyoutDetails'));
  assert.deepEqual(
    clarificationSectionsFor(values).map((section) => section.name),
    ['01 · Project basics'],
  );
  assert.ok(activeFields(values).some((field) => field.id === 'firstAirDate'));
});

test('a pending required answer stays in clarification, even with a stale conditional flag', () => {
  const values = { requestTypes: ['EVOLVE'] };
  const item = clarificationItemsFor(values).find((candidate) => candidate.field.id === 'region');
  assert.ok(item);
  assert.ok(!clarificationItemResolved(item, values, [], { region: 'pending' }, {}));
  assert.ok(!clarificationItemResolved(item, values, [], { region: 'pending' }, {}, ['region']));
});

test('conditional fields remain optional when a parent option is selected', () => {
  const field = activeFields({
    requestTypes: ['EVOLVE'],
    deliveryTypes: ['Extreme Reach (TVC)'],
  }).find((candidate) => candidate.id === 'firstAirDate');
  assert.ok(field);
  assert.equal(fieldIsRequired(field, ['firstAirDate']), false);
});
