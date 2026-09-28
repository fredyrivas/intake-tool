import type { Dispatch, SetStateAction } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@monksflow/monks-ui';
import { capitalizeToolNames, fieldIsRequired, validValue, type Analysis, type Attachment, type Values } from '../shared/brief-contract';
import type { ClarificationItem } from './brief-sections';
import { FieldInput } from './brief-form';
import { DocumentTemplateLink } from './document-template-link';
import { allOptionsSelected, toggleAllOptions } from './multi-options';

const fieldContext: Record<string, string> = {
  projectTitle: 'Let’s give this work a name that will be easy to recognize later.',
  brand: 'Let’s make sure the right people recognize this work.',
  region: 'Different markets can call for different content and specifications.',
  mainApproverEmail: 'Someone will need to give the final sign-off.',
  reviewerEmails: 'Others may want to weigh in before the final sign-off.',
  assetType: 'Let’s get a clearer picture of what you’re making.',
  expectedDeliveryDate: 'Knowing the timing helps us plan the work.',
  mediaPlacementRetailer: 'The destination can shape the asset specifications.',
  totalAssets: 'An approximate number is enough to help us size the work.',
  creativeDirection: 'Existing creative direction can help us stay aligned with your vision.',
  requestTypes: 'Your answer will shape what we ask next.',
  deliveryTypes: 'Let’s make sure the handoff works for you.',
};

const fieldQuestion: Record<string, string> = {
  projectTitle: 'What would you like to call this work?',
  brand: 'Which brand is this for?',
  region: 'Which markets is this for?',
  mainApproverEmail: 'Who should approve the final work?',
  reviewerEmails: 'Who else should review it?',
  assetType: 'What kind of assets are you making?',
  expectedDeliveryDate: 'When would you like the finished work?',
  mediaPlacementRetailer: 'Where will these assets run?',
  totalAssets: 'About how many assets do you expect?',
  creativeDirection: 'Do you have creative direction to share?',
  requestTypes: 'What kind of work are you planning?',
  deliveryTypes: 'How would you like the assets delivered?',
};

const totalAssetOptions = ['1', '2', '3', '5', '10', '20', '30', '40', '50'];

export function ClarificationTurn({
  item,
  question,
  conditionalRequiredFieldIds,
  values,
  documents,
  setDocuments,
  disabled,
  onFilesReadingChange,
  onValueChange,
  onAdvance,
  onDefer,
  onNotApplicable,
}: {
  item: ClarificationItem;
  question?: Analysis['questions'][number];
  conditionalRequiredFieldIds: string[];
  values: Values;
  documents: Attachment[];
  setDocuments: Dispatch<SetStateAction<Attachment[]>>;
  disabled: boolean;
  onFilesReadingChange: (reading: boolean) => void;
  onValueChange: (fieldId: string, value: string[]) => void;
  onAdvance: (acceptSuggestion: boolean) => void;
  onDefer: () => void;
  onNotApplicable: () => void;
}) {
  const { field, companion } = item;
  const candidates = companion ? [field, companion] : [field];
  const required = fieldIsRequired(field, conditionalRequiredFieldIds);
  const answered = candidates.some((candidate) =>
    validValue(candidate, values[candidate.id], documents),
  );
  const invalid =
    !answered &&
    candidates.some(
      (candidate) =>
        Boolean(values[candidate.id]?.length) &&
        !validValue(candidate, values[candidate.id], documents),
    );
  const label = companion ? field.label.replace(/ \(file\)$/, '') : field.label;
  const selectedParent = field.when.flatMap((condition) =>
    condition.any.filter((option) => values[condition.field]?.includes(option)),
  )[0];
  const conditionalReason = selectedParent
    ? item.section === '03 · Delivery'
      ? `With ${selectedParent} in scope, let’s work out how the final assets should be handed off.`
      : item.section === '02C · Production needs'
        ? `With ${selectedParent} in scope, let’s work through the production details.`
        : `With ${selectedParent} in scope, let’s pin down the details.`
    : 'Let’s get a clearer picture of this part of the work.';
  const context = capitalizeToolNames(question?.context?.trim() || fieldContext[field.id] || conditionalReason);
  const fallbackQuestion =
    field.id === 'attachments'
      ? 'Are there any other additional attachments?'
      : field.id === 'otherProductionFiles'
        ? 'Are there any other production attachments?'
        : field.type === 'document'
          ? `Do you have a file to share for ${label.toLowerCase()}?`
          : `What should we know about ${label.toLowerCase()}?`;
  const modelPrompt = question?.prompt?.trim();
  const prompt = capitalizeToolNames(
    field.type === 'document' &&
      (field.id === 'attachments' ||
        field.id === 'otherProductionFiles' ||
        !modelPrompt ||
        /^What should we know about\b/i.test(modelPrompt))
      ? fieldQuestion[field.id] || fallbackQuestion
      : modelPrompt || fieldQuestion[field.id] || fallbackQuestion,
  );
  const quickAnswers =
    field.id === 'totalAssets'
      ? totalAssetOptions
      : field.options || ['document', 'email', 'emails'].includes(field.type) || companion
      ? []
      : (question?.options || [])
          .filter(
            (option) =>
              validValue(field, [option], documents) &&
              !/^(i (don'?t|do not) know|not applicable|none yet)/i.test(option),
          )
          .slice(0, 4);

  return (
    <section
      aria-labelledby={`clarify-question-${field.id}`}
      className="rounded-[26px] border border-[#8e54d7]/20 bg-white p-5 shadow-[0_16px_45px_rgba(44,25,64,0.07)] sm:p-7"
    >
      <div className="flex items-start gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eee5fa] text-[#6f35b6]"
          aria-hidden="true"
        >
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-6 text-black/60">{context}</p>
          <h2
            id={`clarify-question-${field.id}`}
            className="mt-3 text-xl font-semibold leading-7 tracking-[-0.025em] sm:text-2xl"
          >
            {prompt}
          </h2>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6f35b6]">
            {required ? 'Required' : 'Optional'}
          </p>
        </div>
      </div>

      <div className="mt-6 sm:pl-12">
        {field.id !== 'brand' && field.options && ['select', 'multi'].includes(field.type) ? (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Answer options">
            {(field.type === 'multi' ? ['All', ...field.options] : field.options).map((option) => {
              const selected = option === 'All'
                ? allOptionsSelected(field.options!, values[field.id] || [])
                : (values[field.id] || []).includes(option);
              return (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => {
                    if (field.type === 'multi') {
                      const current = values[field.id] || [];
                      onValueChange(
                        field.id,
                        option === 'All'
                          ? toggleAllOptions(field.options!, current)
                          : selected
                          ? current.filter((value) => value !== option)
                          : option === '__none__'
                            ? ['__none__']
                            : [...current.filter((value) => value !== '__none__'), option],
                      );
                    } else {
                      onValueChange(field.id, [option]);
                      onAdvance(false);
                    }
                  }}
                  className={`h-auto max-w-full whitespace-normal rounded-xl px-4 py-3 text-left text-sm ${selected ? 'border-[#8e54d7] bg-[#f4edfc] text-[#5f2ca0]' : 'border-black/12 bg-white text-black/70'}`}
                >
                  {option === '__none__' ? 'None needed' : option}
                </Button>
              );
            })}
          </div>
        ) : (
          <>
            {quickAnswers.length ? (
              <div
                className="mb-4 flex flex-wrap gap-2"
                role="group"
                aria-label="Suggested answers"
              >
                {quickAnswers.map((answer) => (
                  <Button
                    key={answer}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() => {
                      onValueChange(field.id, [answer]);
                      onAdvance(false);
                    }}
                    className="h-auto max-w-full whitespace-normal rounded-xl px-4 py-3 text-left text-sm"
                  >
                    {answer}
                  </Button>
                ))}
              </div>
            ) : null}
            <DocumentTemplateLink template={field.template} />
            {companion ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium text-black/50">Upload a file</p>
                  <FieldInput
                    field={field}
                    value={values[field.id] || []}
                    documents={documents}
                    setDocuments={setDocuments}
                    disabled={disabled}
                    onFilesReadingChange={onFilesReadingChange}
                    onChange={(value) => onValueChange(field.id, value)}
                  />
                </div>
                <div className="min-w-0">
                  <label
                    htmlFor={`field-${companion.id}`}
                    className="mb-2 block text-xs font-medium text-black/50"
                  >
                    Or paste a shared link
                  </label>
                  <FieldInput
                    field={companion}
                    value={values[companion.id] || []}
                    documents={documents}
                    setDocuments={setDocuments}
                    disabled={disabled}
                    onFilesReadingChange={onFilesReadingChange}
                    onChange={(value) => onValueChange(companion.id, value)}
                  />
                </div>
              </div>
            ) : (
              <>
                {field.type !== 'document' ? (
                  <label className="sr-only" htmlFor={`field-${field.id}`}>
                    {label}
                  </label>
                ) : null}
                <FieldInput
                  field={field}
                  value={values[field.id] || []}
                  documents={documents}
                  setDocuments={setDocuments}
                  disabled={disabled}
                  onFilesReadingChange={onFilesReadingChange}
                  onChange={(value) => onValueChange(field.id, value)}
                />
              </>
            )}
          </>
        )}
        {invalid ? (
          <p className="mt-2 text-xs text-amber-700">Please check this answer's format.</p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={disabled || !answered}
            onClick={() => onAdvance(true)}
            className="rounded-full bg-[#171717] px-5 text-white hover:bg-[#303030]"
          >
            Continue <ArrowRight className="size-4" />
          </Button>
          {!required ? (
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={onDefer}
                className="rounded-full text-black/55"
              >
                I'll add it later
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={disabled}
                onClick={onNotApplicable}
                className="rounded-full text-black/55"
              >
                Not applicable
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
