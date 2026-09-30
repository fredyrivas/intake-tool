import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AiRequestTrace } from '../shared/brief-contract.ts';
import { InteractionOutputError, isMissingInteraction } from './brief-interaction.ts';

export function analysisFailure(
  error: unknown,
  stage: NonNullable<AiRequestTrace['failureStage']>,
  timedOut = false,
  chained = false,
) {
  const failure = error as { status?: unknown; code?: unknown; name?: unknown } | null;
  const providerStatus =
    typeof failure?.status === 'number'
      ? failure.status
      : typeof failure?.code === 'number'
        ? failure.code
        : undefined;
  const base = { failureStage: stage, providerStatus };
  const result = (
    code: string,
    httpStatus: number,
    origin: NonNullable<AiRequestTrace['origin']>,
    error: string,
  ) => ({ ...base, code, httpStatus, origin, error });
  if (chained && isMissingInteraction(error))
    return result('CONTEXT_UNAVAILABLE', 409, 'gemini', 'The source context needs to be rebuilt.');
  if (timedOut || failure?.name === 'TimeoutError' || failure?.name === 'APIConnectionTimeoutError')
    return result(
      'ANALYSIS_TIMEOUT',
      504,
      'server',
      'The analysis exceeded its time limit. Your text and files are still here. Please retry.',
    );
  if (error instanceof InteractionOutputError)
    return result(
      error.code,
      error.code === 'INVALID_ANALYSIS' ? 422 : 502,
      error.code === 'INVALID_ANALYSIS' ? 'server' : 'gemini',
      error.code === 'TOOL_ACTION_REQUIRED'
        ? 'The AI service requested a client tool that this analysis does not support. Your text and files are still here.'
        : error.code === 'INVALID_ANALYSIS'
        ? 'The AI response did not pass evidence validation after recovery. Your text and files are still here.'
        : 'The AI response was incomplete or unreadable after recovery. Your text and files are still here. Please retry.',
    );
  if (stage === 'request')
    return result(
      'INVALID_ANALYSIS_REQUEST',
      400,
      'server',
      'Check the files and message. Use up to 6 PDF, PPTX, XLSX, TXT, PNG or JPEG files, 8 MB each and 15 MB total.',
    );
  if (stage === 'preparation')
    return result(
      'DOCUMENT_PREPARATION_FAILED',
      422,
      'server',
      'An attachment could not be prepared for analysis. Check that it opens correctly and try again.',
    );
  if (providerStatus === 401 || providerStatus === 403)
    return result(
      'PROVIDER_AUTH_ERROR',
      503,
      'gemini',
      'The AI service could not authenticate this request. Check the server connection credentials.',
    );
  if (providerStatus === 400 || providerStatus === 422)
    return result(
      'PROVIDER_INVALID_REQUEST',
      502,
      'gemini',
      'The AI service rejected the analysis configuration. Review the diagnostic reference before retrying.',
    );
  if (providerStatus === 429)
    return result(
      'PROVIDER_RATE_LIMIT',
      503,
      'gemini',
      'The AI service is temporarily limiting requests. Please try again shortly.',
    );
  if (providerStatus !== undefined && providerStatus >= 500)
    return result(
      'PROVIDER_UNAVAILABLE',
      503,
      'gemini',
      'The AI service is temporarily unavailable. Please try again shortly.',
    );
  return result(
    'PROVIDER_ERROR',
    502,
    'gemini',
    'The server could not complete its connection to the AI service. Review the diagnostic reference.',
  );
}

export type AnalysisDiagnostic = {
  requestId: string;
  createdAt: string;
  httpStatus: number;
  code: string;
  origin: NonNullable<AiRequestTrace['origin']>;
  failureStage?: AiRequestTrace['failureStage'];
  providerStatus?: number;
  trace?: AiRequestTrace;
};

// Only application-built metadata reaches this journal. No inputs, partial JSON,
// provider messages, document names, or credentials. Persist independently of drafts.
export function createDiagnosticJournal(root = process.cwd()) {
  let queue = Promise.resolve();
  return (diagnostic: AnalysisDiagnostic) => {
    queue = queue
      .then(async () => {
        const directory = join(root, 'logs');
        await mkdir(directory, { recursive: true });
        const date = diagnostic.createdAt.slice(0, 10);
        await appendFile(
          join(directory, `brief-analysis-${date}.jsonl`),
          `${JSON.stringify(diagnostic)}\n`,
          { mode: 0o600 },
        );
      })
      .catch(() => {
        // A broken journal must not replace the original failure or block analysis.
        console.error('[brief-analysis] diagnostic journal unavailable', {
          requestId: diagnostic.requestId,
        });
      });
    return queue;
  };
}
