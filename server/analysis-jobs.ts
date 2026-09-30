import type { AnalysisProgress } from '../shared/brief-contract.ts';

type JobResult = { status: number; data: unknown };
type Job = { expiresAt: number; result?: JobResult; progress?: AnalysisProgress };

// Local development jobs only. Keep completed results long enough for a delayed poll,
// without retaining uploaded documents or an unbounded history in memory.
export function createAnalysisJobs(now = Date.now) {
  const jobs = new Map<string, Job>();
  function prune() {
    for (const [id, job] of jobs) if (job.expiresAt <= now()) jobs.delete(id);
  }
  return {
    start(id = crypto.randomUUID()) {
      prune();
      while (jobs.size >= 20) jobs.delete(jobs.keys().next().value!);
      jobs.set(id, { expiresAt: now() + 10 * 60_000 });
      return id;
    },
    update(id: string, progress: AnalysisProgress) {
      const job = jobs.get(id);
      if (job && !job.result) job.progress = progress;
    },
    finish(id: string, status: number, data: unknown) {
      const job = jobs.get(id);
      if (job) {
        job.result = { status, data };
        job.expiresAt = now() + 10 * 60_000;
      }
    },
    get(id: string): JobResult {
      prune();
      const job = jobs.get(id);
      if (!job)
        return {
          status: 404,
          data: { code: 'ANALYSIS_JOB_UNAVAILABLE', requestId: id, error: 'Analysis expired or the server restarted. Please retry.' },
        };
      return job.result ?? { status: 202, data: { jobId: id, status: 'running', progress: job.progress } };
    },
  };
}
