import test from 'node:test';
import assert from 'node:assert/strict';
import { requestBriefAnalysis } from './request-brief-analysis.ts';
import { createAnalysisJobs } from '../server/analysis-jobs.ts';

const response = (status, data) => new Response(JSON.stringify(data), { status });

test('uploads once and polls to completion for an analysis taking 120 simulated seconds', async () => {
  let now = 0;
  const jobs = createAnalysisJobs(() => now);
  let id;
  let uploads = 0;
  let polls = 0;
  const data = {
    analysis: { summary: 'Read all supplied content' },
    trace: { durationMs: 120_000 },
  };
  const result = await requestBriefAnalysis(
    '{"documents":["large-file"]}',
    async (url, options) => {
      if (options.method === 'POST') {
        uploads++;
        assert.equal(url, '/api/brief/analyze?async=1');
        assert.equal(options.body, '{"documents":["large-file"]}');
        id = jobs.start();
        return response(202, { jobId: id });
      }
      polls++;
      assert.equal(url, `/api/brief/analyze?job=${id}`);
      assert.equal(options.body, undefined);
      if (now >= 120_000) jobs.finish(id, 200, data);
      const job = jobs.get(id);
      return response(job.status, job.data);
    },
    async (ms) => {
      now += ms;
    },
  );
  assert.equal(uploads, 1);
  assert.equal(polls, 120);
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.result, data);
});

test('returns validation failures without polling', async () => {
  const result = await requestBriefAnalysis(
    '{}',
    async () => response(400, { error: 'Invalid file' }),
    async () => assert.fail('should not poll'),
  );
  assert.equal(result.response.status, 400);
});

test('returns terminal failures and their trace without resubmitting the analysis', async () => {
  let calls = 0;
  const data = { error: 'Timed out', trace: { durationMs: 300_000 } };
  const result = await requestBriefAnalysis(
    '{}',
    async () => {
      calls++;
      return calls === 1 ? response(202, { jobId: 'job-1' }) : response(504, data);
    },
    async () => {},
  );
  assert.equal(calls, 2);
  assert.equal(result.response.status, 504);
  assert.deepEqual(result.result, data);
});

test('rejects an invalid job reference', async () => {
  await assert.rejects(
    requestBriefAnalysis('{}', async () => response(202, { jobId: '../other' })),
    /invalid analysis reference/,
  );
});
