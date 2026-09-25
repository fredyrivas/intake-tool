import { useMemo, type Dispatch, type SetStateAction } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDashed,
  FileSearch,
  FileText,
  GitBranch,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Button, Input, Label, Textarea } from '@monksflow/monks-ui';
import {
  activeFields,
  fieldIsRequired,
  presentationMimeType,
  validValue,
  type Attachment,
  type Field,
  type Proposal,
  type Source,
  type Values,
} from '../shared/brief-contract';
import { BriefDocuments } from './brief-documents';
import { sectionDescriptions, sectionFor, sectionOrder } from './brief-sections';
import { DocumentTemplateLink, OptionalDocumentGuidance } from './document-template-link';
import { BrandChoices } from './brand-choices';

export type Disposition = 'pending' | 'not-applicable';

const routeDescriptions: Record<string, string> = {
  CREATE: 'Net-new production or a new creative idea outside an NPD launch.',
  EVOLVE: 'Adaptation or refresh of an existing ATL or annual campaign.',
  ACCELERATE: 'E-commerce, digital retailer page or Shopper BTL work.',
  INNOVATE: 'Net-new assets for a new-product launch at scale.',
  '.com Copy Optimization': 'Copy optimization, FAQ creation or article review.',
  'QR Generation Request': 'A focused QR generation request.',
  'Delivery only': 'Existing assets that only need to be delivered.',
};

const routeDeliverableField: Record<string, string> = {
  CREATE: 'createDeliverables',
  EVOLVE: 'evolveDeliverables',
  ACCELERATE: 'accelerateDeliverables',
  INNOVATE: 'innovateDeliverables',
  '.com Copy Optimization': 'copyServices',
};

const resourceGroups: Record<string, { linkId: string; label: string; description: string }> = {
  annualCampaign: {
    linkId: 'annualCampaignLink',
    label: 'Annual campaign / reference deck',
    description: 'Provide the campaign source as an uploaded file or a shared link.',
  },
  contentMatrix: {
    linkId: 'contentMatrixLink',
    label: 'Content matrix',
    description:
      'The planned message or content for each asset. Provide it as a file or shared link if available.',
  },
  assetMatrix: {
    linkId: 'assetMatrixLink',
    label: 'Completed asset matrix',
    description:
      'The list of assets and their versions, formats, markets or specifications. Provide the completed file or a shared link if available.',
  },
  supportingReferences: {
    linkId: 'supportingLinks',
    label: 'Creative references / supporting materials',
    description: 'Provide supporting material as uploaded files, shared links or both.',
  },
  stockMaterials: {
    linkId: 'stockMaterialsLink',
    label: 'Stock materials',
    description: 'Provide the royalty-free stock material as an uploaded file or shared link.',
  },
  mediaPlan: {
    linkId: 'mediaPlanLink',
    label: 'Media plan',
    description: 'Provide the media plan as an uploaded file or a shared link.',
  },
  attachments: {
    linkId: 'links',
    label: 'Additional attachments or links',
    description: 'Add any optional supporting material that did not fit above.',
  },
};
const resourceLinkIds = new Set(Object.values(resourceGroups).map((group) => group.linkId));
const resourcePrimaryByLink = Object.fromEntries(
  Object.entries(resourceGroups).map(([primaryId, group]) => [group.linkId, primaryId]),
);

export function FieldInput({
  field,
  value,
  documents,
  setDocuments,
  disabled,
  onFilesReadingChange,
  onChange,
}: {
  field: Field;
  value: string[];
  documents: Attachment[];
  setDocuments: Dispatch<SetStateAction<Attachment[]>>;
  disabled: boolean;
  onFilesReadingChange: (reading: boolean) => void;
  onChange: (value: string[]) => void;
}) {
  if (field.options && field.type === 'select') {
    return (
      <select
        id={`field-${field.id}`}
        disabled={disabled}
        value={value[0] || ''}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
        className="h-11 w-full rounded-xl border border-black/15 bg-white px-3 text-sm outline-none focus:border-[#8e54d7]"
      >
        <option value="">Select an option</option>
        {field.options.map((option) => (
          <option key={option} value={option}>
            {option === '__none__' ? 'None needed' : option}
          </option>
        ))}
      </select>
    );
  }

  if (field.id === 'brand') {
    return <BrandChoices value={value} onChange={onChange} disabled={disabled} />;
  }

  if (field.options && field.type === 'multi') {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {field.options.map((option) => {
          const checked = value.includes(option);
          return (
            <label
              key={option}
              className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-sm"
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={checked}
                onChange={() => {
                  if (checked) return onChange(value.filter((item) => item !== option));
                  if (option === '__none__') return onChange(['__none__']);
                  onChange([...value.filter((item) => item !== '__none__'), option]);
                }}
                className="accent-[#7b3fc4]"
              />
              {option === '__none__' ? 'None needed' : option}
            </label>
          );
        })}
      </div>
    );
  }

  if (field.type === 'document') {
    return (
      <div className="space-y-3">
        <BriefDocuments
          documents={documents}
          setDocuments={setDocuments}
          disabled={disabled}
          onReadingChange={onFilesReadingChange}
          onFilesAdded={(added) => onChange([...value, ...added.map((document) => document.id)])}
          compact
          showDocuments={false}
        />
        {documents.length ? (
          <div className="grid gap-2">
            <p className="text-xs leading-5 text-black/45">
              Select any other uploaded files that also belong to this field.
            </p>
            {documents.map((document) => (
              <label
                key={document.id}
                className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white p-3 text-sm"
              >
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={value.includes(document.id)}
                  onChange={() =>
                    onChange(
                      value.includes(document.id)
                        ? value.filter((id) => id !== document.id)
                        : [...value, document.id],
                    )
                  }
                  className="accent-[#7b3fc4]"
                />
                <FileText className="size-4 shrink-0 text-[#6f35b6]" />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {document.name}
                </span>
              </label>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (field.type === 'link') {
    return (
      <Textarea
        id={`field-${field.id}`}
        disabled={disabled}
        value={value.join('\n')}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(/[\n,]/)
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
        placeholder="example.com/path (one link per line)"
        className="min-h-24 rounded-xl border-black/15 bg-white"
      />
    );
  }

  if (field.type === 'emails') {
    return (
      <Textarea
        id={`field-${field.id}`}
        disabled={disabled}
        value={value.join(', ')}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(/[;,\s]+/)
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
        placeholder="name@example.com, colleague@example.com"
        className="min-h-24 rounded-xl border-black/15 bg-white"
      />
    );
  }

  if (field.type === 'text' && !['projectName'].includes(field.id)) {
    return (
      <Textarea
        id={`field-${field.id}`}
        disabled={disabled}
        value={value[0] || ''}
        onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
        className="min-h-24 rounded-xl border-black/15 bg-white"
      />
    );
  }

  return (
    <Input
      id={`field-${field.id}`}
      disabled={disabled}
      type={
        field.type === 'date'
          ? 'date'
          : field.type === 'number'
            ? 'number'
            : field.type === 'email'
              ? 'email'
              : 'text'
      }
      min={field.type === 'number' ? 1 : undefined}
      readOnly={field.id === 'projectName'}
      value={value[0] || ''}
      onChange={(event) => onChange(event.target.value ? [event.target.value] : [])}
      className="rounded-xl border-black/15 bg-white read-only:bg-black/[0.035]"
    />
  );
}

function statusFor(
  field: Field,
  values: Values,
  documents: Attachment[],
  suggested: Record<string, Proposal>,
  dispositions: Record<string, Disposition>,
  conditionalRequiredFieldIds: string[],
) {
  if (suggested[field.id]) return 'Suggested';
  if (dispositions[field.id] === 'pending') return 'Pending';
  if (
    dispositions[field.id] === 'not-applicable' &&
    !fieldIsRequired(field, conditionalRequiredFieldIds)
  )
    return 'Not applicable';
  if (validValue(field, values[field.id], documents)) return 'Complete';
  return fieldIsRequired(field, conditionalRequiredFieldIds) ? 'Missing' : 'Optional';
}

function statusForFields(
  fields: Field[],
  values: Values,
  documents: Attachment[],
  suggested: Record<string, Proposal>,
  dispositions: Record<string, Disposition>,
  conditionalRequiredFieldIds: string[],
) {
  if (fields.some((field) => validValue(field, values[field.id], documents))) return 'Complete';
  if (fields.some((field) => suggested[field.id])) return 'Suggested';
  if (fields.some((field) => dispositions[field.id] === 'pending')) return 'Pending';
  if (
    fields.every((field) => dispositions[field.id] === 'not-applicable') &&
    !fields.some((field) => fieldIsRequired(field, conditionalRequiredFieldIds))
  )
    return 'Not applicable';
  return fields.some((field) => fieldIsRequired(field, conditionalRequiredFieldIds))
    ? 'Missing'
    : 'Optional';
}

function activationReason(field: Field, values: Values) {
  if (field.id === 'stockAvailability') return 'Shown because stock materials were selected.';
  if (field.id.startsWith('translation')) return 'Shown because translation was selected.';
  const nested = field.when.find((condition) => condition.field !== 'requestTypes');
  if (!nested) return null;
  const selected = nested.any.filter((value) => values[nested.field]?.includes(value));
  return selected.length ? `Shown because you selected ${selected.join(', ')}.` : null;
}

function sourceLabel(source: Source, documents: Attachment[]) {
  const document = documents.find((item) => item.id === source.documentId);
  const location = source.page
    ? ` · ${document?.mimeType === presentationMimeType ? 'slide' : 'page'} ${source.page}`
    : '';
  return `${document?.name || 'Attached document'}${location}`;
}

const statusStyle: Record<string, string> = {
  Complete: 'bg-[#e8f7ed] text-[#147a3f]',
  Suggested: 'bg-[#eee5fa] text-[#6f35b6]',
  Pending: 'bg-amber-100 text-amber-900',
  'Not applicable': 'bg-black/5 text-black/50',
  Optional: 'bg-black/[0.035] text-black/40',
  Missing: 'bg-red-50 text-red-700',
};

export function BriefForm({
  values,
  conditionalRequiredFieldIds,
  sources,
  documents,
  setDocuments,
  suggested,
  dispositions,
  questions,
  warnings,
  busy,
  filesReading,
  unanalyzedDocumentCount,
  onFilesReadingChange,
  onValueChange,
  onDispositionChange,
  onAcceptSuggestion,
  onAnalyzeDocuments,
  onRefreshGuidance,
  onReview,
  nameLocked = false,
}: {
  values: Values;
  conditionalRequiredFieldIds: string[];
  sources: Record<string, Source>;
  documents: Attachment[];
  setDocuments: Dispatch<SetStateAction<Attachment[]>>;
  suggested: Record<string, Proposal>;
  dispositions: Record<string, Disposition>;
  questions: { fieldId: string; prompt: string }[];
  warnings: string[];
  busy: boolean;
  filesReading: boolean;
  unanalyzedDocumentCount: number;
  onFilesReadingChange: (reading: boolean) => void;
  onValueChange: (fieldId: string, value: string[]) => void;
  onDispositionChange: (fieldId: string, value: Disposition | null) => void;
  onAcceptSuggestion: (fieldId: string) => void;
  onAnalyzeDocuments: () => void;
  onRefreshGuidance: () => void;
  onReview: () => void;
  nameLocked?: boolean;
}) {
  const applicable = useMemo(() => activeFields(values), [values]);
  const sections = useMemo(
    () =>
      sectionOrder
        .map((name) => ({ name, fields: applicable.filter((field) => sectionFor(field) === name) }))
        .filter((section) => section.fields.length),
    [applicable],
  );
  const required = applicable.filter((field) => fieldIsRequired(field, conditionalRequiredFieldIds));
  const requiredStatuses = required.map((field) =>
    statusFor(field, values, documents, suggested, dispositions, conditionalRequiredFieldIds),
  );
  const resolved = requiredStatuses.filter(
    (status) => status !== 'Missing' && status !== 'Suggested',
  ).length;
  const missing = requiredStatuses.filter((status) => status === 'Missing').length;
  const routes = values.requestTypes || [];
  const selectedDeliverables = routes.flatMap((route) =>
    routeDeliverableField[route] ? values[routeDeliverableField[route]] || [] : [],
  );
  const selectedNeeds = [
    ...(routes.includes('EVOLVE') ? values.evolveNeeds || [] : []),
    ...(routes.includes('ACCELERATE') ? values.accelerateNeeds || [] : []),
  ];
  const pathNodes = [
    'Project basics',
    routes.join(', '),
    selectedDeliverables.filter((value) => value !== '__none__').join(', '),
    selectedNeeds.filter((value) => value !== '__none__').join(', '),
    (values.deliveryTypes || []).join(', ') || 'Delivery',
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-[1020px]">
      <section className="mb-7">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#e8f7ed] px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] text-[#147a3f]">
          <Check className="size-3.5" /> SCOPE CONFIRMED
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          Complete your brief
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-black/60">
          Your confirmed route determines the fields below. Review what is already complete, accept
          AI suggestions and fill or defer the remaining information.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-xs">
          {(values.requestTypes || []).map((route) => (
            <span
              key={route}
              className="rounded-full bg-[#171717] px-3 py-1.5 font-semibold text-white"
            >
              {route}
            </span>
          ))}
          <span className="rounded-full bg-white px-3 py-1.5 text-black/55">
            {resolved} of {required.length} required addressed
          </span>
          <span className="rounded-full bg-red-50 px-3 py-1.5 text-red-700">{missing} missing</span>
        </div>
      </section>

      <section className="mb-6 overflow-hidden rounded-[22px] border border-[#8e54d7]/25 bg-white shadow-[0_10px_32px_rgba(64,34,92,0.06)]">
        <div className="flex items-start gap-3 border-b border-[#8e54d7]/15 bg-[#f7f1fd] p-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#6f35b6] text-white">
            <GitBranch className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6f35b6]">
              Your current path
            </p>
            <p className="mt-1 text-sm leading-6 text-black/55">
              {routes.length
                ? routes
                    .map((route) => routeDescriptions[route])
                    .filter(Boolean)
                    .join(' ')
                : 'Choose a route to reveal the relevant brief inputs.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-5" aria-label="Current brief path">
          {pathNodes.map((node, index) => (
            <div key={`${node}-${index}`} className="flex min-w-0 items-center gap-2">
              {index ? <ChevronRight className="size-4 shrink-0 text-[#8e54d7]/50" /> : null}
              <span
                className={`max-w-[290px] [overflow-wrap:anywhere] rounded-full px-3 py-2 text-xs font-semibold ${
                  index === 1 ? 'bg-[#171717] text-white' : 'bg-[#f4eff8] text-[#51306f]'
                }`}
                title={node}
              >
                {node}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-[22px] border border-[#8e54d7]/20 bg-[#f7f1fd] p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eee5fa] text-[#6f35b6]">
            <FileSearch className="size-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold">Enrich this path</h2>
            <p className="mt-1 text-sm leading-6 text-black/55">
              Add the completed documents that give this brief its creative and adaptation context.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <OptionalDocumentGuidance variant="enrich" />
        </div>
        <div className="mt-4">
          <BriefDocuments
            documents={documents}
            setDocuments={setDocuments}
            disabled={busy}
            onReadingChange={onFilesReadingChange}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            disabled={!documents.length || busy || filesReading}
            onClick={onAnalyzeDocuments}
            className="rounded-full bg-[#171717] text-white hover:bg-[#303030]"
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <FileSearch className="size-4" />
            )}
            {unanalyzedDocumentCount
              ? `Analyze ${unanalyzedDocumentCount} new document${unanalyzedDocumentCount === 1 ? '' : 's'}`
              : 'Reanalyze documents'}
          </Button>
        </div>
      </section>

      {warnings.length ? (
        <div className="mb-6 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          {warnings.map((warning) => (
            <p key={warning} className="flex gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" /> {warning}
            </p>
          ))}
        </div>
      ) : null}

      {questions.length ? (
        <section className="mb-6 rounded-[22px] bg-[#eee8f5] p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-[#6f35b6]">
              <Sparkles className="size-4" /> Suggested next answers
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onRefreshGuidance}
            >
              <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
          <ul className="mt-3 space-y-2 text-sm leading-6">
            {questions.map((question) => (
              <li key={`${question.fieldId}-${question.prompt}`}>
                <a
                  href={`#field-card-${resourcePrimaryByLink[question.fieldId] || question.fieldId}`}
                  className="flex gap-3 hover:text-[#6f35b6]"
                >
                  <CircleDashed className="mt-1 size-4 shrink-0" /> {question.prompt}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="space-y-7">
        {sections.map((section) => (
          <section
            key={section.name}
            className="overflow-hidden rounded-[24px] border border-black/8 bg-black/[0.018]"
          >
            <div className="border-b border-black/8 bg-white px-5 py-4 sm:px-6">
              <h2 className="text-lg font-semibold tracking-[-0.02em]">{section.name}</h2>
              <p className="mt-1 text-sm leading-6 text-black/45">
                {sectionDescriptions[section.name]}
              </p>
            </div>
            <div className="space-y-3 p-3 sm:p-4">
              {section.fields.map((field) => {
                if (resourceLinkIds.has(field.id)) return null;
                const resourceGroup = resourceGroups[field.id];
                const companion = resourceGroup
                  ? section.fields.find((candidate) => candidate.id === resourceGroup.linkId)
                  : undefined;
                const cardFields = companion ? [field, companion] : [field];
                const status = resourceGroup
                  ? statusForFields(
                      cardFields, values, documents, suggested, dispositions,
                      conditionalRequiredFieldIds,
                    )
                  : statusFor(
                      field, values, documents, suggested, dispositions,
                      conditionalRequiredFieldIds,
                    );
                const proposals = cardFields
                  .map((candidate) => suggested[candidate.id])
                  .filter((proposal): proposal is Proposal => Boolean(proposal));
                const source = cardFields.map((candidate) => sources[candidate.id]).find(Boolean);
                const reason = activationReason(field, values);
                const required = cardFields.some((candidate) =>
                  fieldIsRequired(candidate, conditionalRequiredFieldIds),
                );
                const pending = cardFields.every(
                  (candidate) => dispositions[candidate.id] === 'pending',
                );
                const notApplicable = cardFields.every(
                  (candidate) => dispositions[candidate.id] === 'not-applicable',
                );
                return (
                  <article
                    id={`field-card-${field.id}`}
                    key={field.id}
                    className="scroll-mt-5 rounded-[20px] border border-black/10 bg-white p-5 shadow-[0_8px_28px_rgba(30,22,12,0.04)]"
                  >
                    {reason ? (
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#7b3fc4]">
                        {reason}
                      </p>
                    ) : null}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <Label htmlFor={`field-${field.id}`} className="text-sm font-semibold">
                        {resourceGroup?.label || field.label}{' '}
                        {required ? <span className="text-red-600">*</span> : null}
                      </Label>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${statusStyle[status]}`}
                      >
                        {status}
                      </span>
                    </div>
                    {resourceGroup ? (
                      <p className="mb-3 text-xs leading-5 text-black/45">
                        {resourceGroup.description}
                      </p>
                    ) : null}
                    {field.id === 'projectName' ? (
                      <p className="mb-3 text-xs leading-5 text-black/45">
                        Generated as SC Johnson · Brand · Project title · IT identifier. It becomes
                        final after the first save.
                      </p>
                    ) : null}
                    {nameLocked && (field.id === 'brand' || field.id === 'projectTitle') ? (
                      <p className="mb-3 text-xs leading-5 text-black/45">
                        Locked because this project has been published to Jira or Drive.
                      </p>
                    ) : null}
                    {field.id === 'mainApproverEmail' ? (
                      <p className="mb-3 text-xs leading-5 text-black/45">
                        This person gives final approval for produced assets. Enter your own email
                        if you are the approver.
                      </p>
                    ) : null}
                    {field.id === 'reviewerEmails' ? (
                      <p className="mb-3 text-xs leading-5 text-black/45">
                        Optional collaborators who participate in asset review. Separate email
                        addresses with commas, semicolons or spaces.
                      </p>
                    ) : null}
                    <DocumentTemplateLink template={field.template} />
                    {companion ? (
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <div className="min-w-0 rounded-2xl border border-black/8 bg-black/[0.015] p-4">
                          <p className="mb-3 text-xs font-semibold text-black/55">Upload a file</p>
                          <FieldInput
                            field={field}
                            value={values[field.id] || []}
                            documents={documents}
                            setDocuments={setDocuments}
                            disabled={busy || filesReading}
                            onFilesReadingChange={onFilesReadingChange}
                            onChange={(value) => onValueChange(field.id, value)}
                          />
                        </div>
                        <div className="min-w-0 rounded-2xl border border-black/8 bg-black/[0.015] p-4">
                          <p className="mb-3 text-xs font-semibold text-black/55">
                            Or add a shared link
                          </p>
                          <FieldInput
                            field={companion}
                            value={values[companion.id] || []}
                            documents={documents}
                            setDocuments={setDocuments}
                            disabled={busy || filesReading}
                            onFilesReadingChange={onFilesReadingChange}
                            onChange={(value) => onValueChange(companion.id, value)}
                          />
                        </div>
                      </div>
                    ) : (
                      <FieldInput
                        field={field}
                        value={values[field.id] || []}
                        documents={documents}
                        setDocuments={setDocuments}
                        disabled={
                          busy ||
                          filesReading ||
                          (nameLocked && (field.id === 'brand' || field.id === 'projectTitle'))
                        }
                        onFilesReadingChange={onFilesReadingChange}
                        onChange={(value) => onValueChange(field.id, value)}
                      />
                    )}
                    {source && status === 'Complete' && field.id !== 'projectName' ? (
                      <p className="mt-2 text-xs leading-5 text-black/40">
                        {source.kind === 'document'
                          ? `Classified from ${sourceLabel(source, documents)}${source.excerpt ? ` — ${source.excerpt}` : ''}`
                          : source.kind === 'interpretation'
                            ? 'Confirmed from Gemini’s recommendation.'
                            : source.excerpt.startsWith('Provided directly')
                              ? 'Provided directly by the requester.'
                              : 'Confirmed from the original description.'}
                      </p>
                    ) : null}
                    {proposals.map((proposal) => (
                      <div
                        key={proposal.fieldId}
                        className="mt-3 flex flex-col gap-2 rounded-xl bg-[#faf7ff] p-3 text-xs leading-5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <p className="text-black/55">
                          <strong className="font-semibold text-[#6f35b6]">AI suggestion</strong>
                          {resourceGroup
                            ? ` · ${proposal.fieldId === field.id ? 'File' : 'Link'}`
                            : ''}
                          {proposal.source.excerpt ? ` — ${proposal.source.excerpt}` : ''}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => onAcceptSuggestion(proposal.fieldId)}
                        >
                          <Check className="size-3.5" /> Accept
                        </Button>
                      </div>
                    ))}
                    {field.id !== 'projectName' ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            cardFields.forEach((candidate) =>
                              onDispositionChange(candidate.id, pending ? null : 'pending'),
                            )
                          }
                        >
                          I don't know yet
                        </Button>
                        {!required ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              cardFields.forEach((candidate) =>
                                onDispositionChange(
                                  candidate.id,
                                  notApplicable ? null : 'not-applicable',
                                ),
                              )
                            }
                          >
                            Not applicable
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-3 rounded-[22px] border border-black/10 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Ready to review?</p>
          <p className="mt-1 text-xs text-black/45">
            Missing answers may remain explicitly pending.
          </p>
        </div>
        <Button
          type="button"
          disabled={busy || filesReading}
          onClick={onReview}
          className="rounded-full bg-[#171717] px-5 text-white hover:bg-[#303030]"
        >
          Review structured brief <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
