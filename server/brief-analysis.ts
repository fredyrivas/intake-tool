import { GoogleGenAI, ThinkingLevel, type Part } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { setTimeout as delay } from 'node:timers/promises';
import {
  activeFields,
  modelFields,
  cleanValues,
  fileLimits,
  fileTypes,
  presentationMimeType,
  type AiRequestTrace,
  type AnalysisPhase,
  type Attachment,
} from '../shared/brief-contract.ts';
import {
  analysisSchemaForPhase,
  systemInstructionForPhase,
  catalogForPhase,
  BRIEF_INSTRUCTION_VERSION,
  ROUTE_DECISION_GUIDE,
} from './brief-instruction.ts';
import { extractOfficeText, extractPowerPointImages } from './office-text.ts';
import {
  finishInteraction,
  interactionInput,
  interactionResponse,
  interactionDiagnostics,
  settleInteraction,
  InteractionOutputError,
} from './brief-interaction.ts';
import { digest, restoreAnalysisContext } from '../shared/brief-context.ts';
import { createAnalysisJobs } from './analysis-jobs.ts';
import { analysisFailure, createDiagnosticJournal, type AnalysisDiagnostic } from './analysis-errors.ts';

function reply(response: ServerResponse, status: number, data: unknown) {
  const payload = data as { requestId?: string; jobId?: string; trace?: AiRequestTrace };
  const requestId = payload.requestId ?? payload.trace?.id ?? payload.jobId;
  if (requestId) response.setHeader?.('X-Request-ID', requestId);
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}
export async function readAnalysisRequest(request: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > 22 * 1024 * 1024) throw new Error('Request is too large.');
    chunks.push(bytes);
  }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (
    !input ||
    typeof input !== 'object' ||
    !Array.isArray(input.documents) ||
    input.documents.length > fileLimits.count
  )
    throw new Error('Invalid documents.');
  const phase: AnalysisPhase = [
    'document-reading',
    'scope',
    'document-enrichment',
    'follow-up',
    'final-review',
  ].includes(input.phase)
    ? input.phase
    : 'scope';
  let total = 0;
  const ids = new Set<string>();
  const documents: Attachment[] = input.documents.map((d: Attachment) => {
    if (
      !d ||
      typeof d.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(d.id) ||
      ids.has(d.id) ||
      typeof d.name !== 'string' ||
      d.name.length > 200 ||
      !fileTypes.includes(d.mimeType) ||
      typeof d.data !== 'string' ||
      (phase === 'document-reading' && !d.data) ||
      d.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(d.data)
    )
      throw new Error('Invalid file.');
    const bytes = Buffer.from(d.data, 'base64');
    total += bytes.length;
    ids.add(d.id);
    if ((d.data && !bytes.length) || bytes.length > fileLimits.each || total > fileLimits.total)
      throw new Error('Files exceed the upload limit.');
    if (
      bytes.length &&
      d.mimeType === 'application/pdf' &&
      !bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))
    )
      throw new Error('Invalid PDF.');
    if (
      bytes.length &&
      d.mimeType === 'image/png' &&
      bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    )
      throw new Error('Invalid PNG.');
    if (
      bytes.length &&
      d.mimeType === 'image/jpeg' &&
      bytes.subarray(0, 3).toString('hex') !== 'ffd8ff'
    )
      throw new Error('Invalid JPEG.');
    if (
      bytes.length &&
      d.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' &&
      (!bytes.subarray(0, 4).equals(Buffer.from('PK\x03\x04')) ||
        !bytes.includes(Buffer.from('[Content_Types].xml')) ||
        !bytes.includes(Buffer.from('ppt/presentation.xml')))
    )
      throw new Error('Invalid PowerPoint file.');
    if (
      bytes.length &&
      d.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
      (!bytes.subarray(0, 4).equals(Buffer.from('PK\x03\x04')) ||
        !bytes.includes(Buffer.from('[Content_Types].xml')) ||
        !bytes.includes(Buffer.from('xl/workbook.xml')))
    )
      throw new Error('Invalid Excel file.');
    return { id: d.id, name: d.name, mimeType: d.mimeType, data: d.data };
  });
  for (const key of ['notes', 'message'])
    if (typeof input[key] !== 'string' || input[key].length > 12000)
      throw new Error('Invalid message.');
  const dispositions: Record<string, string> = {};
  for (const f of modelFields) {
    const status = input.dispositions?.[f.id];
    if (status === 'pending' || (status === 'not-applicable' && !f.required))
      dispositions[f.id] = status;
  }
  const rejected = Array.isArray(input.rejected)
    ? input.rejected
        .filter((id: unknown) => typeof id === 'string' && modelFields.some((f) => f.id === id))
        .slice(0, 100)
    : [];
  const intent = typeof input.intent === 'string' ? input.intent : input.message;
  if (intent.length > 12000) throw new Error('Invalid intent.');
  let context = restoreAnalysisContext(input.context, documents);
  for (const document of documents.filter((doc) => doc.data)) {
    const previous = context?.documents.find((stamp) => stamp.id === document.id);
    if (previous && previous.digest !== await digest(document.data)) context = null;
  }
  return {
    intent,
    context,
    phase,
    documents,
    values: cleanValues(input.values, documents),
    notes: input.notes as string,
    message: input.message as string,
    dispositions,
    rejected,
    conversation: Array.isArray(input.conversation)
      ? input.conversation
          .slice(-12)
          .filter(
            (t: { role?: unknown; text?: unknown }) =>
              t &&
              ['user', 'assistant'].includes(String(t.role)) &&
              typeof t.text === 'string' &&
              t.text.length <= 6000,
          )
          .map((t: { role: string; text: string }) => ({ role: t.role, text: t.text }))
      : [],
    pendingProposals: Array.isArray(input.pendingProposals)
      ? input.pendingProposals
          .slice(0, 100)
          .filter(
            (p: { fieldId?: unknown; values?: unknown }) =>
              p &&
              modelFields.some((f) => f.id === p.fieldId) &&
              Array.isArray(p.values) &&
              p.values.length <= 40 &&
              p.values.every((v: unknown) => typeof v === 'string' && v.length <= 6000),
          )
          .map((p: { fieldId: string; values: string[] }) => ({
            fieldId: p.fieldId,
            values: p.values,
          }))
      : [],
  };
}

type ModelSelection = {
  model: string;
  thinkingLevel: ThinkingLevel;
  reason: string;
};

export function selectModel(
  input: Awaited<ReturnType<typeof readAnalysisRequest>>,
  config: { routingModel: string; extractionModel: string },
): ModelSelection {
  const asksForReinterpretation =
    /\b(conflict|contradict|reconsider|reinterpret|change route|wrong route|different route)\b/i.test(
      input.message,
    );

  if (input.phase === 'document-reading') {
    return {
      model: config.routingModel,
      thinkingLevel: ThinkingLevel.MEDIUM,
      reason: 'Source reading extracts facts and evidence from the attached documents.',
    };
  }

  if (input.phase === 'scope') {
    return {
      model: config.routingModel,
      thinkingLevel: ThinkingLevel.MEDIUM,
      reason: 'Initial scope and decision-tree routing require the strongest classification pass.',
    };
  }

  if (asksForReinterpretation) {
    return {
      model: config.routingModel,
      thinkingLevel: ThinkingLevel.MEDIUM,
      reason: 'The requester asked to revisit or resolve the confirmed route.',
    };
  }

  if (input.phase === 'document-enrichment' && !input.values.mediaPlacementRetailer?.length) {
    return {
      model: config.routingModel,
      thinkingLevel: ThinkingLevel.LOW,
      reason: 'An attached document may need visual and web verification of its retailer.',
    };
  }

  if (input.phase === 'final-review') {
    const unresolvedRequired = activeFields(input.values).filter(
      (field) => field.required && !input.values[field.id],
    ).length;
    if (unresolvedRequired) {
      return {
        model: config.routingModel,
        thinkingLevel: ThinkingLevel.LOW,
        reason:
          'Final review has unresolved required fields and needs a stronger consistency check.',
      };
    }
    return {
      model: config.extractionModel,
      thinkingLevel: ThinkingLevel.LOW,
      reason: 'Final review maps retained evidence to active optional fields and summarizes the brief.',
    };
  }

  return {
    model: config.extractionModel,
    thinkingLevel:
      input.phase === 'document-enrichment' ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL,
    reason:
      input.phase === 'document-enrichment'
        ? 'Document enrichment includes content-based file classification.'
        : 'Routine missing-field guidance is optimized for Flash-Lite.',
  };
}

export function briefAnalysisPlugin(config: {
  project: string;
  location: string;
  routingModel: string;
  extractionModel: string;
}, interactions?: GoogleGenAI['interactions'], journal = createDiagnosticJournal(),
wait = (ms: number, signal: AbortSignal) => delay(ms, undefined, { signal })): Plugin {
  const client = new GoogleGenAI({
    vertexai: true,
    project: config.project,
    location: 'global',
  });
  const interactionClient = interactions ?? client.interactions;
  let busy = false;
  const jobs = createAnalysisJobs();
  const middleware = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    if (request.url?.split('?')[0] !== '/api/brief/analyze') return next();
    const query = new URLSearchParams(request.url?.split('?')[1]);
    const requestId = crypto.randomUUID();
    const receivedAt = new Date().toISOString();
    const reject = async (status: number, code: string, error: string, id: string = requestId) => {
      const diagnostic: AnalysisDiagnostic = { requestId: id, createdAt: receivedAt,
        httpStatus: status, code, origin: 'server', failureStage: 'request' };
      console.info('[brief-analysis] result', JSON.stringify(diagnostic));
      try { await journal(diagnostic); } catch {
        console.error('[brief-analysis] diagnostic journal unavailable', { requestId: id });
      }
      return reply(response, status, { code, error, requestId: id, diagnostic });
    };
    // This endpoint is development-only and uses the local user's ADC; production needs real auth.
    const host = request.headers.host || '';
    if (
      !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
      (request.headers.origin && request.headers.origin !== `http://${host}`) ||
      (request.method === 'POST' && !request.headers['content-type']?.startsWith('application/json')) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    )
      return reject(403, 'ANALYSIS_ACCESS_DENIED', 'Local same-origin requests only.');
    if (request.method === 'GET' && query.has('job')) {
      const id = query.get('job')!;
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(id))
        return reject(400, 'INVALID_JOB_REFERENCE', 'Invalid analysis reference.');
      const result = jobs.get(id);
      if (result.status === 404)
        return reject(404, 'ANALYSIS_JOB_UNAVAILABLE', 'Analysis expired or the server restarted. Please retry.', id);
      return reply(response, result.status, result.data);
    }
    if (request.method !== 'POST') return reject(405, 'ANALYSIS_METHOD_NOT_ALLOWED', 'Method not allowed.');
    if (busy)
      return reject(429, 'ANALYSIS_BUSY', 'An analysis is already running. Try again shortly.');
    busy = true;
    let attemptedTrace: AiRequestTrace | null = null;
    let generationSignal: AbortSignal | undefined;
    let jobId: string | undefined;
    let chained = false;
    let failureStage: NonNullable<AiRequestTrace['failureStage']> = 'preparation';
    const finish = async (status: number, data: { code?: string; trace?: AiRequestTrace; [key: string]: unknown }, failure?: ReturnType<typeof analysisFailure>) => {
      const diagnostic: AnalysisDiagnostic = {
        requestId, createdAt: receivedAt, httpStatus: status,
        code: data.code ?? 'ANALYSIS_COMPLETED',
        origin: failure?.origin ?? data.trace?.origin ?? 'server',
        failureStage: failure?.failureStage ?? data.trace?.failureStage,
        providerStatus: failure?.providerStatus ?? data.trace?.providerStatus,
        trace: data.trace,
      };
      console.info('[brief-analysis] result', JSON.stringify(diagnostic));
      // Journal errors are handled separately so they cannot mask the analysis result.
      try { await journal(diagnostic); } catch {
        console.error('[brief-analysis] diagnostic journal unavailable', { requestId });
      }
      const payload = { ...data, requestId, diagnostic };
      if (jobId) jobs.finish(jobId, status, payload);
      else reply(response, status, payload);
    };
    try {
      let input: Awaited<ReturnType<typeof readAnalysisRequest>>;
      try {
        input = await readAnalysisRequest(request);
      } catch (error) {
        const failure = analysisFailure(error, 'request');
        await finish(failure.httpStatus, { code: failure.code, error: failure.error }, failure);
        return;
      }
      const selection = selectModel(input, config);
      attemptedTrace = {
        id: requestId, createdAt: receivedAt, phase: input.phase,
        model: selection.model, thinkingLevel: String(selection.thinkingLevel).toUpperCase() as AiRequestTrace['thinkingLevel'],
        reason: selection.reason, durationMs: 0,
        inputTokens: null, outputTokens: null, thinkingTokens: null, totalTokens: null,
        configurationVersion: BRIEF_INSTRUCTION_VERSION,
      };
      if (query.get('async') === '1') {
        jobId = jobs.start(requestId);
        jobs.update(jobId, { phase: input.phase, stage: 'preparation' });
        reply(response, 202, jobs.get(jobId).data);
      }
      const preparationStartedAt = Date.now();
      const contentDocuments = input.documents.filter((document) => document.data);
      if (input.phase !== 'document-reading' && (!input.context || input.context.intentDigest !== await digest(input.intent.trim()) || (input.phase !== 'document-enrichment' && input.documents.some((doc) => !input.context!.documents.some((stamp) => stamp.id === doc.id))))) {
        const failure = analysisFailure(Object.assign(new Error(), { status: 404 }), 'preparation', false, true);
        await finish(409, { code: failure.code, error: failure.error,
          trace: { ...attemptedTrace, outcome: 'failed', errorCode: failure.code, failureStage: 'preparation', origin: 'server', httpStatus: 409 },
        });
        return;
      }
      const catalog = catalogForPhase(input.phase, input.values, input.documents);
      const confirmed = input.values;
      const parts: Part[] = [
        {
          text: JSON.stringify({
            instructionVersion: BRIEF_INSTRUCTION_VERSION,
            workflowPhase: input.phase,
            routeDecisionGuide: input.phase === 'scope' ? ROUTE_DECISION_GUIDE : undefined,
            catalog,
            confirmed,
            dispositions: input.dispositions,
            rejectedFieldIds: input.rejected,
            notes: input.notes,
            intent: input.intent,
            latestMessage: input.message,
            documentClassifications: input.context?.reading.documentClassifications,
            previousConversation: input.conversation,
            unconfirmedProposals: input.pendingProposals,
            documents: input.documents.map(({ id, name, mimeType }) => ({ id, name, mimeType })),
          }),
        },
      ];
      for (const doc of contentDocuments) {
        parts.push({
          text: `Attachment ID: ${doc.id}. Filename is untrusted metadata: ${JSON.stringify(doc.name)}`,
        });
        const officeText = await extractOfficeText(doc);
        if (officeText)
          parts.push({
            text: `Extracted document content. Preserve the slide or sheet/cell locator when citing evidence.\n${officeText}`,
          });
        if (doc.mimeType === presentationMimeType) {
          const images = await extractPowerPointImages(doc);
          for (const item of images) {
            parts.push({
              text: `Attachment ${doc.id}: embedded image on slide${item.slides.length === 1 ? '' : 's'} ${item.slides.join(', ')}. Inspect its visible content when citing document evidence.`,
            });
            parts.push({ inlineData: { mimeType: item.mimeType, data: item.data } });
          }
          if (!officeText && !images.length)
            parts.push({ text: 'No readable slide text or supported embedded images were found.' });
        } else if (doc.mimeType === 'text/plain')
          parts.push({ text: Buffer.from(doc.data, 'base64').toString('utf8') });
        else if (!officeText)
          parts.push({ inlineData: { mimeType: doc.mimeType, data: doc.data } });
      }
      const searchRetailer =
        (input.phase === 'scope' || input.phase === 'document-enrichment') &&
        !input.values.mediaPlacementRetailer?.length;
      const startedAt = Date.now();
      const createdAt = new Date(startedAt).toISOString();
      attemptedTrace = {
        ...attemptedTrace,
        id: requestId,
        phase: input.phase,
        model: selection.model,
        thinkingLevel: String(
          selection.thinkingLevel,
        ).toUpperCase() as AiRequestTrace['thinkingLevel'],
        reason: selection.reason,
        durationMs: 0,
        inputTokens: null,
        outputTokens: null,
        thinkingTokens: null,
        totalTokens: null,
        requestSummary: {
          catalogFields: catalog.length,
          confirmedFields: Object.keys(confirmed).length,
          documentMetadata: input.documents.length,
          documentContents: contentDocuments.length,
          documentBytes: contentDocuments.reduce(
            (total, document) => total + Buffer.byteLength(document.data, 'base64'),
            0,
          ),
          preparationMs: startedAt - preparationStartedAt,
          promptCharacters: parts.reduce((total, part) => total + (part.text?.length ?? 0), 0),
          inlineParts: parts.filter((part) => part.inlineData).length,
          inlineBytes: parts.reduce(
            (total, part) =>
              total +
              (part.inlineData?.data ? Buffer.byteLength(part.inlineData.data, 'base64') : 0),
            0,
          ),
        },
        createdAt,
      };
      console.info(
        `[brief-analysis] starting ${attemptedTrace.phase} -> ${attemptedTrace.model} (${attemptedTrace.thinkingLevel})`,
      );
      // Uploaded documents can require a longer multimodal pass. Async callers
      // poll short requests instead of holding an HTTP connection for this budget.
      chained = input.phase !== 'document-reading' && Boolean(input.context);
      // A chained interaction still reads the retained documents. No inline bytes
      // does not mean no document work. Recovery shares this one bounded deadline.
      const timeoutMs = contentDocuments.length || input.context?.documents.length ||
        selection.thinkingLevel === ThinkingLevel.MEDIUM ? 5 * 60_000 : 90_000;
      generationSignal = AbortSignal.timeout(timeoutMs);
      attemptedTrace = { ...attemptedTrace, timeoutMs, attempts: [] };
      const params = {
        model: selection.model,
        input: interactionInput(parts),
        stream: false as const,
        store: true as const,
        ...(chained ? { previous_interaction_id: input.context!.latestInteractionId } : {}),
        system_instruction: systemInstructionForPhase(input.phase, catalog.map((field) => field.id)),
        response_format: { type: 'text' as const, mime_type: 'application/json' as const, schema: analysisSchemaForPhase(input.phase, catalog) },
        tools: searchRetailer ? [{ type: 'google_search' as const }] : [],
      };
      let completed: Awaited<ReturnType<typeof finishInteraction>> | undefined;
      let recoveryFailure: NonNullable<AiRequestTrace['attempts']>[number] | undefined;
      let rateLimitRetries = 0;
      for (let attempt = 0; ; attempt++) {
        generationSignal.throwIfAborted();
        const thinkingLevel = recoveryFailure && selection.thinkingLevel !== ThinkingLevel.MINIMAL
          ? ThinkingLevel.LOW : selection.thinkingLevel;
        const attemptStartedAt = Date.now();
        failureStage = 'provider';
        if (jobId) jobs.update(jobId, { phase: input.phase, stage: attempt ? 'retrying' : 'provider' });
        attemptedTrace.interactionStatus = undefined;
        const attemptTrace: NonNullable<AiRequestTrace['attempts']>[number] = {
          thinkingLevel: String(thinkingLevel).toUpperCase() as AiRequestTrace['thinkingLevel'],
          durationMs: 0, inputTokens: null, outputTokens: null, thinkingTokens: null, totalTokens: null,
        };
        attemptedTrace.attempts!.push(attemptTrace);
        let result;
        try {
          result = await interactionClient.create({
          ...params,
          ...(recoveryFailure ? {
            system_instruction: `${params.system_instruction}\n\nThe previous attempt was rejected (${recoveryFailure.validationIssue ?? recoveryFailure.errorCode}). Return a complete, concise JSON object matching the schema and evidence rules. Omit unsupported proposals instead of inventing values.`,
          } : {}),
          // max_output_tokens includes thinking, not just JSON. The old 12,000
          // cap starved the answer. Use the model default and control reasoning
          // with thinking_level, as recommended by Google.
          generation_config: { thinking_level: String(thinkingLevel).toLowerCase() },
        }, {
          fetchOptions: { signal: generationSignal },
          timeout: Math.max(1, timeoutMs - (Date.now() - startedAt)),
          maxRetries: 0,
        });
        } catch (error) {
          const failure = analysisFailure(error, 'provider', generationSignal.aborted, chained);
          attemptTrace.durationMs = Date.now() - attemptStartedAt;
          attemptTrace.errorCode = failure.code;
          attemptTrace.providerStatus = failure.providerStatus;
          // A failed HTTP call has unknown usage; do not report only the earlier attempt.
          attemptedTrace.inputTokens = attemptedTrace.outputTokens = attemptedTrace.thinkingTokens = attemptedTrace.totalTokens = null;
          // Retry explicit rate limits only. Keep the same valid checkpoint and
          // generation settings; HTTP rejection does not consume JSON recovery.
          if (failure.code === 'PROVIDER_RATE_LIMIT' && rateLimitRetries < 2 && !generationSignal.aborted) {
            const waitMs = 2_000 * 2 ** rateLimitRetries + Math.floor(Math.random() * 1_000);
            rateLimitRetries++;
            if (jobId) jobs.update(jobId, { phase: input.phase, stage: 'retrying' });
            console.info('[brief-analysis] retrying rate limit', { id: requestId, retry: rateLimitRetries, waitMs });
            await wait(waitMs, generationSignal);
            continue;
          }
          throw error;
        }
        Object.assign(attemptTrace, interactionDiagnostics(result), {
          inputTokens: result.usage?.total_input_tokens ?? null,
          outputTokens: result.usage?.total_output_tokens ?? null,
          thinkingTokens: result.usage?.total_thought_tokens ?? null,
          totalTokens: result.usage?.total_tokens ?? null,
        });
        attemptTrace.initialInteractionStatus = result.status;
        attemptTrace.statusChecks = 0;
        attemptedTrace.interactionStatus = result.status;
        try {
          result = await settleInteraction(result, (id) => {
            attemptTrace.statusChecks!++;
            return interactionClient.get(id, undefined, {
              fetchOptions: { signal: generationSignal },
              timeout: Math.max(1, timeoutMs - (Date.now() - startedAt)),
              maxRetries: 0,
            });
          }, generationSignal, (current) => {
            Object.assign(attemptTrace, interactionDiagnostics(current), {
              inputTokens: current.usage?.total_input_tokens ?? null,
              outputTokens: current.usage?.total_output_tokens ?? null,
              thinkingTokens: current.usage?.total_thought_tokens ?? null,
              totalTokens: current.usage?.total_tokens ?? null,
            });
            attemptedTrace!.interactionStatus = current.status;
          });
        } catch (error) {
          const failure = analysisFailure(error,
            error instanceof InteractionOutputError ? 'response' : 'provider', generationSignal.aborted, chained);
          failureStage = failure.failureStage;
          attemptTrace.durationMs = Date.now() - attemptStartedAt;
          attemptTrace.errorCode = failure.code;
          attemptTrace.providerStatus = failure.providerStatus;
          attemptedTrace.inputTokens = attemptedTrace.outputTokens = attemptedTrace.thinkingTokens = attemptedTrace.totalTokens = null;
          throw error;
        }
        const usage = result.usage;
        Object.assign(attemptTrace, {
          durationMs: Date.now() - attemptStartedAt,
          ...interactionDiagnostics(result),
          inputTokens: usage?.total_input_tokens ?? null,
          outputTokens: usage?.total_output_tokens ?? null,
          thinkingTokens: usage?.total_thought_tokens ?? null,
          totalTokens: usage?.total_tokens ?? null,
        });
        attemptedTrace.interactionStatus = result.status;
        // Account for both attempts, rather than hiding failed generation usage.
        for (const key of ['inputTokens', 'outputTokens', 'thinkingTokens', 'totalTokens'] as const) {
          const counts = attemptedTrace.attempts!.map((item) => item[key]);
          attemptedTrace[key] = counts.every((count) => count !== null)
            ? counts.reduce<number>((sum, count) => sum + count!, 0) : null;
        }
        try {
          failureStage = 'response';
          if (jobId) jobs.update(jobId, { phase: input.phase, stage: 'validation' });
          // Separate provider completion/JSON failures from local evidence validation.
          interactionResponse(result);
          failureStage = 'validation';
          completed = await finishInteraction(result, input);
          break;
        } catch (error) {
          const code = error instanceof InteractionOutputError ? error.code : 'INVALID_ANALYSIS';
          attemptTrace.errorCode = code;
          // Existing validators emit fixed messages; never echo arbitrary provider data.
          if (failureStage === 'validation' && error instanceof Error &&
            /^(Invalid|Incomplete|Missing|Email proposals|Source reading)/.test(error.message))
            attemptTrace.validationIssue = error.message.slice(0, 160);
          if (recoveryFailure || code === 'INTERACTION_FAILED')
            throw new InteractionOutputError(code, 'The model response could not be validated.');
          recoveryFailure = attemptTrace;
          console.info('[brief-analysis] recovering output', {
            id: requestId, phase: input.phase, ...attemptTrace,
          });
          // Retry from the last VALID checkpoint, never from the failed interaction.
        }
      }
      if (!completed) throw new InteractionOutputError('INVALID_ANALYSIS', 'No valid analysis.');
      const trace: AiRequestTrace = {
        ...attemptedTrace,
        durationMs: Date.now() - startedAt,
        outcome: 'completed',
        httpStatus: 200,
      };
      console.info(
        `[brief-analysis] ${trace.phase} -> ${trace.model} (${trace.thinkingLevel}) ${trace.durationMs}ms`,
      );
      await finish(200, {
        ...completed,
        trace,
        instructionVersion: BRIEF_INSTRUCTION_VERSION,
      });
    } catch (error) {
      const failure = analysisFailure(error, failureStage, generationSignal?.aborted, chained);
      const { code, providerStatus } = failure;
      const trace: AiRequestTrace | null = attemptedTrace
        ? { ...attemptedTrace, durationMs: Date.now() - Date.parse(attemptedTrace.createdAt),
            outcome: 'failed', errorCode: code, failureStage, providerStatus,
            origin: failure.origin, httpStatus: failure.httpStatus }
        : null;
      console.error('[brief-analysis] request failed', { id: jobId ?? trace?.id, code, failureStage, providerStatus, trace });
      await finish(failure.httpStatus, {
        code,
        error: failure.error,
        ...(trace ? { trace } : {}),
      }, failure);
    } finally {
      busy = false;
    }
  };
  return {
    name: 'local-brief-analysis',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
