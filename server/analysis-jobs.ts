type JobResult = { status: number; data: unknown };
type Job = { expiresAt: number; result?: JobResult };

// Local development jobs only. Keep completed results long enough for a delayed poll,
// without retaining uploaded documents or an unbounded history in memory.
export function createAnalysisJobs(now = Date.now) {
  const jobs = new Map<string, Job>();
  function prune() {
    for (const [id, job] of jobs) if (job.expiresAt <= now()) jobs.delete(id);
  }
  return {
    start() {
      prune();
      while (jobs.size >= 20) jobs.delete(jobs.keys().next().value!);
      const id = crypto.randomUUID();
      jobs.set(id, { expiresAt: now() + 10 * 60_000 });
      return id;
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
          data: { error: 'Analysis expired or the server restarted. Please retry.' },
        };
      return job.result ?? { status: 202, data: { jobId: id, status: 'running' } };
    },
  };
}
