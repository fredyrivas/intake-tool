import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analysisFailure, createDiagnosticJournal } from './analysis-errors.ts';
import { InteractionOutputError } from './brief-interaction.ts';

test('distinguishes provider HTTP from application HTTP without exposing provider messages', () => {
  for (const [status, code, appStatus] of [
    [400, 'PROVIDER_INVALID_REQUEST', 502],
    [401, 'PROVIDER_AUTH_ERROR', 503],
    [403, 'PROVIDER_AUTH_ERROR', 503],
    [429, 'PROVIDER_RATE_LIMIT', 503],
    [500, 'PROVIDER_UNAVAILABLE', 503],
    [503, 'PROVIDER_UNAVAILABLE', 503],
  ]) {
    const diagnostic = analysisFailure({ status, message: 'private provider content' }, 'provider');
    assert.equal(diagnostic.code, code);
    assert.equal(diagnostic.httpStatus, appStatus);
    assert.equal(diagnostic.providerStatus, status);
    assert.equal(diagnostic.origin, 'gemini');
    assert.ok(!JSON.stringify(diagnostic).includes('private provider content'));
  }
  assert.equal(analysisFailure({ code: 429 }, 'provider').code, 'PROVIDER_RATE_LIMIT');
  assert.equal(analysisFailure(new Error('socket failed'), 'provider').providerStatus, undefined);
});

test('classifies validation, preparation and timeout independently', () => {
  assert.equal(analysisFailure(new Error(), 'request').httpStatus, 400);
  assert.equal(analysisFailure(new Error('private filename'), 'preparation').httpStatus, 422);
  const invalid = analysisFailure(
    new InteractionOutputError('INVALID_ANALYSIS', 'private data'),
    'validation',
  );
  assert.equal(invalid.code, 'INVALID_ANALYSIS');
  assert.equal(invalid.origin, 'server');
  assert.equal(invalid.httpStatus, 422);
  assert.equal(analysisFailure(new Error(), 'provider', true).httpStatus, 504);
  assert.equal(
    analysisFailure({ name: 'APIConnectionTimeoutError' }, 'provider').code,
    'ANALYSIS_TIMEOUT',
  );
  assert.equal(
    analysisFailure({ status: 404 }, 'provider', false, true).code,
    'CONTEXT_UNAVAILABLE',
  );
});

test('journal survives a new writer and preserves independent records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'brief-diagnostics-'));
  try {
    const first = {
      requestId: 'first',
      createdAt: '2026-09-30T16:00:00.000Z',
      code: 'INVALID_JSON',
      httpStatus: 502,
      origin: 'gemini',
      failureStage: 'response',
    };
    await createDiagnosticJournal(root)(first);
    const second = { ...first, requestId: 'second', code: 'ANALYSIS_COMPLETED', httpStatus: 200 };
    await createDiagnosticJournal(root)(second);
    const records = (await readFile(join(root, 'logs/brief-analysis-2026-09-30.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(JSON.parse);
    assert.deepEqual(records, [first, second]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
