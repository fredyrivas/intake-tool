import {
  automaticMessages,
  parseAnalysis,
  type AiRequestTrace,
  type AnalysisPhase,
  type AnalysisProgress,
  type Attachment,
  type Values,
  type Proposal,
} from '../shared/brief-contract.ts';
import {
  contextMatches,
  digest,
  restoreAnalysisContext,
  stampDocuments,
  type AnalysisContext,
} from '../shared/brief-context.ts';
import { requestBriefAnalysis, AnalysisRequestError } from './request-brief-analysis.ts';

type FlowInput = {
  phase: Exclude<AnalysisPhase, 'document-reading'>;
  intent: string;
  message: string;
  documents: Attachment[];
  values: Values;
  provisionalValues?: Values;
  dispositions: Record<string, string>;
  pendingProposals: Pick<Proposal, 'fieldId' | 'values'>[];
  context: AnalysisContext | null;
};

/** Orchestrate internal calls without introducing another screen or losing the reading checkpoint. */
export async function runBriefAnalysis(
  input: FlowInput,
  dependencies: {
    request?: typeof requestBriefAnalysis;
    checkpoint: (context: AnalysisContext | null) => Promise<void>;
    onTrace: (trace: AiRequestTrace) => void;
    onProgress?: (progress: AnalysisProgress) => void;
  },
) {
  const request = dependencies.request ?? requestBriefAnalysis;
  dependencies.onProgress?.({ phase: input.phase, stage: 'preparation' });
  const clientFailure = (
    phase: AnalysisPhase,
    code: string,
    stage: NonNullable<AiRequestTrace['failureStage']>,
    prior?: AiRequestTrace,
    error?: AnalysisRequestError,
    origin: NonNullable<AiRequestTrace['origin']> = 'browser',
    startedAt?: number,
  ) => {
    const trace: AiRequestTrace = {
      id: error?.requestId ?? prior?.id ?? crypto.randomUUID(),
      phase,
      model: 'Unavailable',
      thinkingLevel: 'UNAVAILABLE',
      reason: 'The browser could not complete this analysis operation.',
      createdAt: new Date().toISOString(),
      durationMs: 0,
      inputTokens: null,
      outputTokens: null,
      thinkingTokens: null,
      totalTokens: null,
      ...prior,
      totalDurationMs: startedAt === undefined ? prior?.totalDurationMs : Math.round(performance.now() - startedAt),
      outcome: 'failed',
      origin,
      errorCode: code,
      failureStage: stage,
      httpStatus: error?.httpStatus ?? prior?.httpStatus,
    };
    dependencies.onTrace(trace);
  };
  const checkpoint = async (
    nextContext: AnalysisContext | null,
    phase: AnalysisPhase,
    trace?: AiRequestTrace,
    startedAt?: number,
  ) => {
    try {
      if (nextContext) dependencies.onProgress?.({ phase, stage: 'checkpoint' });
      await dependencies.checkpoint(nextContext);
    } catch (error) {
      clientFailure(phase, 'CHECKPOINT_FAILED', 'checkpoint', trace, undefined, 'browser', startedAt);
      throw error;
    }
  };
  const stamps = await stampDocuments(input.documents);
  const intentDigest = await digest(input.intent.trim());
  let context = restoreAnalysisContext(input.context, input.documents);
  if (!contextMatches(context, intentDigest, stamps)) {
    context = null;
    await checkpoint(null, input.phase);
  }
  const call = async (phase: AnalysisPhase, message: string) => {
    const startedAt = performance.now();
    dependencies.onProgress?.({ phase, stage: 'submission' });
    let trace: AiRequestTrace | undefined;
    let reported = false;
    try {
      const result = await request(
        JSON.stringify({
          ...input,
          phase,
          message,
          context,
          notes: '',
          rejected: [],
          conversation: [],
          documents: input.documents.map((doc) => ({
            ...doc,
            data:
              ['document-reading', 'general-information'].includes(phase) ||
              (phase === 'document-enrichment' &&
                !context?.documents.some((stamp) => stamp.id === doc.id))
                ? doc.data
                : '',
          })),
        }),
        undefined,
        undefined,
        dependencies.onProgress,
      );
      trace = result.result.trace;
      if (!result.response.ok) {
        if (trace) trace = { ...trace, totalDurationMs: Math.round(performance.now() - startedAt) };
        if (trace) dependencies.onTrace(trace);
        else
          clientFailure(
            phase,
            result.result.code ?? 'SERVER_ERROR',
            result.result.diagnostic?.failureStage ?? 'request',
            undefined,
            new AnalysisRequestError(
              '',
              result.result.code ?? 'SERVER_ERROR',
              'response',
              result.result.requestId,
              result.response.status,
            ),
            result.result.diagnostic?.origin ?? 'server',
            startedAt,
          );
        reported = true;
        // Persist the diagnostic while retaining the last validated source context.
        await checkpoint(context, phase, trace, startedAt);
        if (result.result.code === 'CONTEXT_UNAVAILABLE') throw new ContextUnavailable();
        throw new Error(result.result.error || 'We could not analyze this brief.');
      }
      dependencies.onProgress?.({ phase, stage: 'validation' });
      const nextContext = restoreAnalysisContext(result.result.context, input.documents);
      if (!nextContext || !contextMatches(nextContext, intentDigest, stamps))
        throw new Error('Invalid analysis context. Please retry.');
      // Validate before persisting an ID that could otherwise poison subsequent calls.
      const analysis =
        phase === 'document-reading'
          ? null
          : parseAnalysis(result.result.analysis, input.documents);
      if (trace) {
        trace = { ...trace, totalDurationMs: Math.round(performance.now() - startedAt) };
        dependencies.onTrace(trace);
      }
      reported = true;
      await checkpoint(nextContext, phase, trace, startedAt);
      context = nextContext;
      return analysis;
    } catch (error) {
      if (!reported) {
        if (error instanceof AnalysisRequestError)
          clientFailure(phase, error.code, error.stage, trace, error, 'browser', startedAt);
        else clientFailure(phase, 'CLIENT_VALIDATION_FAILED', 'validation', trace, undefined, 'browser', startedAt);
        await checkpoint(context, phase, trace, startedAt);
      }
      throw error;
    }
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (input.phase === 'general-information') return (await call(input.phase, input.message))!;
      if (!context) await call('document-reading', input.intent.trim());
      if (
        input.phase !== 'document-enrichment' &&
        stamps.some((stamp) => !context!.documents.some((old) => old.id === stamp.id))
      ) {
        await call('document-enrichment', automaticMessages['document-enrichment']);
      }
      return (await call(input.phase, input.message))!;
    } catch (error) {
      if (!(error instanceof ContextUnavailable) || attempt) throw error;
      context = null;
      await checkpoint(null, input.phase);
    }
  }
  throw new Error('Could not rebuild the source context. Please retry.');
}
class ContextUnavailable extends Error {
  constructor() {
    super('The source context expired. Please retry.');
  }
}
