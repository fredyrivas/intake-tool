import { Activity, ChevronDown } from 'lucide-react';
import type { AiRequestTrace } from '../shared/brief-contract';

const phaseLabel: Record<AiRequestTrace['phase'], string> = {
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
                    <dt className="inline text-black/40">Thinking: </dt>
                    <dd className="inline text-black/65">{trace.thinkingLevel}</dd>
                  </div>
                  <div>
                    <dt className="inline text-black/40">Duration: </dt>
                    <dd className="inline text-black/65">{trace.durationMs.toLocaleString()} ms</dd>
                  </div>
                  <div>
                    <dt className="inline text-black/40">Tokens: </dt>
                    <dd className="inline text-black/65">{tokenLabel(trace.totalTokens)}</dd>
                  </div>
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
                <p className="mt-1 text-black/45">
                  Input {tokenLabel(trace.inputTokens)} · Output {tokenLabel(trace.outputTokens)} ·
                  Thinking {tokenLabel(trace.thinkingTokens)} tokens
                </p>
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
