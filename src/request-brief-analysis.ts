// Analysis runs independently of each short HTTP request. Large presentations
// may exceed the former 90-second deadline without losing the pending result.
export async function requestBriefAnalysis(
  body: string,
  fetcher: typeof fetch = fetch,
  wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
) {
  const signal = AbortSignal.timeout(6 * 60_000);
  let response = await fetcher('/api/brief/analyze?async=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
  });
  let result = await response.json();
  if (response.status !== 202) return { response, result };
  const jobId = result.jobId;
  if (typeof jobId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(jobId))
    throw new Error('The server returned an invalid analysis reference. Please retry.');
  while (response.status === 202) {
    signal.throwIfAborted();
    await wait(1000);
    response = await fetcher(`/api/brief/analyze?job=${encodeURIComponent(jobId)}`, { signal });
    result = await response.json();
  }
  return { response, result };
}
