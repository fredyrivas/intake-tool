import type { AnalysisProgress } from '../shared/brief-contract.ts';

// Analysis runs independently of each short HTTP request. Large presentations
// may exceed the former 90-second deadline without losing the pending result.
export async function requestBriefAnalysis(
  body: string,
  fetcher: typeof fetch = fetch,
  wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  onProgress?: (progress: AnalysisProgress) => void,
) {
  const signal = AbortSignal.timeout(6 * 60_000);
  let requestId: string | undefined;
  let stage: AnalysisRequestError['stage'] = 'network';
  let httpStatus: number | undefined;
  const read = async (response: Response) => {
    httpStatus = response.status;
    requestId = response.headers.get('X-Request-ID') || requestId;
    try {
      const data = await response.json();
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      if (response.status === 202 && data.progress &&
        ['general-information', 'route-selection', 'route-details', 'document-reading', 'scope', 'document-enrichment', 'follow-up', 'final-review'].includes(data.progress.phase) &&
        ['preparation', 'provider', 'retrying', 'validation'].includes(data.progress.stage))
        onProgress?.({ phase: data.progress.phase, stage: data.progress.stage });
      return data;
    } catch {
      throw new AnalysisRequestError(
        'The server returned an unreadable analysis response. Your text and files are still here.',
        'INVALID_SERVER_RESPONSE',
        'response',
        requestId,
        httpStatus,
      );
    }
  };
  try {
    let response = await fetcher('/api/brief/analyze?async=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal,
    });
    let result = await read(response);
    if (response.status !== 202) return { response, result };
    const jobId = result.jobId;
    if (typeof jobId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(jobId))
      throw new AnalysisRequestError(
        'The server returned an invalid analysis reference. Please retry.',
        'INVALID_JOB_REFERENCE',
        'response',
        requestId,
        httpStatus,
      );
    requestId = jobId;
    stage = 'polling';
    while (response.status === 202) {
      signal.throwIfAborted();
      await wait(1000);
      response = await fetcher(`/api/brief/analyze?job=${encodeURIComponent(jobId)}`, { signal });
      result = await read(response);
    }
    return { response, result };
  } catch (error) {
    if (error instanceof AnalysisRequestError) throw error;
    const timeout = signal.aborted || (error instanceof Error && error.name === 'TimeoutError');
    throw new AnalysisRequestError(
      timeout
        ? 'The browser stopped waiting for the analysis. The server result is unknown; keep the diagnostic reference.'
        : stage === 'polling'
          ? 'The connection was interrupted while checking the analysis. The server result is unknown; keep the diagnostic reference.'
          : 'The browser could not reach the analysis server. Check the connection and keep your text and files.',
      timeout
        ? 'CLIENT_TIMEOUT'
        : stage === 'polling'
          ? 'POLLING_CONNECTION_FAILED'
          : 'SERVER_CONNECTION_FAILED',
      stage,
      requestId,
    );
  }
}
export class AnalysisRequestError extends Error {
  code: string;
  stage: 'network' | 'polling' | 'response';
  requestId?: string;
  httpStatus?: number;
  constructor(
    message: string,
    code: string,
    stage: AnalysisRequestError['stage'],
    requestId?: string,
    httpStatus?: number,
  ) {
    super(message);
    this.code = code;
    this.stage = stage;
    this.requestId = requestId;
    this.httpStatus = httpStatus;
  }
}
