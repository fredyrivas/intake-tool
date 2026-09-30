import type { GroundingMetadata, Part } from '@google/genai';
import { setTimeout as delay } from 'node:timers/promises';
import {
  analysisForActivePath,
  fields,
  type Analysis,
  type AnalysisPhase,
  type Attachment,
  type Values,
} from '../shared/brief-contract.ts';
import {
  BRIEF_CONFIG_VERSION,
  digest,
  parseSourceReading,
  stampDocuments,
  type AnalysisContext,
} from '../shared/brief-context.ts';
import { applyDocumentClassifications } from './document-classification.ts';
import { validateRetailerWebEvidence } from './web-evidence.ts';
import { catalogForPhase } from './brief-instruction.ts';

export function interactionInput(parts: Part[]) {
  return parts.map((part) => {
    if (part.text !== undefined) return { type: 'text' as const, text: part.text };
    if (part.inlineData?.data && part.inlineData.mimeType)
      return {
        type: part.inlineData.mimeType.startsWith('image/')
          ? ('image' as const)
          : ('document' as const),
        data: part.inlineData.data,
        mime_type: part.inlineData.mimeType,
      };
    throw new Error('Unsupported interaction input.');
  });
}

type InteractionOutput = {
  id: string;
  status?: string;
  output_text?: string;
  steps?: {
    type: string;
    id?: string;
    call_id?: string;
    content?: {
      type: string;
      text?: string;
      annotations?: { type: string; url?: string; title?: string }[];
    }[];
  }[];
};
export class InteractionOutputError extends Error {
  code: 'INCOMPLETE_OUTPUT' | 'INVALID_JSON' | 'INVALID_ANALYSIS' | 'INTERACTION_FAILED' | 'TOOL_ACTION_REQUIRED';
  constructor(
    code: InteractionOutputError['code'],
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

/** Reconcile non-final create responses with the stored interaction, without
 * regenerating the request or executing model-supplied client functions. */
export async function settleInteraction<T extends InteractionOutput>(
  initial: T,
  get: (id: string) => Promise<T>,
  signal: AbortSignal,
  onUpdate: (result: T) => void = () => {},
  wait = (signal: AbortSignal) => delay(1000, undefined, { signal }),
): Promise<T> {
  let result = initial;
  let checked = false;
  while (['requires_action', 'in_progress', 'queued'].includes(result.status ?? '')) {
    signal.throwIfAborted();
    const resolved = new Set((result.steps ?? [])
      .filter((step) => step.type === 'function_result').map((step) => step.call_id));
    if (checked && result.status === 'requires_action' && (result.steps ?? [])
      .some((step) => step.type === 'function_call' && !resolved.has(step.id)))
      throw new InteractionOutputError('TOOL_ACTION_REQUIRED', 'The interaction requires an unsupported client function.');
    if (checked) await wait(signal);
    signal.throwIfAborted();
    const next = await get(initial.id);
    if (next.id !== initial.id)
      throw new InteractionOutputError('INTERACTION_FAILED', 'Unexpected interaction reference.');
    result = next;
    onUpdate(result);
    checked = true;
  }
  return result;
}

export function interactionDiagnostics(result: InteractionOutput) {
  const text = result.output_text || (result.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === 'text')
    .map((content) => content.text ?? '').join('');
  return {
    interactionId: result.id,
    interactionStatus: result.status,
    responseCharacters: text.length,
    stepTypes: [...new Set((result.steps ?? []).map((step) => step.type))],
  };
}

export function interactionResponse(result: InteractionOutput) {
  if (result.status !== 'completed' || !result.id)
    throw new InteractionOutputError(
      result.status === 'incomplete' || result.status === 'budget_exceeded'
        ? 'INCOMPLETE_OUTPUT'
        : 'INTERACTION_FAILED',
      'Incomplete Gemini interaction.',
    );
  const texts = (result.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((content) => content.type === 'text');
  const metadata: GroundingMetadata = {
    groundingChunks: texts.flatMap((content) =>
      (content.annotations ?? []).flatMap((annotation) =>
        annotation.type === 'url_citation' && annotation.url?.startsWith('https://')
          ? [{ web: { uri: annotation.url, title: annotation.title } }]
          : [],
      ),
    ),
  };
  try {
    return {
      data: JSON.parse(result.output_text || texts.map((content) => content.text ?? '').join('')),
      metadata,
    };
  } catch {
    // Do not include the provider's partial JSON (potentially personal data) in diagnostics.
    throw new InteractionOutputError('INVALID_JSON', 'The model returned invalid JSON.');
  }
}

export async function finishInteraction(
  result: InteractionOutput,
  input: {
    phase: AnalysisPhase;
    documents: Attachment[];
    values: Values;
    intent: string;
    context: AnalysisContext | null;
    dispositions: Record<string, string>;
  },
) {
  const { data, metadata } = interactionResponse(result);
  const contents = input.documents.filter((doc) => doc.data);
  let reading = input.context?.reading;
  if (input.phase === 'document-reading' || input.phase === 'document-enrichment') {
    const extracted = parseSourceReading(data, contents);
    reading =
      input.phase === 'document-reading' || !reading
        ? extracted
        : {
            summary: extracted.summary,
            facts: [...reading.facts, ...extracted.facts].slice(-150),
            documentClassifications: [
              ...reading.documentClassifications.filter(
                (item) => !contents.some((doc) => doc.id === item.documentId),
              ),
              ...extracted.documentClassifications,
            ],
            warnings: [...new Set([...reading.warnings, ...extracted.warnings])].slice(-20),
          };
  }
  if (!reading) throw new Error('Source reading is required.');
  const incomingStamps = await stampDocuments(contents);
  const context: AnalysisContext = {
    version: 1,
    configurationVersion: BRIEF_CONFIG_VERSION,
    intentDigest: await digest(input.intent.trim()),
    documents:
      input.phase === 'document-reading'
        ? incomingStamps
        : [
            ...(input.context?.documents ?? []).filter(
              (old) => !incomingStamps.some((doc) => doc.id === old.id),
            ),
            ...incomingStamps,
          ],
    reading,
    readingInteractionId:
      input.phase === 'document-reading' ? result.id : input.context!.readingInteractionId,
    latestInteractionId: result.id,
  };
  if (input.phase === 'document-reading') return { context, analysis: null };
  const withClassifications = { ...data, documentClassifications: reading.documentClassifications };
  const parsed = analysisForActivePath(
    applyDocumentClassifications(
      validateRetailerWebEvidence(withClassifications, metadata),
      input.documents,
    ),
    input.values,
  );
  const allowed = new Set(
    catalogForPhase(input.phase, input.values, input.documents).map((field) => field.id),
  );
  const analysis: Analysis = {
    ...parsed,
    warnings: [
      ...new Set([
        ...parsed.warnings,
        ...parsed.proposals
          .filter(
            (proposal) =>
              allowed.has(proposal.fieldId) &&
              input.values[proposal.fieldId]?.length &&
              JSON.stringify(input.values[proposal.fieldId]) !== JSON.stringify(proposal.values),
          )
          .map(
            (proposal) =>
              `The source information conflicts with the confirmed ${fields.find((field) => field.id === proposal.fieldId)?.label}. The confirmed value was retained.`,
          ),
      ]),
    ].slice(0, 20),
    proposals: parsed.proposals.filter(
      (proposal) =>
        allowed.has(proposal.fieldId) &&
        !input.values[proposal.fieldId]?.length &&
        input.dispositions[proposal.fieldId] !== 'not-applicable',
    ),
    questions:
      input.phase === 'final-review'
        ? []
        : parsed.questions.filter(
            (question) =>
              allowed.has(question.fieldId) &&
              (fields.find((field) => field.id === question.fieldId)?.required ||
                (input.phase === 'scope' && question.fieldId === 'requestTypes')) &&
              !input.values[question.fieldId]?.length,
          ),
  };
  return { context, analysis };
}

export function isMissingInteraction(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const failure = error as { status?: number; code?: number; message?: string };
  const status = failure.status ?? failure.code;
  return (
    status === 404 ||
    (status === 400 &&
      /previous_interaction|interaction.{0,40}(expired|not found|invalid)/i.test(
        failure.message ?? '',
      ))
  );
}
