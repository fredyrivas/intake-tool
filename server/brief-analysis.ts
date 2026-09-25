import { GoogleGenAI, ThinkingLevel, type Part } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import {
  activeFields,
  analysisForActivePath,
  modelFields,
  privateFieldIds,
  cleanValues,
  fileLimits,
  fileTypes,
  type AiRequestTrace,
  type AnalysisPhase,
  type Attachment,
} from '../shared/brief-contract.ts';
import {
  analysisSchemaForPhase,
  BRIEF_SYSTEM_INSTRUCTION,
  BRIEF_INSTRUCTION_VERSION,
} from './brief-instruction.ts';
import { extractOfficeText } from './office-text.ts';
import { applyDocumentClassifications } from './document-classification.ts';

function reply(response: ServerResponse, status: number, data: unknown) {
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
      (phase === 'scope' && !d.data) ||
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
  return {
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
      reason: 'Final review is structurally complete and only needs a concise summary pass.',
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
}): Plugin {
  const client = new GoogleGenAI({
    vertexai: true,
    project: config.project,
    location: config.location,
  });
  let busy = false;
  const middleware = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    if (request.url?.split('?')[0] !== '/api/brief/analyze') return next();
    if (request.method !== 'POST') return reply(response, 405, { error: 'Method not allowed.' });
    // This endpoint is development-only and uses the local user's ADC; production needs real auth.
    const host = request.headers.host || '';
    if (
      !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
      (request.headers.origin && request.headers.origin !== `http://${host}`) ||
      !request.headers['content-type']?.startsWith('application/json')
    )
      return reply(response, 403, { error: 'Local same-origin requests only.' });
    if (busy)
      return reply(response, 429, { error: 'An analysis is already running. Try again shortly.' });
    busy = true;
    let attemptedTrace: AiRequestTrace | null = null;
    let generationSignal: AbortSignal | undefined;
    try {
      let input: Awaited<ReturnType<typeof readAnalysisRequest>>;
      try {
        input = await readAnalysisRequest(request);
      } catch {
        return reply(response, 400, {
          error:
            'Check the files and message. Use up to 6 PDF, PPTX, XLSX, TXT, PNG or JPEG files, 8 MB each and 15 MB total.',
        });
      }
      const contentDocuments = input.documents.filter((document) => document.data);
      const catalog =
        input.phase === 'scope'
          ? modelFields
          : activeFields(input.values).filter(
              (field) =>
                !privateFieldIds.has(field.id) &&
                (input.phase === 'document-enrichment' ||
                  field.required ||
                  field.id === 'requestTypes' ||
                  (input.phase === 'final-review' &&
                    Boolean(input.values[field.id]?.length || input.dispositions[field.id]))),
            );
      const confirmed = Object.fromEntries(
        Object.entries(input.values).filter(([fieldId]) => !privateFieldIds.has(fieldId)),
      );
      const parts: Part[] = [
        {
          text: JSON.stringify({
            instructionVersion: BRIEF_INSTRUCTION_VERSION,
            workflowPhase: input.phase,
            routeDecisionGuide:
              input.phase === 'scope'
                ? {
                    policy:
                      'Choose every route explicitly supported by the request. Do not add routes only because a document mentions several channels; ask when the intended route remains ambiguous.',
                    routes: {
                      CREATE: 'Net-new production or a new creative idea that is not NPD.',
                      EVOLVE: 'Adaptation or refresh of an existing ATL or annual campaign.',
                      ACCELERATE:
                        'E-commerce, digital retailer page or Shopper BTL creation/adaptation.',
                      INNOVATE: 'Net-new assets for a new-product launch (NPD) at scale.',
                      '.com Copy Optimization':
                        'Copy optimization, FAQ creation or review of online articles.',
                      'QR Generation Request': 'A request specifically to generate a QR code.',
                      'Delivery only':
                        'No creation or adaptation; existing assets only need to be delivered.',
                    },
                  }
                : undefined,
            catalog,
            confirmed,
            dispositions: input.dispositions,
            rejectedFieldIds: input.rejected,
            notes: input.notes,
            latestMessage: input.message,
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
        else if (doc.mimeType === 'text/plain')
          parts.push({ text: Buffer.from(doc.data, 'base64').toString('utf8') });
        else parts.push({ inlineData: { mimeType: doc.mimeType, data: doc.data } });
      }
      const selection = selectModel(input, config);
      const requestId = crypto.randomUUID();
      const startedAt = Date.now();
      const createdAt = new Date(startedAt).toISOString();
      attemptedTrace = {
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
        },
        createdAt,
      };
      console.info(
        `[brief-analysis] starting ${attemptedTrace.phase} -> ${attemptedTrace.model} (${attemptedTrace.thinkingLevel})`,
      );
      generationSignal = AbortSignal.timeout(90000);
      const result = await client.models.generateContent({
        model: selection.model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: BRIEF_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseJsonSchema: analysisSchemaForPhase(input.phase),
          thinkingConfig: { thinkingLevel: selection.thinkingLevel },
          maxOutputTokens: 12000,
          abortSignal: generationSignal,
        },
      });
      const usage = result.usageMetadata;
      attemptedTrace = {
        ...attemptedTrace,
        durationMs: Date.now() - startedAt,
        inputTokens: usage?.promptTokenCount ?? null,
        outputTokens: usage?.candidatesTokenCount ?? null,
        thinkingTokens: usage?.thoughtsTokenCount ?? null,
        totalTokens: usage?.totalTokenCount ?? null,
      };
      let modelAnalysis: unknown;
      try {
        modelAnalysis = JSON.parse(result.text || '');
      } catch (error) {
        const finishReason = result.candidates?.[0]?.finishReason;
        console.warn('[brief-analysis] invalid model JSON', {
          finishReason,
          outputTokens: result.usageMetadata?.candidatesTokenCount,
          thinkingTokens: result.usageMetadata?.thoughtsTokenCount,
          responseChars: result.text?.length ?? 0,
        });
        throw error;
      }
      const parsed = analysisForActivePath(
        applyDocumentClassifications(modelAnalysis, input.documents, contentDocuments),
        input.values,
      );
      if (input.phase === 'follow-up') {
        parsed.questions = parsed.questions.filter(
          (question) => modelFields.find((field) => field.id === question.fieldId)?.required,
        );
      }
      const trace: AiRequestTrace = {
        ...attemptedTrace,
        durationMs: Date.now() - startedAt,
      };
      console.info(
        `[brief-analysis] ${trace.phase} -> ${trace.model} (${trace.thinkingLevel}) ${trace.durationMs}ms`,
      );
      reply(response, 200, {
        analysis: parsed,
        trace,
        instructionVersion: BRIEF_INSTRUCTION_VERSION,
      });
    } catch (error) {
      console.error('[brief-analysis] request failed', error);
      const trace = attemptedTrace
        ? { ...attemptedTrace, durationMs: Date.now() - Date.parse(attemptedTrace.createdAt) }
        : null;
      reply(response, generationSignal?.aborted ? 504 : 502, {
        error: generationSignal?.aborted
          ? 'The Monks AI assistant took too long to respond. Your text and files are still here. Please retry.'
          : 'The Monks AI assistant could not finish reading this request. Your text and files are still here. Please retry.',
        ...(trace ? { trace } : {}),
      });
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
