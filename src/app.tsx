import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Check,
  Download,
  FileText,
  FolderOpen,
  LoaderCircle,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react';
import { Button, Card, CardContent, Input, Label, Textarea } from '@monksflow/monks-ui';
import { AdvancedAiLog } from './advanced-ai-log';
import { BriefForm, FieldInput, type Disposition } from './brief-form';
import { clarificationItemResolved, clarificationItemsFor } from './brief-sections';
import { ClarificationTurn } from './clarification-turn';
import { BriefDocuments } from './brief-documents';
import { BriefLibrary, type BriefSummary } from './brief-library';
import { DocumentTemplateLink, OptionalDocumentGuidance } from './document-template-link';
import { clearDraftDocuments, readDraftDocuments, writeDraftDocuments } from './draft-documents';
import { BrandChoices } from './brand-choices';
import { downloadBriefSummaryPdf, type BriefPdfInput } from './brief-pdf';
import googleDriveFavicon from './assets/google-drive.png';
import jiraFavicon from './assets/jira.png';
import {
  activeFields,
  alternativeFieldGroups,
  brandExceptionNotes,
  cleanValues,
  fieldIsRequired,
  fields,
  generatedProjectName,
  parseAnalysis,
  presentationMimeType,
  validValue,
  type AiRequestTrace,
  type Analysis,
  type AnalysisPhase,
  type Attachment,
  type Field,
  type Proposal,
  type Source,
  type Values,
} from '../shared/brief-contract';

const examples = [
  'I need to adapt and refresh six Ziploc Holiday FY27 ATL assets for the US across Linear TV, CTV and YouTube. I’ve attached the creative direction and specifications. Please deliver by September 17, share with the Nova team and SCJ, deliver through Extreme Reach for the October 5 to December 31 flight, and upload the final files to BOS. Open files aren’t needed.',
  'I need to localize and resize eight OFF! Summer FY27 digital assets for Canada across YouTube, Meta and programmatic display in English and French. I’ve attached the approved US masters, media plan and specifications. Please deliver by February 12, share with the Nova team and SCJ, traffic the final assets for the March 1 to August 31 flight, and upload everything to BOS. Open files aren’t needed.',
  'I need to adapt four Glade Holiday FY27 video assets for the US across Linear TV, CTV and online video, including updated end cards and legal copy. I’ve attached the approved creative, copy deck and delivery specifications. Please deliver by August 28, share with the Nova team and SCJ, send the broadcast masters through Extreme Reach for the October 1 to December 31 flight, and upload the final files to BOS. Open files aren’t needed.',
];

type Stage = 'intent' | 'review' | 'clarify' | 'brief' | 'final' | 'briefs';
const stagePaths: Record<Stage, string> = {
  intent: '/intent',
  review: '/scope',
  clarify: '/clarify',
  brief: '/brief',
  final: '/review',
  briefs: '/briefs',
};

function stageFromPath(pathname: string): Stage | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/brief') return 'clarify';
  return (
    (Object.entries(stagePaths) as [Stage, string][]).find(([, value]) => value === path)?.[0] ||
    (path === '/' ? 'intent' : null)
  );
}

type SavedBriefDraft = {
  version: 3;
  stage: Stage;
  intent: string;
  analysis: Analysis | null;
  proposals: Proposal[];
  values: Values;
  sources: Record<string, Source>;
  suggestions: Proposal[];
  dispositions: Record<string, Disposition>;
  clarificationHistory: string[];
  analyzedDocumentIds: string[];
  traces: AiRequestTrace[];
};

type StoredBrief = BriefSummary & {
  draft: SavedBriefDraft;
  documents: Attachment[];
  published?: boolean;
};

type JiraTaskPreview = {
  briefId: string;
  summary: string;
  dueDate: string | null;
  labels: string[];
  rows: { label: string; value: string; url?: string }[];
  warnings: string[];
  existing: {
    key: string;
    url: string;
    briefChanged: boolean;
  } | null;
  creating: boolean;
};

const draftStorageKey = 'monks.workspace-brief.draft.v3';
const documentStorageKey = 'monks.workspace-brief.documents.v3';
const legacyDraftStorageKey = 'monks.workspace-brief.draft.v2';
const legacyDocumentStorageKey = 'monks.workspace-brief.documents.v2';
const fieldById = new Map(fields.map((field) => [field.id, field]));
const alternativeFieldsByPrimary = new Map<string, readonly [string, string]>(
  alternativeFieldGroups.map((group) => [group[0], group] as const),
);
const alternativeSecondaryIds = new Set<string>(alternativeFieldGroups.map((group) => group[1]));
function driveInputFingerprint(values: Values, documents: Attachment[]) {
  return JSON.stringify({
    projectName: values.projectName?.[0] || 'Untitled brief',
    values,
    documents: documents.map((document) => [
      document.id,
      document.data.length,
      document.data.slice(-16),
    ]),
  });
}

function readSavedDocuments(): Attachment[] {
  try {
    const value = JSON.parse(
      localStorage.getItem(documentStorageKey) ||
        localStorage.getItem(legacyDocumentStorageKey) ||
        '[]',
    );
    if (!Array.isArray(value)) return [];
    const seenContent = new Set<string>();
    return value
      .filter(
        (document): document is Attachment =>
          document &&
          typeof document === 'object' &&
          typeof document.id === 'string' &&
          typeof document.name === 'string' &&
          typeof document.mimeType === 'string' &&
          typeof document.data === 'string',
      )
      .filter((document) => {
        if (seenContent.has(document.data)) return false;
        seenContent.add(document.data);
        return true;
      })
      .slice(0, 6);
  } catch {
    return [];
  }
}

function clearBrowserDraft() {
  localStorage.removeItem(draftStorageKey);
  localStorage.removeItem(documentStorageKey);
  localStorage.removeItem(legacyDraftStorageKey);
  localStorage.removeItem(legacyDocumentStorageKey);
  void clearDraftDocuments().catch(() => {});
}

function emptyDraft(documents: Attachment[]): SavedBriefDraft & { documents: Attachment[] } {
  return {
    version: 3,
    stage: 'intent',
    intent: '',
    documents,
    analysis: null,
    proposals: [],
    values: {},
    sources: {},
    suggestions: [],
    dispositions: {},
    clarificationHistory: [],
    analyzedDocumentIds: [],
    traces: [],
  };
}

function restoreLegacyClarificationValues(
  draft: SavedBriefDraft & {
    clarificationAnswers?: Values;
    clarificationNotes?: Record<string, string>;
  },
  documents: Attachment[],
): Values {
  const restored = cleanValues(draft.values, documents);
  const unmapped: string[] = [];
  for (const field of fields) {
    if (restored[field.id]) continue;
    const selected = draft.clarificationAnswers?.[field.id];
    const written = draft.clarificationNotes?.[field.id]?.trim();
    if (validValue(field, selected, documents)) restored[field.id] = selected;
    else if (written && validValue(field, [written], documents)) restored[field.id] = [written];
    else if (written) unmapped.push(`${field.label}: ${written}`);
  }
  if (unmapped.length) {
    restored.notes = [
      [restored.notes?.[0], `Earlier clarification answers:\n${unmapped.join('\n')}`]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 6000),
    ];
  }
  return cleanValues(restored, documents);
}

function readSavedDraft(documents: Attachment[]): SavedBriefDraft & { documents: Attachment[] } {
  const empty = emptyDraft(documents);
  try {
    const value = JSON.parse(
      localStorage.getItem(draftStorageKey) ||
        localStorage.getItem(legacyDraftStorageKey) ||
        'null',
    );
    if (!value || typeof value !== 'object' || ![2, 3].includes(value.version)) return empty;
    let analysis: Analysis | null = null;
    try {
      analysis = value.analysis ? parseAnalysis(value.analysis, documents) : null;
    } catch {
      // A draft can survive localStorage quota while its attachments do not.
    }
    const parseSavedProposals = (candidate: unknown, summary: string) => {
      if (!Array.isArray(candidate)) return [];
      try {
        return parseAnalysis(
          { summary, proposals: candidate, questions: [], warnings: [] },
          documents,
        ).proposals;
      } catch {
        return [];
      }
    };
    const values = restoreLegacyClarificationValues(value, documents);
    const stage: Stage = ['intent', 'review', 'clarify', 'brief', 'final'].includes(value.stage)
      ? value.stage
      : 'intent';
    return {
      ...empty,
      stage: stage === 'intent' || analysis ? (stage === 'brief' ? 'clarify' : stage) : 'intent',
      intent: typeof value.intent === 'string' ? value.intent.slice(0, 6000) : '',
      analysis,
      proposals: parseSavedProposals(value.proposals, 'Saved scope'),
      values,
      sources: value.sources && typeof value.sources === 'object' ? value.sources : {},
      suggestions: parseSavedProposals(value.suggestions, 'Saved suggestions'),
      dispositions:
        value.dispositions && typeof value.dispositions === 'object' ? value.dispositions : {},
      clarificationHistory: Array.isArray(value.clarificationHistory)
        ? value.clarificationHistory.filter(
            (id: unknown): id is string => typeof id === 'string' && fieldById.has(id),
          )
        : [],
      analyzedDocumentIds: Array.isArray(value.analyzedDocumentIds)
        ? value.analyzedDocumentIds.filter((id: unknown): id is string => typeof id === 'string')
        : [],
      traces: Array.isArray(value.traces) ? value.traces.slice(-20) : [],
    };
  } catch {
    return empty;
  }
}

function stageIsAvailable(
  stage: Stage,
  draft: Pick<SavedBriefDraft, 'analysis' | 'values'> & { documents: Attachment[] },
) {
  if (stage === 'intent' || stage === 'briefs') return true;
  if (stage === 'review') return Boolean(draft.analysis);
  return (
    Boolean(draft.analysis) &&
    validValue(fieldById.get('requestTypes')!, draft.values.requestTypes, draft.documents)
  );
}

function displayValue(field: Field, values: string[], documents: Attachment[]) {
  if (!values.length) return 'Missing';
  if (field.type === 'document')
    return values
      .map((id) => documents.find((document) => document.id === id)?.name || id)
      .join(', ');
  return values.map((value) => (value === '__none__' ? 'None needed' : value)).join(', ');
}

function BriefHtmlSummary({
  brief,
  fields: summaryFields,
  editingFieldId,
  onEdit,
  onNotApplicable,
  renderEditor,
}: {
  brief: BriefPdfInput;
  fields: Field[];
  editingFieldId: string | null;
  onEdit: (field: Field) => void;
  onNotApplicable: (field: Field) => void;
  renderEditor: (field: Field) => ReactNode;
}) {
  return (
    <section
      aria-label="Brief summary"
      className="rounded-[22px] border border-black/10 bg-white p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 pb-5">
        <div>
          <p className="text-[10px] font-bold tracking-[0.12em] text-[#6f35b6]">BRIEF SUMMARY</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] sm:text-2xl">
            {brief.projectName}
          </h2>
          <p className="mt-1 text-xs text-black/45">Generated from brand and project title.</p>
          <p className="mt-2 text-xs font-medium text-emerald-700">Required · Complete</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${brief.status === 'Complete' ? 'bg-[#e8f7ed] text-[#147a3f]' : 'bg-amber-50 text-amber-800'}`}
        >
          {brief.status}
        </span>
      </div>
      <div className="py-5">
        <p className="text-[10px] font-bold tracking-[0.12em] text-[#6f35b6]">OVERVIEW</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-black/65">{brief.summary}</p>
      </div>
      <div className="border-t border-black/10 pt-5">
        <p className="text-[10px] font-bold tracking-[0.12em] text-[#6f35b6]">BRIEF DETAILS</p>
        <dl className="mt-3 divide-y divide-black/10">
          {brief.rows.map((row, index) => {
            const field = summaryFields[index];
            if (!field || field.id === 'projectName') return null;
            return (
              <div
                key={field.id}
                className={`grid gap-1 rounded-xl px-3 py-3 sm:grid-cols-[minmax(180px,0.32fr)_1fr] sm:gap-6 ${row.status === 'Pending' ? 'bg-amber-50 ring-1 ring-amber-200' : ''}`}
              >
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-black/45">
                  {row.label}
                  <span className="mt-1 flex flex-wrap gap-1.5 normal-case tracking-normal">
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-black/60">
                      {row.requirement}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${row.status === 'Complete' ? 'bg-emerald-100 text-emerald-800' : row.status === 'Not applicable' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-800'}`}
                    >
                      {row.status}
                    </span>
                  </span>
                </dt>
                <dd className="min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-6 ${row.unresolved ? 'text-amber-800' : 'text-black/70'}`}
                    >
                      {row.value}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEdit(field)}
                      aria-label={`Edit ${row.label}`}
                      aria-expanded={editingFieldId === field.id}
                      aria-controls={
                        editingFieldId === field.id ? `review-editor-${field.id}` : undefined
                      }
                      className="shrink-0 rounded-full p-1.5 text-black/45 hover:bg-[#f4edfc] hover:text-[#6f35b6]"
                    >
                      <Pencil className="size-4" />
                    </button>
                  </div>
                  {row.requirement === 'Optional' && row.status === 'Pending' ? (
                    <button
                      type="button"
                      onClick={() => onNotApplicable(field)}
                      className="mt-2 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                    >
                      Mark not applicable
                    </button>
                  ) : null}
                  {editingFieldId === field.id ? renderEditor(field) : null}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}

function ReviewFieldEditor({
  field,
  companion,
  conditionalRequiredFieldIds,
  values,
  documents,
  disposition,
  locked,
  filesReading,
  onFilesReadingChange,
  onCancel,
  onSave,
}: {
  field: Field;
  companion?: Field;
  conditionalRequiredFieldIds: string[];
  values: Values;
  documents: Attachment[];
  disposition: Disposition | null;
  locked: boolean;
  filesReading: boolean;
  onFilesReadingChange: (reading: boolean) => void;
  onCancel: () => void;
  onSave: (values: Values, documents: Attachment[], disposition: Disposition | null) => void;
}) {
  const [draftValues, setDraftValues] = useState<Values>(() => ({
    [field.id]: values[field.id] || [],
    ...(companion ? { [companion.id]: values[companion.id] || [] } : {}),
  }));
  const [draftDocuments, setDraftDocuments] = useState(documents);
  const [draftDisposition, setDraftDisposition] = useState(disposition);
  const [invalid, setInvalid] = useState(false);
  const required = fieldIsRequired(field, conditionalRequiredFieldIds);
  const candidates = companion ? [field, companion] : [field];
  const hasValidAnswer = candidates.some((candidate) =>
    validValue(candidate, draftValues[candidate.id], draftDocuments),
  );

  function confirm() {
    const hasInvalidAnswer = candidates.some(
      (candidate) =>
        draftValues[candidate.id]?.length &&
        !validValue(candidate, draftValues[candidate.id], draftDocuments),
    );
    if (hasInvalidAnswer || (!hasValidAnswer && required)) {
      setInvalid(true);
      return;
    }
    onSave(draftValues, draftDocuments, hasValidAnswer ? null : draftDisposition);
  }

  return (
    <section
      id={`review-editor-${field.id}`}
      aria-label={`Edit ${field.label}`}
      className="mt-3 rounded-2xl border border-[#8e54d7]/25 bg-[#faf7ff] p-4"
    >
      {locked ? (
        <p className="text-sm text-amber-800">
          Brand and project title are locked after publishing to Drive or Jira.
        </p>
      ) : (
        <>
          <p className="mb-3 text-xs font-semibold text-[#6f35b6]">
            Update only {companion ? field.label.replace(/ \(file\)$/, '') : field.label}
          </p>
          <DocumentTemplateLink template={field.template} />
          <div className={companion ? 'grid gap-3 md:grid-cols-2' : ''}>
            {candidates.map((candidate) => (
              <div key={candidate.id} className="min-w-0">
                {companion ? (
                  candidate.type === 'document' ? (
                    <p className="mb-2 text-xs text-black/55">Upload a file</p>
                  ) : (
                    <label
                      htmlFor={`field-${candidate.id}`}
                      className="mb-2 block text-xs text-black/55"
                    >
                      Or paste a shared link
                    </label>
                  )
                ) : candidate.type !== 'document' ? (
                  <label htmlFor={`field-${candidate.id}`} className="sr-only">
                    {candidate.label}
                  </label>
                ) : null}
                <FieldInput
                  field={candidate}
                  value={draftValues[candidate.id] || []}
                  documents={draftDocuments}
                  setDocuments={setDraftDocuments}
                  disabled={filesReading}
                  onFilesReadingChange={onFilesReadingChange}
                  onChange={(next) => {
                    setDraftValues((current) => ({ ...current, [candidate.id]: next }));
                    setDraftDisposition(null);
                    setInvalid(false);
                  }}
                />
              </div>
            ))}
          </div>
          {!required ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(['pending', 'not-applicable'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={draftDisposition === option}
                  onClick={() => {
                    setDraftDisposition(option);
                    setDraftValues(
                      Object.fromEntries(candidates.map((candidate) => [candidate.id, []])),
                    );
                    setDraftDocuments(documents);
                    setInvalid(false);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs ${draftDisposition === option ? 'border-[#8e54d7] bg-[#eee5fa] text-[#5f2ca0]' : 'border-black/15 bg-white text-black/55'}`}
                >
                  {option === 'pending' ? "I'll add it later" : 'Not applicable'}
                </button>
              ))}
            </div>
          ) : null}
          {invalid ? (
            <p role="alert" className="mt-2 text-xs text-amber-800">
              Enter a valid answer before saving.
            </p>
          ) : null}
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {!locked ? (
          <Button
            type="button"
            disabled={filesReading}
            onClick={confirm}
            className="rounded-full bg-[#171717] px-4 text-white hover:bg-[#303030]"
          >
            Save changes
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-full px-4">
          Cancel
        </Button>
      </div>
    </section>
  );
}

function sourceLabel(source: Source, documents: Attachment[]) {
  if (source.kind === 'document') {
    const document = documents.find((item) => item.id === source.documentId);
    const location = source.page
      ? ` · ${document?.mimeType === presentationMimeType ? 'slide' : 'page'} ${source.page}`
      : '';
    return `${document?.name || 'Attached document'}${location}`;
  }
  if (source.kind === 'note')
    return source.excerpt.startsWith('Adjusted') ? 'Requester adjustment' : 'Your description';
  return 'Gemini recommendation';
}

function withGeneratedProjectName(values: Values): Values {
  const next = { ...values };
  next.projectName = [generatedProjectName(next)];
  return next;
}

function pruneInactive(values: Values): Values {
  const active = new Set(activeFields(values).map((field) => field.id));
  return Object.fromEntries(Object.entries(values).filter(([id]) => active.has(id)));
}

function ProposalEditor({
  field,
  values,
  documents,
  setDocuments,
  onFilesReadingChange,
  onSave,
  onCancel,
}: {
  field: Field;
  values: string[];
  documents: Attachment[];
  setDocuments: Dispatch<SetStateAction<Attachment[]>>;
  onFilesReadingChange: (reading: boolean) => void;
  onSave: (values: string[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(values);
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    const normalized = draft.map((value) => value.trim()).filter(Boolean);
    if (!validValue(field, normalized, documents)) return setInvalid(true);
    onSave(normalized);
  };

  return (
    <div className="mt-4 rounded-2xl border border-[#8e54d7]/25 bg-[#faf7ff] p-4">
      {field.options && field.type === 'select' ? (
        <select
          aria-label={`Edit ${field.label}`}
          value={draft[0] || ''}
          onChange={(event) => setDraft([event.target.value])}
          className="h-11 w-full rounded-xl border border-black/15 bg-white px-3 text-sm outline-none focus:border-[#8e54d7]"
        >
          <option value="">Select an option</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option === '__none__' ? 'None needed' : option}
            </option>
          ))}
        </select>
      ) : field.id === 'brand' ? (
        <BrandChoices value={draft} onChange={setDraft} />
      ) : field.options && field.type === 'multi' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {field.options.map((option) => {
            const checked = draft.includes(option);
            return (
              <label
                key={option}
                className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked)
                      return setDraft((current) => current.filter((value) => value !== option));
                    if (option === '__none__') return setDraft(['__none__']);
                    setDraft((current) => [
                      ...current.filter((value) => value !== '__none__'),
                      option,
                    ]);
                  }}
                  className="accent-[#7b3fc4]"
                />
                {option === '__none__' ? 'None needed' : option}
              </label>
            );
          })}
        </div>
      ) : field.type === 'document' ? (
        <div>
          <DocumentTemplateLink template={field.template} />
          <BriefDocuments
            documents={documents}
            setDocuments={setDocuments}
            onReadingChange={onFilesReadingChange}
            onFilesAdded={(added) =>
              setDraft((current) => [...current, ...added.map((document) => document.id)])
            }
            compact
            showDocuments={false}
          />
          <div className="mt-3 grid gap-2">
            {documents.map((document) => (
              <label
                key={document.id}
                className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={draft.includes(document.id)}
                  onChange={() =>
                    setDraft((current) =>
                      current.includes(document.id)
                        ? current.filter((value) => value !== document.id)
                        : [...current, document.id],
                    )
                  }
                  className="accent-[#7b3fc4]"
                />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {document.name}
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <Input
          type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
          min={field.type === 'number' ? 1 : undefined}
          value={draft.join(', ')}
          onChange={(event) =>
            setDraft(
              field.type === 'link'
                ? event.target.value.split(',').map((value) => value.trimStart())
                : [event.target.value],
            )
          }
          aria-label={`Edit ${field.label}`}
        />
      )}
      {invalid ? <p className="mt-2 text-xs text-red-700">Enter a valid value.</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={commit}>
          Save adjustment
        </Button>
      </div>
    </div>
  );
}

function InspirationPrompts({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <aside className="inspiration-card" aria-label="Examples to inspire your request">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#6f35b6]">
        For inspiration
      </p>
      <div className="inspiration-options mt-4 grid gap-3">
        {examples.map((example, index) => (
          <button
            key={example}
            type="button"
            className="inspiration-option"
            onClick={() => onSelect(example)}
            aria-label={`Use inspiration prompt ${index + 1}`}
          >
            <span className="inspiration-option-number" aria-hidden="true">
              {index + 1}
            </span>
            <span>{example}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

export function App() {
  const [savedDraft, setSavedDraft] = useState<
    (SavedBriefDraft & { documents: Attachment[] }) | null
  >(null);

  useEffect(() => {
    let active = true;
    readDraftDocuments()
      .catch(() => null)
      .then((stored) => {
        if (active) setSavedDraft(readSavedDraft(stored ?? readSavedDocuments()));
      });
    return () => {
      active = false;
    };
  }, []);

  if (!savedDraft) return null;
  return <BriefApp savedDraft={savedDraft} />;
}

function BriefApp({ savedDraft }: { savedDraft: SavedBriefDraft & { documents: Attachment[] } }) {
  const initialBriefId = useMemo(() => {
    const id = new URLSearchParams(window.location.search).get('brief');
    return id && /^[a-f0-9-]{36}$/.test(id) ? id : null;
  }, []);
  const initialRequestedStage = useMemo(() => stageFromPath(window.location.pathname), []);
  const initialReviewOrigin = useMemo<'creator' | 'library'>(
    () =>
      initialBriefId && window.history.state?.reviewOrigin !== 'creator' ? 'library' : 'creator',
    [initialBriefId],
  );
  const [stage, setStage] = useState<Stage>(() => {
    const requestedStage = initialRequestedStage;
    if (requestedStage && stageIsAvailable(requestedStage, savedDraft)) return requestedStage;
    return stageIsAvailable(savedDraft.stage, savedDraft) ? savedDraft.stage : 'intent';
  });
  const [intent, setIntent] = useState(savedDraft.intent);
  const [documents, setDocuments] = useState<Attachment[]>(savedDraft.documents);
  const [filesReading, setFilesReading] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(savedDraft.analysis);
  const [proposals, setProposals] = useState<Proposal[]>(savedDraft.proposals);
  const [values, setValues] = useState<Values>(savedDraft.values);
  const [sources, setSources] = useState<Record<string, Source>>(savedDraft.sources);
  const [suggested, setSuggested] = useState<Record<string, Proposal>>(
    Object.fromEntries(savedDraft.suggestions.map((proposal) => [proposal.fieldId, proposal])),
  );
  const [dispositions, setDispositions] = useState<Record<string, Disposition>>(
    savedDraft.dispositions,
  );
  const [clarificationHistory, setClarificationHistory] = useState(savedDraft.clarificationHistory);
  const [clarificationFocusId, setClarificationFocusId] = useState<string | null>(null);
  const [clarificationBackId, setClarificationBackId] = useState<string | null>(null);
  const [analyzedDocumentIds, setAnalyzedDocumentIds] = useState(
    () => new Set(savedDraft.analyzedDocumentIds),
  );
  const [traces, setTraces] = useState<AiRequestTrace[]>(savedDraft.traces);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [currentBriefId, setCurrentBriefId] = useState<string | null>(initialBriefId);
  const [nameLocked, setNameLocked] = useState(false);
  const [briefs, setBriefs] = useState<BriefSummary[]>([]);
  const [briefsLoading, setBriefsLoading] = useState(false);
  const [deletingBriefId, setDeletingBriefId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [reviewOrigin, setReviewOrigin] = useState<'creator' | 'library'>(initialReviewOrigin);
  const [reviewNeedsSave, setReviewNeedsSave] = useState(true);
  const [reviewEditingFieldId, setReviewEditingFieldId] = useState<string | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(Boolean(initialBriefId));
  const [drivePublishing, setDrivePublishing] = useState(false);
  const [driveProject, setDriveProject] = useState<{
    url: string;
    warnings: string[];
    fingerprint: string;
  } | null>(null);
  const [jiraPreview, setJiraPreview] = useState<JiraTaskPreview | null>(null);
  const [jiraLoading, setJiraLoading] = useState(false);
  const [jiraCreating, setJiraCreating] = useState(false);
  const requestLock = useRef(false);
  const lastSavedPayload = useRef('');

  const suggestionList = useMemo(() => Object.values(suggested), [suggested]);
  const currentDraft = useMemo<SavedBriefDraft>(
    () => ({
      version: 3,
      stage: stage === 'briefs' ? 'intent' : stage,
      intent,
      analysis,
      proposals,
      values,
      sources,
      suggestions: suggestionList,
      dispositions,
      clarificationHistory,
      analyzedDocumentIds: [...analyzedDocumentIds],
      traces,
    }),
    [
      analysis,
      analyzedDocumentIds,
      clarificationHistory,
      dispositions,
      intent,
      proposals,
      sources,
      stage,
      suggestionList,
      traces,
      values,
    ],
  );
  const proposalValues = useMemo<Values>(
    () => Object.fromEntries(proposals.map((proposal) => [proposal.fieldId, proposal.values])),
    [proposals],
  );
  const hasRouteProposal = validValue(
    fieldById.get('requestTypes')!,
    proposalValues.requestTypes,
    documents,
  );
  const unanalyzedDocumentCount = documents.filter(
    (document) => !analyzedDocumentIds.has(document.id),
  ).length;

  function navigateToStage(
    nextStage: Stage,
    {
      replace = false,
      briefId = currentBriefId,
      reviewSource = reviewOrigin,
    }: { replace?: boolean; briefId?: string | null; reviewSource?: 'creator' | 'library' } = {},
  ) {
    const nextPath = `${stagePaths[nextStage]}${briefId && nextStage !== 'briefs' ? `?brief=${briefId}` : ''}`;
    if (`${window.location.pathname}${window.location.search}` !== nextPath) {
      window.history[replace ? 'replaceState' : 'pushState'](
        nextStage === 'final' ? { reviewOrigin: reviewSource } : null,
        '',
        nextPath,
      );
    }
    setStage(nextStage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    const nextPath = `${stagePaths[stage]}${currentBriefId && stage !== 'briefs' ? `?brief=${currentBriefId}` : ''}`;
    if (`${window.location.pathname}${window.location.search}` !== nextPath) {
      window.history.replaceState(null, '', nextPath);
    }
  }, [currentBriefId, stage]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const requestedStage = stageFromPath(window.location.pathname);
      if (requestedStage && stageIsAvailable(requestedStage, { analysis, values, documents })) {
        if (
          requestedStage === 'final' &&
          ['creator', 'library'].includes(event.state?.reviewOrigin)
        ) {
          setReviewOrigin(event.state.reviewOrigin);
        }
        setStage(requestedStage);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      window.history.replaceState(null, '', stagePaths[stage]);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [analysis, documents, stage, values]);

  function applyStoredBrief(
    brief: StoredBrief,
    requestedStage?: Stage,
    origin: 'creator' | 'library' = 'library',
  ) {
    const draft = brief.draft;
    setIntent(draft.intent || '');
    setDocuments(brief.documents || []);
    setAnalysis(draft.analysis || null);
    setProposals(draft.proposals || []);
    setValues(restoreLegacyClarificationValues(draft, brief.documents || []));
    setSources(draft.sources || {});
    setSuggested(
      Object.fromEntries((draft.suggestions || []).map((proposal) => [proposal.fieldId, proposal])),
    );
    setDispositions(draft.dispositions || {});
    setClarificationHistory(draft.clarificationHistory || []);
    setClarificationFocusId(null);
    setClarificationBackId(null);
    setAnalyzedDocumentIds(new Set(draft.analyzedDocumentIds || []));
    setTraces(draft.traces || []);
    setEditing(null);
    setReviewOrigin(origin);
    setReviewNeedsSave(false);
    setReviewEditingFieldId(null);
    setSaveStatus('saved');
    setError('');
    setStorageWarning('');
    setCurrentBriefId(brief.id);
    setNameLocked(Boolean(brief.published));
    setDriveProject(null);
    setJiraPreview(null);
    lastSavedPayload.current = JSON.stringify({ draft, documents: brief.documents || [] });
    const availableDraft = {
      analysis: draft.analysis,
      values: draft.values,
      documents: brief.documents || [],
    };
    const nextStage =
      requestedStage && stageIsAvailable(requestedStage, availableDraft)
        ? requestedStage
        : stageIsAvailable(draft.stage, availableDraft)
          ? draft.stage === 'brief'
            ? 'clarify'
            : draft.stage
          : 'intent';
    navigateToStage(nextStage, { replace: true, briefId: brief.id, reviewSource: origin });
  }

  async function loadBrief(
    id: string,
    requestedStage?: Stage,
    origin: 'creator' | 'library' = 'library',
  ) {
    setLoadingBrief(true);
    setError('');
    try {
      const response = await fetch(`/api/briefs/${id}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not open this brief.');
      const brief = result as StoredBrief;
      applyStoredBrief(brief, requestedStage, origin);
      try {
        const driveResponse = await fetch(`/api/briefs/${id}/drive`);
        if (driveResponse.ok) {
          const drive = (await driveResponse.json()) as { url: string; warnings: string[] };
          setDriveProject({
            url: drive.url,
            warnings: drive.warnings,
            fingerprint: driveInputFingerprint(brief.draft.values || {}, brief.documents || []),
          });
        }
      } catch {
        // The brief remains usable when Drive status cannot be loaded.
      }
    } catch (caught) {
      setCurrentBriefId(null);
      setError(caught instanceof Error ? caught.message : 'Could not open this brief.');
      navigateToStage('briefs', { replace: true, briefId: null });
    } finally {
      setLoadingBrief(false);
    }
  }

  useEffect(() => {
    if (initialBriefId) {
      queueMicrotask(
        () =>
          void loadBrief(initialBriefId, initialRequestedStage || undefined, initialReviewOrigin),
      );
    }
    // The URL is only read once to restore a local project after a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBriefId, initialRequestedStage, initialReviewOrigin]);

  useEffect(() => {
    if (stage !== 'briefs') return;
    queueMicrotask(() => setBriefsLoading(true));
    fetch('/api/briefs')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load saved briefs.');
        setBriefs(result as BriefSummary[]);
      })
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : 'Could not load saved briefs.'),
      )
      .finally(() => setBriefsLoading(false));
  }, [stage]);

  useEffect(() => {
    if (currentBriefId || stage === 'briefs') return;
    try {
      localStorage.setItem(draftStorageKey, JSON.stringify(currentDraft));
      queueMicrotask(() =>
        setStorageWarning((current) => (current.includes('brief progress') ? '' : current)),
      );
    } catch {
      queueMicrotask(() =>
        setStorageWarning('Your brief progress could not be saved in this browser.'),
      );
    }
  }, [currentBriefId, currentDraft, stage]);

  useEffect(() => {
    if (currentBriefId || stage === 'briefs') return;
    let active = true;
    void writeDraftDocuments(documents)
      .then(() => {
        try {
          localStorage.removeItem(documentStorageKey);
          localStorage.removeItem(legacyDocumentStorageKey);
        } catch {
          // IndexedDB still contains the current attachments.
        }
        if (active)
          setStorageWarning((current) => (current.includes('attachments') ? '' : current));
      })
      .catch(() => {
        try {
          if (documents.length) localStorage.setItem(documentStorageKey, JSON.stringify(documents));
          else localStorage.removeItem(documentStorageKey);
          localStorage.removeItem(legacyDocumentStorageKey);
          if (active)
            setStorageWarning((current) => (current.includes('attachments') ? '' : current));
        } catch {
          try {
            localStorage.removeItem(documentStorageKey);
            localStorage.removeItem(legacyDocumentStorageKey);
          } catch {
            // Browser storage may be unavailable entirely.
          }
          if (active)
            setStorageWarning(
              'Your text is saved, but these attachments could not be stored in this browser. Select Save brief to keep them after a reload.',
            );
        }
      });
    return () => {
      active = false;
    };
  }, [currentBriefId, documents, stage]);

  async function saveBrief({ automatic = false }: { automatic?: boolean } = {}) {
    if (stage === 'briefs' || filesReading || loadingBrief) return;
    const payload = JSON.stringify({ draft: currentDraft, documents });
    if (automatic && payload === lastSavedPayload.current) return;
    if (!automatic) setSaveStatus('saving');
    try {
      const response = await fetch(
        currentBriefId ? `/api/briefs/${currentBriefId}` : '/api/briefs',
        {
          method: currentBriefId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save this brief.');
      const saved = result as BriefSummary & { projectName?: string };
      const savedId = saved.id;
      if (saved.projectName)
        setValues((current) => ({ ...current, projectName: [saved.projectName!] }));
      lastSavedPayload.current = payload;
      if (!currentBriefId) {
        setCurrentBriefId(savedId);
        clearBrowserDraft();
        navigateToStage(stage, { replace: true, briefId: savedId });
      }
      setSaveStatus('saved');
      if (!automatic && stage === 'final' && reviewOrigin === 'creator') {
        setReviewNeedsSave(false);
      }
      setStorageWarning('');
    } catch (caught) {
      setSaveStatus('error');
      if (!automatic)
        setError(caught instanceof Error ? caught.message : 'Could not save this brief.');
    }
  }

  useEffect(() => {
    if (
      !currentBriefId ||
      stage === 'briefs' ||
      loadingBrief ||
      (stage === 'final' && reviewOrigin === 'creator')
    )
      return;
    const payload = JSON.stringify({ draft: currentDraft, documents });
    if (payload === lastSavedPayload.current) {
      queueMicrotask(() => setSaveStatus('saved'));
      return;
    }
    setJiraPreview(null);
    setSaveStatus('saving');
    const timer = window.setTimeout(() => void saveBrief({ automatic: true }), 650);
    return () => window.clearTimeout(timer);
    // saveBrief is intentionally represented by the state that forms its payload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBriefId, currentDraft, documents, loadingBrief, reviewOrigin, stage]);

  async function deleteBrief(brief: BriefSummary) {
    if (
      !window.confirm(`Delete “${brief.name}”? This removes its local project from this machine.`)
    )
      return;
    setDeletingBriefId(brief.id);
    setError('');
    try {
      const response = await fetch(`/api/briefs/${brief.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not delete this brief.');
      setBriefs((current) => current.filter((item) => item.id !== brief.id));
      if (currentBriefId === brief.id) {
        setCurrentBriefId(null);
        lastSavedPayload.current = '';
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete this brief.');
    } finally {
      setDeletingBriefId(null);
    }
  }

  useEffect(() => {
    const documentIds = new Set(documents.map((document) => document.id));
    queueMicrotask(() => {
      setValues((current) => {
        let changed = false;
        const next: Values = { ...current };
        for (const field of fields) {
          if (field.type !== 'document' || !next[field.id]) continue;
          const kept = next[field.id].filter((id) => documentIds.has(id));
          if (kept.length !== next[field.id].length) {
            changed = true;
            if (kept.length) next[field.id] = kept;
            else delete next[field.id];
          }
        }
        return changed ? withGeneratedProjectName(pruneInactive(next)) : current;
      });
    });
  }, [documents]);

  function recordTrace(trace: AiRequestTrace) {
    console.info('[Brief AI request]', trace);
    setTraces((current) => [...current.slice(-19), trace]);
  }

  async function requestAnalysis(
    phase: AnalysisPhase,
    currentValues: Values,
    message: string,
    currentDocuments = documents,
    currentDispositions = dispositions,
  ) {
    const requestDocuments = currentDocuments.map((document) => ({
      ...document,
      data:
        phase === 'scope' ||
        (phase === 'document-enrichment' && !analyzedDocumentIds.has(document.id))
          ? document.data
          : '',
    }));
    const response = await fetch('/api/brief/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phase,
        values: currentValues,
        documents: requestDocuments,
        notes: '',
        message,
        dispositions: currentDispositions,
        rejected: [],
        conversation: [],
        pendingProposals:
          phase === 'document-enrichment'
            ? suggestionList.map(({ fieldId, values: proposalValue }) => ({
                fieldId,
                values: proposalValue,
              }))
            : [],
      }),
      signal: AbortSignal.timeout(100000),
    });
    const result = await response.json();
    if (result.trace) recordTrace(result.trace as AiRequestTrace);
    if (!response.ok) throw new Error(result.error || 'We could not analyze this brief.');
    const next = parseAnalysis(result.analysis, currentDocuments);
    return next;
  }

  function mergeSuggestions(nextAnalysis: Analysis, baseValues = values) {
    const incoming: Record<string, Proposal> = {};
    const autoAcceptedSources: Record<string, Source> = {};
    const autoAcceptedDocumentFields = new Set([
      'assetMatrix',
      'contentMatrix',
      'creativeDirection',
    ]);
    const next = { ...baseValues };
    for (const proposal of nextAnalysis.proposals) {
      if (proposal.fieldId === 'projectName') continue;
      const field = fieldById.get(proposal.fieldId);
      if (!field || validValue(field, baseValues[proposal.fieldId], documents)) continue;
      next[proposal.fieldId] = proposal.values;
      if (
        autoAcceptedDocumentFields.has(proposal.fieldId) &&
        field.type === 'document' &&
        proposal.source.kind === 'document'
      ) {
        autoAcceptedSources[proposal.fieldId] = proposal.source;
      } else {
        incoming[proposal.fieldId] = proposal;
      }
    }
    setValues(withGeneratedProjectName(pruneInactive(next)));
    setSuggested((current) => {
      const nextSuggested = { ...current, ...incoming };
      for (const fieldId of Object.keys(autoAcceptedSources)) delete nextSuggested[fieldId];
      return nextSuggested;
    });
    if (Object.keys(autoAcceptedSources).length)
      setSources((current) => ({ ...current, ...autoAcceptedSources }));
    if (Object.keys(autoAcceptedSources).length)
      setDispositions((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([fieldId]) => !autoAcceptedSources[fieldId]),
        ),
      );
    setAnalysis(nextAnalysis);
  }

  async function analyzeRequest() {
    if (!intent.trim() || requestLock.current || filesReading) return;
    requestLock.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await requestAnalysis('scope', {}, intent.trim());
      setAnalysis(next);
      setProposals(
        Array.from(
          new Map(
            next.proposals
              .filter((proposal) => proposal.fieldId !== 'projectName')
              .map((proposal) => [proposal.fieldId, proposal]),
          ).values(),
        ),
      );
      setAnalyzedDocumentIds(new Set(documents.map((document) => document.id)));
      setEditing(null);
      navigateToStage('review');
    } catch (caught) {
      setError(
        caught instanceof Error && caught.name !== 'TimeoutError'
          ? caught.message
          : 'The interpretation took too long. Please try again.',
      );
    } finally {
      setBusy(false);
      requestLock.current = false;
    }
  }

  async function confirmScope() {
    if (!hasRouteProposal || requestLock.current || filesReading) return;
    const confirmed = withGeneratedProjectName(cleanValues(proposalValues, documents));
    requestLock.current = true;
    setBusy(true);
    setError('');
    setValues(confirmed);
    setSources(
      Object.fromEntries(proposals.map((proposal) => [proposal.fieldId, proposal.source])),
    );
    setSuggested({});
    setClarificationHistory([]);
    setClarificationFocusId(null);
    setClarificationBackId(null);
    try {
      const next = await requestAnalysis(
        'follow-up',
        confirmed,
        'The requester confirmed this scope. Ask only for missing required Module 01 fields. Give each question brief context grounded in the confirmed request. Optional fields remain for review.',
      );
      setAnalysis(next);
    } catch (caught) {
      setAnalysis((current) => (current ? { ...current, questions: [] } : current));
      setError(caught instanceof Error ? caught.message : 'Could not prepare the next questions.');
    } finally {
      setBusy(false);
      requestLock.current = false;
      navigateToStage('clarify');
    }
  }

  const updateProposal = (fieldId: string, nextValues: string[]) => {
    setProposals((current) => {
      const existing = current.find((proposal) => proposal.fieldId === fieldId);
      const replacement: Proposal = {
        fieldId,
        values: nextValues,
        source: {
          kind: 'note',
          documentId: '',
          page: 0,
          excerpt: 'Adjusted and confirmed by the requester.',
        },
      };
      const updated = existing
        ? current.map((proposal) => (proposal.fieldId === fieldId ? replacement : proposal))
        : [replacement, ...current];
      if (fieldId !== 'requestTypes') return updated;
      const candidateValues = Object.fromEntries(
        updated.map((proposal) => [proposal.fieldId, proposal.values]),
      );
      const active = new Set(activeFields(candidateValues).map((field) => field.id));
      return updated.filter((proposal) => active.has(proposal.fieldId));
    });
    setEditing(null);
  };

  function updateValue(fieldId: string, nextValue: string[]) {
    if (nameLocked && (fieldId === 'brand' || fieldId === 'projectTitle')) return;
    const relatedFields: readonly string[] = alternativeFieldGroups.find((group) =>
      group.some((id) => id === fieldId),
    ) || [fieldId];
    const next = { ...values };
    if (nextValue.length) next[fieldId] = nextValue;
    else delete next[fieldId];
    const nextValues = withGeneratedProjectName(pruneInactive(next));
    const active = new Set(activeFields(nextValues).map((field) => field.id));
    setValues(nextValues);
    setSuggested((current) => {
      return Object.fromEntries(
        Object.entries(current).filter(([id]) => !relatedFields.includes(id) && active.has(id)),
      );
    });
    setDispositions((current) => {
      return Object.fromEntries(
        Object.entries(current).filter(([id]) => !relatedFields.includes(id) && active.has(id)),
      );
    });
    setSources((current) => ({
      ...Object.fromEntries(Object.entries(current).filter(([id]) => active.has(id))),
      [fieldId]: {
        kind: 'note',
        documentId: '',
        page: 0,
        excerpt: 'Provided directly by the requester.',
      },
    }));
  }

  function updateDisposition(fieldId: string, disposition: Disposition | null) {
    setDispositions((current) => {
      const next = { ...current };
      if (disposition) next[fieldId] = disposition;
      else delete next[fieldId];
      return next;
    });
    if (disposition) {
      setValues((current) => {
        const next = { ...current };
        delete next[fieldId];
        return withGeneratedProjectName(pruneInactive(next));
      });
      setSuggested((current) => {
        const next = { ...current };
        delete next[fieldId];
        return next;
      });
    }
  }

  function acceptSuggestion(fieldId: string) {
    const proposal = suggested[fieldId];
    if (!proposal) return;
    setSuggested((current) => {
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
    setSources((current) => ({ ...current, [fieldId]: proposal.source }));
  }

  async function analyzeDocuments() {
    if (!documents.length || requestLock.current || filesReading) return;
    requestLock.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await requestAnalysis(
        'document-enrichment',
        values,
        'Classify every newly attached document by its contents, especially completed Asset Matrices and Creative Directions, then fill missing active fields with explicit evidence. Do not change confirmed values.',
      );
      mergeSuggestions(next);
      setAnalyzedDocumentIds(new Set(documents.map((document) => document.id)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not analyze the new documents.');
    } finally {
      setBusy(false);
      requestLock.current = false;
    }
  }

  async function refreshGuidance() {
    if (requestLock.current) return;
    requestLock.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await requestAnalysis(
        'follow-up',
        values,
        'Review the current confirmed fields and dispositions. Ask only the next missing information.',
      );
      setAnalysis(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not refresh guidance.');
    } finally {
      setBusy(false);
      requestLock.current = false;
    }
  }

  async function prepareFinalReview() {
    if (requestLock.current || filesReading) return;
    requestLock.current = true;
    setBusy(true);
    setError('');
    setReviewEditingFieldId(null);
    if (reviewOrigin === 'creator') setReviewNeedsSave(true);
    navigateToStage('final');
    try {
      const next = await requestAnalysis(
        'final-review',
        values,
        'Prepare a concise final review. Identify unresolved or conflicting information without inventing values.',
      );
      setAnalysis(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not prepare the AI review.');
    } finally {
      setBusy(false);
      requestLock.current = false;
    }
  }

  const resetFlow = () => {
    clearBrowserDraft();
    setCurrentBriefId(null);
    setNameLocked(false);
    lastSavedPayload.current = '';
    setSaveStatus('idle');
    setReviewOrigin('creator');
    setReviewNeedsSave(true);
    setReviewEditingFieldId(null);
    navigateToStage('intent', { replace: true, briefId: null });
    setIntent('');
    setDocuments([]);
    setFilesReading(false);
    setAnalysis(null);
    setProposals([]);
    setValues({});
    setSources({});
    setSuggested({});
    setDispositions({});
    setClarificationHistory([]);
    setClarificationFocusId(null);
    setClarificationBackId(null);
    setAnalyzedDocumentIds(new Set());
    setTraces([]);
    setEditing(null);
    setError('');
    setStorageWarning('');
    setDriveProject(null);
    setJiraPreview(null);
  };

  const finalFields = activeFields(values).filter(
    (field) => !alternativeSecondaryIds.has(field.id),
  );
  const clarificationItems = clarificationItemsFor(values);
  const conditionalRequiredFieldIds = analysis?.conditionalRequiredFieldIds || [];
  const clarificationItemById = new Map(clarificationItems.map((item) => [item.field.id, item]));
  const clarificationUnresolved = clarificationItems.filter(
    (item) =>
      !clarificationItemResolved(
        item,
        values,
        documents,
        dispositions,
        suggested,
        conditionalRequiredFieldIds,
      ),
  );
  const clarificationVisited = [...new Set(clarificationHistory)].filter((id) =>
    clarificationItemById.has(id),
  );
  const clarificationActive =
    (clarificationBackId && clarificationItemById.get(clarificationBackId)) ||
    (clarificationFocusId && clarificationItemById.get(clarificationFocusId)) ||
    clarificationUnresolved[0];
  const clarificationActiveIndex = clarificationActive
    ? clarificationVisited.indexOf(clarificationActive.field.id)
    : -1;
  const clarificationCurrentNumber = clarificationActive
    ? clarificationActiveIndex >= 0
      ? clarificationActiveIndex + 1
      : clarificationVisited.length + 1
    : clarificationVisited.length;
  const clarificationTotal =
    clarificationVisited.length +
    clarificationUnresolved.filter((item) => !clarificationVisited.includes(item.field.id)).length +
    (clarificationActive &&
    !clarificationVisited.includes(clarificationActive.field.id) &&
    !clarificationUnresolved.some((item) => item.field.id === clarificationActive.field.id)
      ? 1
      : 0);
  const clarificationCompleted =
    clarificationActiveIndex >= 0 ? clarificationActiveIndex : clarificationVisited.length;
  const clarificationProgress = clarificationTotal
    ? Math.round((clarificationCompleted / clarificationTotal) * 100)
    : 100;
  function advanceClarification(acceptCurrentSuggestion = false) {
    if (!clarificationActive) return;
    const id = clarificationActive.field.id;
    if (acceptCurrentSuggestion) {
      for (const candidate of [clarificationActive.field, clarificationActive.companion]) {
        if (candidate && suggested[candidate.id]) acceptSuggestion(candidate.id);
      }
    }
    if (!clarificationVisited.includes(id)) {
      setClarificationHistory((current) => [...current, id]);
    }
    setClarificationBackId(null);
    setClarificationFocusId(null);
  }

  function goBackInClarification() {
    if (
      clarificationActive &&
      clarificationActiveIndex < 0 &&
      clarificationItemResolved(
        clarificationActive,
        values,
        documents,
        dispositions,
        suggested,
        conditionalRequiredFieldIds,
      )
    ) {
      setClarificationHistory((current) => [...current, clarificationActive.field.id]);
    }
    setClarificationFocusId(null);
    setClarificationBackId(null);
    if (clarificationActiveIndex > 0) {
      setClarificationBackId(clarificationVisited[clarificationActiveIndex - 1]);
    } else if (clarificationActiveIndex === 0) {
      navigateToStage('review');
    } else if (clarificationVisited.length) {
      setClarificationBackId(clarificationVisited[clarificationVisited.length - 1]);
    } else {
      navigateToStage('review');
    }
  }
  const clarificationQuestionById = new Map(
    (analysis?.questions || []).map((question) => [question.fieldId, question]),
  );
  const finalCandidates = (field: Field) => {
    const group = alternativeFieldsByPrimary.get(field.id);
    return group
      ? group
          .map((fieldId) => fieldById.get(fieldId))
          .filter((item): item is Field => Boolean(item))
      : [field];
  };
  const finalStatus = (field: Field): NonNullable<BriefPdfInput['rows'][number]['status']> => {
    const candidates = finalCandidates(field);
    if (candidates.some((candidate) => validValue(candidate, values[candidate.id], documents)))
      return 'Complete';
    if (candidates.some((candidate) => dispositions[candidate.id] === 'pending')) return 'Pending';
    if (
      !fieldIsRequired(field, conditionalRequiredFieldIds) &&
      candidates.every((candidate) => dispositions[candidate.id] === 'not-applicable')
    )
      return 'Not applicable';
    return fieldIsRequired(field, conditionalRequiredFieldIds) ? 'Missing' : 'Pending';
  };
  const finalValue = (field: Field) => {
    const candidates = finalCandidates(field);
    const provided = candidates
      .filter((candidate) => validValue(candidate, values[candidate.id], documents))
      .map((candidate) => displayValue(candidate, values[candidate.id], documents));
    if (provided.length) {
      const value = provided.join('; ');
      const notes = field.id === 'brand' ? brandExceptionNotes(values.brand) : [];
      return notes.length ? `${value}\n${notes.join('\n')}` : value;
    }
    return finalStatus(field);
  };
  const finalUnresolved = finalFields.filter(
    (field) =>
      fieldIsRequired(field, conditionalRequiredFieldIds) &&
      ['Missing', 'Pending'].includes(finalStatus(field)),
  );
  const finalMissing = finalUnresolved.filter((field) => finalStatus(field) === 'Missing');
  const optionalPendingCount = finalFields.filter(
    (field) =>
      !fieldIsRequired(field, conditionalRequiredFieldIds) && finalStatus(field) === 'Pending',
  ).length;
  const hasValidRoute = validValue(fieldById.get('requestTypes')!, values.requestTypes, documents);
  const finalPdfInput: BriefPdfInput = {
    projectName: values.projectName?.[0] || 'Untitled brief',
    summary: analysis?.summary || 'Review the structured information below.',
    status: finalUnresolved.length
      ? `${finalUnresolved.length} unresolved`
      : optionalPendingCount
        ? `${optionalPendingCount} optional pending`
        : 'Complete',
    rows: finalFields.map((field) => {
      const value = finalValue(field);
      const status = finalStatus(field);
      return {
        label: alternativeFieldsByPrimary.has(field.id)
          ? field.label.replace(/ \(file\)$/, '')
          : field.label,
        value,
        requirement: fieldIsRequired(field, conditionalRequiredFieldIds)
          ? ('Required' as const)
          : ('Optional' as const),
        status,
        unresolved:
          status === 'Pending' ||
          (fieldIsRequired(field, conditionalRequiredFieldIds) && status === 'Missing'),
      };
    }),
  };
  const driveFingerprint = driveInputFingerprint(values, documents);

  function saveReviewField(
    field: Field,
    nextFieldValues: Values,
    nextDocuments: Attachment[],
    disposition: Disposition | null,
  ) {
    if (nameLocked && (field.id === 'brand' || field.id === 'projectTitle')) return;
    const companionId = alternativeFieldsByPrimary.get(field.id)?.[1];
    const relatedIds = companionId ? [field.id, companionId] : [field.id];
    const next = { ...values };
    for (const id of relatedIds) {
      const answer = nextFieldValues[id] || [];
      if (disposition || !answer.length) delete next[id];
      else next[id] = answer;
    }
    const nextValues = withGeneratedProjectName(pruneInactive(next));
    const active = new Set(activeFields(nextValues).map((item) => item.id));
    setValues(nextValues);
    setDocuments(nextDocuments);
    setSuggested((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => !relatedIds.includes(id) && active.has(id)),
      ),
    );
    setDispositions((current) => ({
      ...Object.fromEntries(
        Object.entries(current).filter(([id]) => !relatedIds.includes(id) && active.has(id)),
      ),
      ...Object.fromEntries(disposition ? relatedIds.map((id) => [id, disposition]) : []),
    }));
    setSources((current) => ({
      ...Object.fromEntries(
        Object.entries(current).filter(([id]) => !relatedIds.includes(id) && active.has(id)),
      ),
      ...Object.fromEntries(
        relatedIds
          .filter((id) => nextValues[id]?.length)
          .map((id) => [
            id,
            {
              kind: 'note',
              documentId: '',
              page: 0,
              excerpt: 'Adjusted by the requester in review.',
            } as Source,
          ]),
      ),
    }));
    setReviewEditingFieldId(null);
    setJiraPreview(null);
    setAnalysis((current) =>
      current
        ? { ...current, summary: 'Review the updated brief details below.', warnings: [] }
        : current,
    );
    if (reviewOrigin === 'creator') {
      setReviewNeedsSave(true);
      setSaveStatus('idle');
    } else {
      setSaveStatus('saving');
    }
  }

  function downloadFinalBrief() {
    downloadBriefSummaryPdf(finalPdfInput);
  }

  async function publishToDrive() {
    if (
      drivePublishing ||
      busy ||
      filesReading ||
      lastSavedPayload.current !== JSON.stringify({ draft: currentDraft, documents })
    )
      return;
    setDrivePublishing(true);
    setError('');
    try {
      if (!currentBriefId) throw new Error('Save this brief before creating a Drive project.');
      const response = await fetch(`/api/briefs/${currentBriefId}/drive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          values,
          documents,
          pdf: finalPdfInput,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        url?: string;
        warnings?: string[];
      };
      if (!response.ok || !result.url)
        throw new Error(result.error || 'Could not create the Google Drive project.');
      setDriveProject({
        url: result.url,
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
        fingerprint: driveFingerprint,
      });
      setJiraPreview(null);
      setNameLocked(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not create the Google Drive project.',
      );
    } finally {
      setDrivePublishing(false);
    }
  }

  const jiraBriefSaved =
    Boolean(currentBriefId) && saveStatus !== 'saving' && saveStatus !== 'error' && !loadingBrief;
  const canPublishProject = Boolean(values.brand?.[0] && values.projectTitle?.[0]);

  async function previewJiraTask() {
    if (
      !currentBriefId ||
      !jiraBriefSaved ||
      driveProject?.fingerprint !== driveFingerprint ||
      jiraLoading ||
      lastSavedPayload.current !== JSON.stringify({ draft: currentDraft, documents })
    )
      return;
    setJiraLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/briefs/${currentBriefId}/jira/preview`);
      const result = (await response.json()) as JiraTaskPreview & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Could not preview the Jira Task.');
      setJiraPreview(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not preview the Jira Task.');
    } finally {
      setJiraLoading(false);
    }
  }

  async function createJiraTask() {
    if (
      !currentBriefId ||
      !jiraPreview ||
      !jiraBriefSaved ||
      driveProject?.fingerprint !== driveFingerprint ||
      jiraCreating ||
      lastSavedPayload.current !== JSON.stringify({ draft: currentDraft, documents })
    )
      return;
    setJiraCreating(true);
    setError('');
    try {
      const response = await fetch(`/api/briefs/${currentBriefId}/jira`, { method: 'POST' });
      const result = (await response.json()) as JiraTaskPreview & { error?: string };
      if (!response.ok && response.status !== 207)
        throw new Error(result.error || 'Could not create the Jira Task.');
      setJiraPreview(result);
      setNameLocked(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the Jira Task.');
    } finally {
      setJiraCreating(false);
    }
  }

  return (
    <div className="intent-shell min-h-screen text-[#171717]">
      <header className="border-b border-black/10 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[60px] max-w-[1400px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-[#171717] text-sm font-bold text-white">
              M
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">Intake Tool</p>
              <p className="mt-1 text-[10px] font-bold tracking-[0.13em] text-black/40">
                BRIEF ASSISTANT
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!(stage === 'final' && reviewOrigin === 'creator' && reviewNeedsSave) ? (
              <button
                type="button"
                onClick={() => navigateToStage('briefs', { briefId: null })}
                className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/55 transition-colors hover:border-black/20 hover:bg-black/[0.03] hover:text-black"
              >
                <FolderOpen className="size-3.5" /> <span className="hidden sm:inline">Briefs</span>
              </button>
            ) : null}
            {stage !== 'briefs' ? (
              <button
                type="button"
                onClick={() => void saveBrief()}
                disabled={
                  filesReading ||
                  loadingBrief ||
                  busy ||
                  saveStatus === 'saving' ||
                  Boolean(reviewEditingFieldId)
                }
                className="flex items-center gap-2 rounded-full bg-[#171717] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#303030] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saveStatus === 'saving' ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                {saveStatus === 'saving'
                  ? 'Saving'
                  : currentBriefId &&
                      saveStatus === 'saved' &&
                      !(stage === 'final' && reviewNeedsSave)
                    ? 'Saved'
                    : 'Save brief'}
              </button>
            ) : null}
            {!(stage === 'final' && reviewOrigin === 'creator' && reviewNeedsSave) ? (
              <button
                type="button"
                onClick={resetFlow}
                disabled={busy || filesReading}
                className="hidden items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-black/55 transition-colors hover:border-black/20 hover:bg-black/[0.03] hover:text-black disabled:cursor-not-allowed disabled:opacity-40 md:flex"
              >
                <RotateCcw className="size-3.5" /> Start over
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-5 py-5 sm:px-8 sm:py-6">
        {storageWarning ? (
          <p
            role="status"
            className="mx-auto mb-5 max-w-[1020px] rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950"
          >
            {storageWarning}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="mx-auto mb-5 max-w-[1020px] rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}

        {loadingBrief ? (
          <div className="grid min-h-[50vh] place-items-center">
            <p className="flex items-center gap-2 text-sm text-black/50">
              <LoaderCircle className="size-4 animate-spin" /> Opening brief
            </p>
          </div>
        ) : stage === 'briefs' ? (
          <BriefLibrary
            briefs={briefs}
            loading={briefsLoading}
            deletingId={deletingBriefId}
            onCreate={resetFlow}
            onView={(id) => void loadBrief(id, 'final')}
            onDelete={(brief) => void deleteBrief(brief)}
          />
        ) : stage === 'intent' ? (
          <div className="mx-auto max-w-[1320px]">
            <section className="mb-5 max-w-[860px]">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#eee5fa] px-3 py-1 text-[10px] font-bold tracking-[0.12em] text-[#6f35b6]">
                <Sparkles className="size-3.5" /> START WITH YOUR INTENT
              </div>
              <h1 className="text-balance text-3xl font-semibold leading-[1.04] tracking-[-0.045em] sm:text-[2.75rem]">
                What do you need?
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-black/55 sm:text-base">
                Describe your request. The Monks assistant will recommend a work path and prefill
                what it can before you confirm the scope.
              </p>
            </section>
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(440px,.8fr)]">
              <Card className="overflow-hidden rounded-[22px] border-black/10 bg-white py-0 shadow-[0_18px_50px_rgba(39,28,15,0.07)]">
                <CardContent className="p-0">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void analyzeRequest();
                    }}
                  >
                    <div className="p-4 sm:px-5 sm:py-4">
                      <Label htmlFor="brief-intent" className="text-sm font-semibold">
                        Describe your request
                      </Label>
                      <Textarea
                        id="brief-intent"
                        value={intent}
                        onChange={(event) => setIntent(event.target.value)}
                        maxLength={6000}
                        autoFocus
                        placeholder="For example: I need to adapt an existing campaign for a new retailer and market..."
                        className="mt-2 min-h-[120px] resize-none rounded-xl border-black/10 bg-[#fbfaf7] p-4 text-sm leading-6 shadow-none placeholder:text-black/30 focus-visible:border-[#8e54d7]/50 focus-visible:ring-[#8e54d7]/15"
                      />
                      <div className="mt-1.5 flex justify-end text-[11px] text-black/40">
                        <span className="tabular-nums">{intent.length}/6,000</span>
                      </div>
                      <div className="mt-3">
                        <BriefDocuments
                          documents={documents}
                          setDocuments={setDocuments}
                          disabled={busy}
                          onReadingChange={setFilesReading}
                          compact
                        />
                        <div className="mt-3">
                          <OptionalDocumentGuidance variant="initial" />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end border-t border-black/8 bg-[#fcfbf8] px-4 py-3 sm:px-5">
                      <Button
                        type="submit"
                        disabled={!intent.trim() || busy || filesReading}
                        className="h-9 rounded-full bg-[#171717] px-4 text-sm text-white hover:bg-[#303030]"
                      >
                        {busy ? (
                          <>
                            <LoaderCircle className="size-4 animate-spin" /> Interpreting request
                          </>
                        ) : (
                          <>
                            Find the best path <ArrowRight className="size-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
              <InspirationPrompts onSelect={setIntent} />
            </div>
          </div>
        ) : stage === 'review' && analysis ? (
          <div className="mx-auto max-w-[920px]">
            <button
              type="button"
              onClick={() => navigateToStage('intent')}
              className="mb-7 flex items-center gap-2 text-sm font-medium text-black/55 hover:text-black"
            >
              <ArrowLeft className="size-4" /> Back to your description
            </button>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_250px]">
              <section>
                <div className="mb-7">
                  <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#eee5fa] px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] text-[#6f35b6]">
                    <Sparkles className="size-3.5" /> PROPOSED SCOPE
                  </div>
                  <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                    Is this the right path?
                  </h1>
                  <p className="mt-4 text-base leading-7 text-black/60">{analysis.summary}</p>
                </div>
                {analysis.warnings.length ? (
                  <div className="mb-5 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    {analysis.warnings.map((warning) => (
                      <p key={warning} className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
                        {warning}
                      </p>
                    ))}
                  </div>
                ) : null}
                <div className="space-y-3">
                  {!hasRouteProposal ? (
                    <article className="rounded-[20px] border border-red-200 bg-white p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-600">
                            Work route · select to continue
                          </p>
                          <p className="mt-2 text-base font-semibold">
                            {analysis.questions.find(
                              (question) => question.fieldId === 'requestTypes',
                            )?.prompt || 'Choose the path before continuing'}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setEditing(editing === 'requestTypes' ? null : 'requestTypes')
                          }
                        >
                          <Pencil className="size-3.5" /> Choose
                        </Button>
                      </div>
                      {editing === 'requestTypes' ? (
                        <ProposalEditor
                          field={fieldById.get('requestTypes')!}
                          values={[]}
                          documents={documents}
                          setDocuments={setDocuments}
                          onFilesReadingChange={setFilesReading}
                          onSave={(next) => updateProposal('requestTypes', next)}
                          onCancel={() => setEditing(null)}
                        />
                      ) : null}
                    </article>
                  ) : null}
                  {proposals.map((proposal) => {
                    const field = fieldById.get(proposal.fieldId);
                    if (!field) return null;
                    return (
                      <article
                        key={proposal.fieldId}
                        className={`rounded-[20px] border bg-white p-5 shadow-[0_10px_35px_rgba(30,22,12,0.045)] ${field.id === 'requestTypes' ? 'border-[#8e54d7]/40' : 'border-black/10'}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/40">
                              {field.label}
                              {field.id === 'requestTypes' ? ' · determines the form' : ''}
                            </p>
                            <p className="mt-2 [overflow-wrap:anywhere] text-base font-semibold leading-6">
                              {displayValue(field, proposal.values, documents)}
                            </p>
                            {field.id === 'brand'
                              ? brandExceptionNotes(proposal.values).map((note) => (
                                  <p key={note} className="mt-2 text-xs leading-5 text-amber-800">
                                    {note}
                                  </p>
                                ))
                              : null}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(editing === field.id ? null : field.id)}
                            className="shrink-0 rounded-full"
                          >
                            <Pencil className="size-3.5" /> Adjust
                          </Button>
                        </div>
                        <div className="mt-4 flex items-start gap-2 border-t border-black/8 pt-3 text-xs leading-5 text-black/45">
                          {proposal.source.kind === 'document' ? (
                            <FileText className="mt-0.5 size-3.5 shrink-0" />
                          ) : (
                            <Sparkles className="mt-0.5 size-3.5 shrink-0" />
                          )}
                          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                            <strong className="font-semibold text-black/55">
                              {sourceLabel(proposal.source, documents)}
                            </strong>
                            {proposal.source.excerpt ? ` — ${proposal.source.excerpt}` : ''}
                          </span>
                        </div>
                        {editing === field.id ? (
                          <ProposalEditor
                            field={field}
                            values={proposal.values}
                            documents={documents}
                            setDocuments={setDocuments}
                            onFilesReadingChange={setFilesReading}
                            onSave={(next) => updateProposal(field.id, next)}
                            onCancel={() => setEditing(null)}
                          />
                        ) : null}
                      </article>
                    );
                  })}
                </div>
                <div className="mt-7 flex flex-col gap-3 rounded-[22px] border border-black/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void analyzeRequest()}
                    className="rounded-full"
                  >
                    <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} /> Retry
                    interpretation
                  </Button>
                  <Button
                    type="button"
                    disabled={!hasRouteProposal || busy}
                    onClick={() => void confirmScope()}
                    className="rounded-full bg-[#171717] px-5 text-white hover:bg-[#303030]"
                  >
                    {busy ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" /> Preparing questions
                      </>
                    ) : (
                      <>
                        <Check className="size-4" /> Confirm scope and continue
                      </>
                    )}
                  </Button>
                </div>
              </section>
              <aside className="lg:sticky lg:top-7 lg:self-start">
                <div className="rounded-[20px] bg-[#eee8f5] p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6f35b6]">
                    Your original request
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/65">
                    {intent}
                  </p>
                  {documents.length ? (
                    <p className="mt-4 border-t border-black/10 pt-3 text-xs text-black/45">
                      {documents.length} supporting attachment{documents.length === 1 ? '' : 's'}
                    </p>
                  ) : null}
                </div>
                <p className="mt-4 px-2 text-xs leading-5 text-black/45">
                  Next, the assistant will help you complete the remaining brief details.
                </p>
              </aside>
            </div>
          </div>
        ) : stage === 'clarify' ? (
          <div className="mx-auto max-w-[760px]">
            <h1 className="sr-only">Complete your brief</h1>
            <button
              type="button"
              onClick={goBackInClarification}
              disabled={busy}
              className="mb-7 flex items-center gap-2 text-sm font-medium text-black/55 hover:text-black disabled:opacity-40"
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#eee5fa] px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] text-[#6f35b6]">
                <Sparkles className="size-3.5" /> COMPLETE YOUR BRIEF
              </div>
              <span className="text-xs font-medium text-black/50" aria-live="polite">
                {clarificationActive
                  ? `Question ${clarificationCurrentNumber} of ${clarificationTotal}`
                  : 'All questions answered'}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Brief completion progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={clarificationProgress}
              className="h-2 overflow-hidden rounded-full bg-[#eee5fa]"
            >
              <div
                className="h-full rounded-full bg-[#7b3fc4] transition-[width]"
                style={{ width: `${clarificationProgress}%` }}
              />
            </div>
            {unanalyzedDocumentCount ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || filesReading}
                onClick={() => void analyzeDocuments()}
                className="mt-4 rounded-full"
              >
                Analyze {unanalyzedDocumentCount} new document
                {unanalyzedDocumentCount === 1 ? '' : 's'}
              </Button>
            ) : null}
            {clarificationActive ? (
              <div className="mt-7">
                <ClarificationTurn
                  key={clarificationActive.field.id}
                  item={clarificationActive}
                  conditionalRequiredFieldIds={conditionalRequiredFieldIds}
                  question={
                    clarificationQuestionById.get(clarificationActive.field.id) ||
                    (clarificationActive.companion
                      ? clarificationQuestionById.get(clarificationActive.companion.id)
                      : undefined)
                  }
                  values={values}
                  documents={documents}
                  setDocuments={setDocuments}
                  disabled={
                    busy ||
                    filesReading ||
                    (nameLocked && ['brand', 'projectTitle'].includes(clarificationActive.field.id))
                  }
                  onFilesReadingChange={setFilesReading}
                  onValueChange={(fieldId, nextValue) => {
                    setClarificationFocusId(clarificationActive.field.id);
                    updateValue(fieldId, nextValue);
                  }}
                  onAdvance={advanceClarification}
                  onDefer={() => {
                    updateDisposition(clarificationActive.field.id, 'pending');
                    if (clarificationActive.companion) {
                      updateDisposition(clarificationActive.companion.id, 'pending');
                    }
                    advanceClarification();
                  }}
                  onNotApplicable={() => {
                    updateDisposition(clarificationActive.field.id, 'not-applicable');
                    if (clarificationActive.companion) {
                      updateDisposition(clarificationActive.companion.id, 'not-applicable');
                    }
                    advanceClarification();
                  }}
                />
              </div>
            ) : (
              <div className="mt-7 rounded-[26px] border border-[#8e54d7]/20 bg-white p-7 text-center">
                <span className="mx-auto grid size-10 place-items-center rounded-full bg-[#eee5fa] text-[#6f35b6]">
                  <Check className="size-5" />
                </span>
                <h2 className="mt-4 text-2xl font-semibold">Your brief is ready to review</h2>
                <p className="mt-2 text-sm text-black/55">
                  We have gone through every relevant question. You can check the full brief next.
                </p>
                <Button
                  type="button"
                  disabled={busy || filesReading || !hasValidRoute || finalMissing.length > 0}
                  onClick={() => void prepareFinalReview()}
                  className="mt-6 rounded-full bg-[#171717] px-5 text-white hover:bg-[#303030]"
                >
                  Review brief <ArrowRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        ) : stage === 'brief' ? (
          <BriefForm
            values={values}
            conditionalRequiredFieldIds={conditionalRequiredFieldIds}
            sources={sources}
            documents={documents}
            setDocuments={setDocuments}
            suggested={suggested}
            dispositions={dispositions}
            questions={analysis?.questions || []}
            warnings={analysis?.warnings || []}
            busy={busy}
            filesReading={filesReading}
            unanalyzedDocumentCount={unanalyzedDocumentCount}
            onFilesReadingChange={setFilesReading}
            onValueChange={updateValue}
            onDispositionChange={updateDisposition}
            onAcceptSuggestion={acceptSuggestion}
            onAnalyzeDocuments={() => void analyzeDocuments()}
            onRefreshGuidance={() => void refreshGuidance()}
            onReview={() => void prepareFinalReview()}
            nameLocked={nameLocked}
          />
        ) : (
          <div className="mx-auto max-w-[860px]">
            {reviewOrigin === 'library' || !reviewNeedsSave ? (
              <button
                type="button"
                onClick={() => navigateToStage('briefs', { briefId: null })}
                className="mb-7 flex items-center gap-2 text-sm font-medium text-black/55 hover:text-black"
              >
                <ArrowLeft className="size-4" /> Back to briefs
              </button>
            ) : null}
            <div className="mb-5 grid size-12 place-items-center rounded-full bg-[#e8f7ed] text-[#147a3f]">
              <Check className="size-6" />
            </div>
            <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Brief PDF summary
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-black/60">
              {busy
                ? 'Gemini is checking the brief for unresolved information…'
                : analysis?.summary || 'Review the PDF summary below.'}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {reviewOrigin === 'creator' && reviewNeedsSave ? (
                <Button
                  type="button"
                  onClick={() => void saveBrief()}
                  disabled={
                    busy ||
                    filesReading ||
                    loadingBrief ||
                    saveStatus === 'saving' ||
                    Boolean(reviewEditingFieldId)
                  }
                  className="h-12 rounded-full bg-[#171717] px-6 text-base text-white hover:bg-[#303030]"
                >
                  {saveStatus === 'saving' ? (
                    <LoaderCircle className="size-5 animate-spin" />
                  ) : (
                    <Save className="size-5" />
                  )}
                  {saveStatus === 'saving' ? 'Saving brief' : 'Save brief'}
                </Button>
              ) : null}
              {reviewOrigin === 'library' ? (
                <>
                  <Button
                    type="button"
                    onClick={() => void publishToDrive()}
                    disabled={
                      !jiraBriefSaved ||
                      !canPublishProject ||
                      busy ||
                      filesReading ||
                      drivePublishing ||
                      Boolean(reviewEditingFieldId)
                    }
                    className="h-12 rounded-full bg-[#171717] px-6 text-base text-white hover:bg-[#303030]"
                  >
                    {drivePublishing ? (
                      <>
                        <LoaderCircle className="size-5 animate-spin" /> Creating Drive project
                      </>
                    ) : (
                      <>
                        <img src={googleDriveFavicon} alt="" className="size-5" /> Create project in Drive
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void previewJiraTask()}
                    disabled={
                      !jiraBriefSaved ||
                      !canPublishProject ||
                      driveProject?.fingerprint !== driveFingerprint ||
                      jiraLoading ||
                      jiraCreating ||
                      Boolean(reviewEditingFieldId)
                    }
                    className="h-12 rounded-full px-6 text-base"
                  >
                    {jiraLoading ? (
                      <LoaderCircle className="size-5 animate-spin" />
                    ) : (
                      <img src={jiraFavicon} alt="" className="size-5" />
                    )}
                    {jiraLoading ? 'Loading Jira preview' : 'Preview Jira Task'}
                  </Button>
                </>
              ) : null}
              {reviewOrigin === 'library' || !reviewNeedsSave ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={downloadFinalBrief}
                    disabled={
                      busy ||
                      drivePublishing ||
                      Boolean(reviewEditingFieldId) ||
                      (reviewOrigin === 'library' && !jiraBriefSaved)
                    }
                    className="h-12 rounded-full px-6 text-base"
                  >
                    <Download className="size-5" /> Download PDF
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetFlow}
                    disabled={
                      busy ||
                      filesReading ||
                      Boolean(reviewEditingFieldId) ||
                      (reviewOrigin === 'library' && !jiraBriefSaved)
                    }
                    className="h-12 rounded-full px-6 text-base"
                  >
                    <RotateCcw className="size-5" /> Request a new brief
                  </Button>
                </>
              ) : null}
            </div>
            {reviewOrigin === 'creator' && reviewNeedsSave ? (
              <p
                role="status"
                className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              >
                <AlertTriangle className="size-4 shrink-0 text-amber-700" />
                Save this brief before downloading its PDF or starting a new request.
              </p>
            ) : null}
            {reviewOrigin === 'creator' && !reviewNeedsSave ? (
              <p
                role="status"
                className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
              >
                <Check className="size-4 shrink-0" />
                Brief saved. You can now download the PDF or start a new request.
              </p>
            ) : null}
            {reviewOrigin === 'library' && !canPublishProject ? (
              <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <AlertTriangle className="size-4 shrink-0 text-amber-700" />
                Add a brand and project title before creating the Drive project.
              </p>
            ) : null}
            {reviewOrigin === 'library' && !jiraBriefSaved ? (
              <p
                role="status"
                className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              >
                <AlertTriangle className="size-4 shrink-0 text-amber-700" />
                {saveStatus === 'error'
                  ? 'Recent changes could not be saved. Use Save brief to retry.'
                  : 'Wait for recent changes to finish saving before using the brief.'}
              </p>
            ) : null}
            {reviewOrigin === 'library' && driveProject?.fingerprint !== driveFingerprint ? (
              <p className="mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <AlertTriangle className="size-4 shrink-0 text-amber-700" />
                Create a project in Drive before previewing the Jira Task.
              </p>
            ) : null}
            {reviewOrigin === 'library' && jiraPreview ? (
              <section className="mt-5 rounded-2xl border border-black/10 bg-white p-5 text-sm">
                <h2 className="text-lg font-semibold">Jira Task preview</h2>
                <p className="mt-2 font-medium">{jiraPreview.summary}</p>
                <p className="mt-1 text-black/55">Due {jiraPreview.dueDate || 'not set'}</p>
                <p className="mt-1 text-black/55">Labels: {jiraPreview.labels.join(', ')}</p>
                <dl className="mt-4 border-t border-black/10">
                  {jiraPreview.rows.map((row) => (
                    <div
                      key={row.label}
                      className="grid gap-1 border-b border-black/10 py-2 sm:grid-cols-[220px_1fr]"
                    >
                      <dt className="font-medium">{row.label}</dt>
                      <dd className="whitespace-pre-wrap text-black/65">
                        {row.url ? (
                          <a href={row.url} target="_blank" rel="noreferrer" className="underline">
                            {row.value}
                          </a>
                        ) : (
                          row.value || '—'
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                {jiraPreview.warnings.map((warning) => (
                  <p key={warning} className="mt-2 text-amber-800">
                    {warning}
                  </p>
                ))}
                {jiraPreview.existing ? (
                  <div className="mt-4">
                    <Button
                      asChild
                      variant="secondary"
                      className="h-12 rounded-full px-6 text-base"
                    >
                      <a href={jiraPreview.existing.url} target="_blank" rel="noreferrer">
                        <img src={jiraFavicon} alt="" className="size-5" /> Open Jira Task{' '}
                        {jiraPreview.existing.key}
                      </a>
                    </Button>
                    {jiraPreview.existing.briefChanged ? (
                      <p className="mt-2 text-amber-800">
                        This brief changed after the Task was created.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {!jiraPreview.creating && !jiraPreview.existing ? (
                  <Button
                    type="button"
                    onClick={() => void createJiraTask()}
                    disabled={
                      !jiraBriefSaved ||
                      !canPublishProject ||
                      driveProject?.fingerprint !== driveFingerprint ||
                      jiraCreating
                    }
                    className="mt-4 rounded-full bg-[#171717] px-5 text-white hover:bg-[#303030]"
                  >
                    {jiraCreating ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <img src={jiraFavicon} alt="" className="size-4" />
                    )}
                    Create in Jira
                  </Button>
                ) : null}
              </section>
            ) : null}
            {reviewOrigin === 'library' && driveProject?.fingerprint === driveFingerprint ? (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="font-semibold">Google Drive project created</p>
                <Button
                  asChild
                  variant="secondary"
                  className="mt-2 h-12 rounded-full px-6 text-base"
                >
                  <a href={driveProject.url} target="_blank" rel="noreferrer">
                    <img src={googleDriveFavicon} alt="" className="size-5" /> Open project folder
                  </a>
                </Button>
                {driveProject.warnings.map((warning) => (
                  <p key={warning} className="mt-2 text-amber-900">
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
            {analysis?.warnings.length ? (
              <div className="mt-5 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                {analysis.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            ) : null}
            <div className="mt-7">
              <BriefHtmlSummary
                brief={finalPdfInput}
                fields={finalFields}
                editingFieldId={reviewEditingFieldId}
                onEdit={(field) =>
                  setReviewEditingFieldId((current) => (current === field.id ? null : field.id))
                }
                onNotApplicable={(field) => saveReviewField(field, {}, documents, 'not-applicable')}
                renderEditor={(field) => (
                  <ReviewFieldEditor
                    conditionalRequiredFieldIds={conditionalRequiredFieldIds}
                    key={field.id}
                    field={field}
                    companion={
                      alternativeFieldsByPrimary.get(field.id)?.[1]
                        ? fieldById.get(alternativeFieldsByPrimary.get(field.id)![1])
                        : undefined
                    }
                    values={values}
                    documents={documents}
                    disposition={dispositions[field.id] || null}
                    locked={nameLocked && (field.id === 'brand' || field.id === 'projectTitle')}
                    filesReading={filesReading}
                    onFilesReadingChange={setFilesReading}
                    onCancel={() => setReviewEditingFieldId(null)}
                    onSave={(nextValues, nextDocuments, disposition) =>
                      saveReviewField(field, nextValues, nextDocuments, disposition)
                    }
                  />
                )}
              />
            </div>
            {reviewOrigin === 'library' ? (
              <p className="mt-6 text-sm leading-6 text-black/45">
                Creating the project again updates matching files and reuses the existing folder.
              </p>
            ) : null}
          </div>
        )}

        <div className="mx-auto mt-10 max-w-[1020px]">
          <AdvancedAiLog traces={traces} />
        </div>
      </main>
    </div>
  );
}
