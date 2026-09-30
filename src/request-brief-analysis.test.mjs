import test from 'node:test';
import assert from 'node:assert/strict';
import { requestBriefAnalysis, AnalysisRequestError } from './request-brief-analysis.ts';
import { createAnalysisJobs } from '../server/analysis-jobs.ts';

const response = (status, data) => new Response(JSON.stringify(data), { status });

test('reports live job stages through polling and stops progress at completion', async () => {
  const jobs = createAnalysisJobs();
  const id = jobs.start();
  const progress = [];
  const stages = ['preparation', 'provider', 'retrying', 'validation'];
  let calls = 0;
  const result = await requestBriefAnalysis('{}', async () => {
    const stage = stages[calls++];
    if (stage) jobs.update(id, { phase: 'scope', stage });
    else jobs.finish(id, 200, { analysis: { summary: 'Complete' } });
    const job = jobs.get(id);
    return response(job.status, job.data);
  }, async () => {}, (update) => progress.push(update));
  assert.deepEqual(progress, stages.map((stage) => ({ phase: 'scope', stage })));
  assert.equal(result.response.status, 200);
  jobs.update(id, { phase: 'scope', stage: 'provider' });
  assert.deepEqual(jobs.get(id).data, { analysis: { summary: 'Complete' } });
});

test('ignores unknown progress without interrupting the analysis', async () => {
  let calls = 0;
  const result = await requestBriefAnalysis('{}', async () => ++calls === 1
    ? response(202, { jobId: 'job-1', progress: { phase: 'unknown', stage: 'unknown' } })
    : response(200, { analysis: {} }), async () => {}, () => assert.fail('Invalid progress'));
  assert.equal(result.response.status, 200);
});

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

test('browser connection failure is distinct from a provider failure', async () => {
  await assert.rejects(requestBriefAnalysis('{}', async () => { throw new TypeError('fetch failed'); }),
    (error) => error instanceof AnalysisRequestError && error.code === 'SERVER_CONNECTION_FAILED' &&
      error.stage === 'network' && error.httpStatus === undefined);
});

test('polling interruption preserves the job ID and does not claim the analysis failed', async () => {
  let calls = 0;
  await assert.rejects(requestBriefAnalysis('{}', async () => {
    if (++calls === 1) return response(202, { jobId: 'known-job' });
    throw new TypeError('fetch failed');
  }, async () => {}), (error) => error.code === 'POLLING_CONNECTION_FAILED' &&
    error.stage === 'polling' && error.requestId === 'known-job' && /result is unknown/.test(error.message));
  assert.equal(calls, 2);
});

test('HTML or malformed server response preserves HTTP and request reference', async () => {
  await assert.rejects(requestBriefAnalysis('{}', async () => new Response('<html>gateway</html>', {
    status: 502, headers: { 'X-Request-ID': 'server-request' },
  })), (error) => error.code === 'INVALID_SERVER_RESPONSE' && error.stage === 'response' &&
    error.httpStatus === 502 && error.requestId === 'server-request');
});

test('browser timeout is distinguished from the server timeout', async () => {
  await assert.rejects(requestBriefAnalysis('{}', async () => {
    throw Object.assign(new Error(), { name: 'TimeoutError' });
  }), (error) => error.code === 'CLIENT_TIMEOUT' && error.httpStatus === undefined);
});
