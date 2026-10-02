import { Activity, ChevronDown } from 'lucide-react';
import type { AiRequestTrace } from '../shared/brief-contract';

const phaseLabel: Record<AiRequestTrace['phase'], string> = {
  'general-information': 'General information',
  'route-selection': 'Content brief type',
  'route-details': 'Route details',
  'document-reading': 'Source reading',
  scope: 'Scope interpretation',
  'document-enrichment': 'Document enrichment',
  'follow-up': 'Missing-field guidance',
  'final-review': 'Final review',
};

function tokenLabel(value: number | null) {
  return value === null ? 'Unavailable' : value.toLocaleString();
}

export function AdvancedAiLog({ traces }: { traces: AiRequestTrace[] }) {
  return (
    <details className="group rounded-2xl border border-black/10 bg-white/65">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs font-semibold text-black/55 marker:hidden">
        <span className="flex items-center gap-2">
          <Activity className="size-3.5" /> Advanced · AI request log
          {traces.length ? (
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] tabular-nums">
              {traces.length}
            </span>
          ) : null}
        </span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-black/8 px-4 py-4">
        {traces.length ? (
          <ol className="space-y-3">
            {[...traces].reverse().map((trace) => (
              <li key={trace.id} className="rounded-xl bg-black/[0.025] p-3 text-xs leading-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="font-semibold text-black/75">{phaseLabel[trace.phase]}</strong>
                  <span className="font-mono text-[10px] text-black/40">
                    {new Date(trace.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                  <div>
                    <dt className="inline text-black/40">Model: </dt>
                    <dd className="inline font-mono text-black/65">{trace.model}</dd>
                  </div>
                  <div>
                    <dt className="inline text-black/40">Thinking level: </dt>
                    <dd className="inline text-black/65">{trace.thinkingLevel}</dd>
                  </div>
                  <div>
                    <dt className="inline text-black/40">Duration: </dt>
                    <dd className="inline text-black/65">{trace.durationMs.toLocaleString()} ms</dd>
                  </div>
                  <div title="Time from sending the request until its response is received and validated, including polling and retries.">
                    <dt className="inline text-black/40">Total elapsed: </dt>
                    <dd className="inline tabular-nums text-black/65">
                      {trace.totalDurationMs !== undefined
                        ? `${(trace.totalDurationMs / 1000).toFixed(1)} s (${trace.totalDurationMs.toLocaleString()} ms)`
                        : 'Unavailable'}
                    </dd>
                  </div>
                </dl>
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {([
                    ['Input tokens', trace.inputTokens],
                    ['Thinking tokens', trace.thinkingTokens],
                    ['Output tokens', trace.outputTokens],
                    ['Total tokens', trace.totalTokens],
                  ] as const).map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-black/[0.035] px-3 py-2">
                      <dt className="text-[10px] text-black/45">{label}</dt>
                      <dd className="mt-1 font-mono tabular-nums text-black/75">
                        {tokenLabel(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {trace.requestSummary ? (
                  <p className="mt-2 text-black/55">
                    Sent {trace.requestSummary.catalogFields} catalog fields,{' '}
                    {trace.requestSummary.confirmedFields} confirmed values,{' '}
                    {trace.requestSummary.documentMetadata} document references, and{' '}
                    {trace.requestSummary.documentContents} document contents
                    {trace.requestSummary.documentContents
                      ? ` (${(trace.requestSummary.documentBytes / 1024 / 1024).toFixed(2)} MB)`
                      : ''}
                    .
                  </p>
                ) : null}
                {trace.outcome ? (
                  <p className="mt-1 text-black/55">
                    Result: {trace.outcome}
                    {trace.errorCode ? ` · ${trace.errorCode}` : ''}
                    {trace.failureStage ? ` · ${trace.failureStage}` : ''}
                    {trace.origin ? ` · Origin: ${trace.origin}` : ''}
                    {trace.httpStatus ? ` · App HTTP ${trace.httpStatus}` : ''}
                    {trace.providerStatus ? ` · Provider HTTP ${trace.providerStatus}` : ''}
                    {trace.interactionStatus ? ` · Interaction ${trace.interactionStatus}` : ''}
                    {trace.attempts && trace.attempts.length > 1
                      ? ` · ${trace.attempts.length} attempts (automatic recovery)` : ''}
                  </p>
                ) : null}
                {trace.attempts?.map((attempt, index) => (
                  <p key={index} className="mt-1 text-black/45">
                    Attempt {index + 1}: {attempt.errorCode ?? attempt.interactionStatus ?? 'Unknown'}
                    {attempt.providerStatus ? ` · Provider HTTP ${attempt.providerStatus}` : ''}
                    {attempt.interactionId ? ` · Interaction ${attempt.interactionId}` : ''}
                    {attempt.statusChecks ? ` · ${attempt.statusChecks} status checks (${attempt.initialInteractionStatus} → ${attempt.interactionStatus})` : ''}
                    {attempt.stepTypes?.length ? ` · Steps: ${attempt.stepTypes.join(', ')}` : ''}
                    {attempt.responseCharacters !== undefined ? ` · ${attempt.responseCharacters} response characters` : ''}
                    {attempt.validationIssue ? ` · ${attempt.validationIssue}` : ''}
                    {' · '}{attempt.thinkingLevel}
                    {' · '}{tokenLabel(attempt.inputTokens)} input tokens
                    {' · '}{tokenLabel(attempt.thinkingTokens)} thinking tokens
                    {' · '}{tokenLabel(attempt.outputTokens)} output tokens
                    {' · '}{tokenLabel(attempt.totalTokens)} total tokens
                  </p>
                ))}
                <p className="mt-1 font-mono text-[10px] text-black/40">Request: {trace.id}</p>
                <a className="mt-1 inline-block text-[10px] underline" download={`analysis-${trace.id}.json`}
                  href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(trace, null, 2))}`}>
                  Download diagnostics
                </a>
                <p className="mt-2 text-black/45">{trace.reason}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-xs leading-5 text-black/45">
            Model selection and usage will appear here after the first AI request.
          </p>
        )}
      </div>
    </details>
  );
}
