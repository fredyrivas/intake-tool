import { ExternalLink, FileDown } from 'lucide-react';
import { fields, type Field } from '../shared/brief-contract';

export function DocumentTemplateLink({ template }: Pick<Field, 'template'>) {
  if (!template) return null;

  return (
    <div className="mb-3 flex items-start gap-3 rounded-xl border border-[#8e54d7]/20 bg-[#faf7ff] p-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-[#eee5fa] text-[#6f35b6]">
        <FileDown className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs leading-5 text-black/55">
          Start with the provided template, complete it, then upload the finished file here.
        </p>
        <a
          href={template.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-[#6f35b6] underline decoration-[#8e54d7]/35 underline-offset-4 hover:text-[#562493]"
        >
          Open {template.label}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

const optionalDocumentTemplates = ['assetMatrix', 'creativeDirection']
  .map((fieldId) => fields.find((field) => field.id === fieldId)?.template)
  .filter((template): template is NonNullable<Field['template']> => Boolean(template));

export function OptionalDocumentGuidance({
  variant,
}: {
  variant: 'initial' | 'enrich';
}) {
  const isInitial = variant === 'initial';
  return (
    <div
      className={`rounded-2xl border border-[#8e54d7]/25 bg-[#faf7ff] ${isInitial ? 'p-4 sm:p-5' : 'p-4'}`}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eee5fa] text-[#6f35b6]">
          <FileDown className="size-4" />
        </span>
        <div className="min-w-0">
          <p
            className={`font-semibold tracking-[-0.01em] text-[#222] ${isInitial ? 'text-base sm:text-lg' : 'text-sm'}`}
          >
            {isInitial
              ? 'Upload your Asset Matrix and Creative Direction'
              : 'Enrich this path with Asset Matrix and Creative Direction'}
          </p>
          <p className={`text-black/55 ${isInitial ? 'mt-1 text-sm leading-6' : 'mt-1 text-xs leading-5'}`}>
            {isInitial
              ? 'Upload completed versions of these documents here so we can use them from the start.'
              : 'Upload completed versions to add the key creative and adaptation context to this path.'}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
        {optionalDocumentTemplates.map((template) => (
          <a
            key={template.label}
            href={template.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center text-sm font-semibold text-[#6f35b6] underline decoration-[#8e54d7]/35 underline-offset-4 hover:text-[#562493]"
          >
            Download {template.label}
            <ExternalLink className="ml-1.5 size-3.5" aria-hidden="true" />
          </a>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-4 text-black/45">
        Optional — download, complete and upload the templates now, or continue and add them later.
      </p>
    </div>
  );
}
