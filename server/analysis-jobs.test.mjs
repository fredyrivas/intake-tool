import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalysisJobs } from './analysis-jobs.ts';

test('keeps a job available beyond 90 seconds and preserves the completed result', () => {
  let now = 0;
  const jobs = createAnalysisJobs(() => now);
  const id = jobs.start();
  now = 120_000;
  assert.equal(jobs.get(id).status, 202);
  const data = { analysis: { summary: 'Complete' }, trace: { durationMs: now } };
  jobs.finish(id, 200, data);
  assert.deepEqual(jobs.get(id), { status: 200, data });
  assert.deepEqual(jobs.get(id), { status: 200, data });
});

test('preserves failure traces and expires results after the retention period', () => {
  let now = 0;
  const jobs = createAnalysisJobs(() => now);
  const id = jobs.start();
  const data = { error: 'Timed out', trace: { durationMs: 300_000 } };
  now = 300_000;
  jobs.finish(id, 504, data);
  assert.deepEqual(jobs.get(id), { status: 504, data });
  now += 600_000;
  assert.equal(jobs.get(id).status, 404);
  assert.equal(jobs.get('unknown').status, 404);
});

test('bounds retained results', () => {
  const jobs = createAnalysisJobs(() => 0);
  const first = jobs.start();
  for (let i = 0; i < 20; i++) jobs.finish(jobs.start(), 200, {});
  assert.equal(jobs.get(first).status, 404);
});
