import { Eye, FileText, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@monksflow/monks-ui';

export type BriefSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stage: string;
  route: string;
  projectId?: string;
  published?: boolean;
};

function formattedDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function BriefLibrary({
  briefs,
  loading,
  deletingId,
  onCreate,
  onView,
  onDelete,
}: {
  briefs: BriefSummary[];
  loading: boolean;
  deletingId: string | null;
  onCreate: () => void;
  onView: (id: string) => void;
  onDelete: (brief: BriefSummary) => void;
}) {
  return (
    <div className="mx-auto max-w-[1020px]">
      <section className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#eee5fa] px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] text-[#6f35b6]">
            <FileText className="size-3.5" /> SAVED LOCALLY
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Briefs</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-black/55">
            Open a saved brief to review it and edit individual details. These projects live on this
            machine.
          </p>
        </div>
        <Button
          type="button"
          onClick={onCreate}
          className="rounded-full bg-[#171717] px-5 text-white hover:bg-[#303030]"
        >
          <Plus className="size-4" /> New brief
        </Button>
      </section>

      {loading ? (
        <div className="grid min-h-48 place-items-center rounded-[24px] border border-black/10 bg-white">
          <p className="flex items-center gap-2 text-sm text-black/50">
            <LoaderCircle className="size-4 animate-spin" /> Loading briefs
          </p>
        </div>
      ) : briefs.length ? (
        <div className="grid gap-3">
          {briefs.map((brief) => (
            <article
              key={brief.id}
              className="flex flex-col gap-4 rounded-[22px] border border-black/10 bg-white p-5 shadow-[0_10px_35px_rgba(30,22,12,0.04)] sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <h2 className="[overflow-wrap:anywhere] text-base font-semibold">
                  {brief.name}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-black/45">
                  {brief.route ? (
                    <span className="rounded-full bg-[#f1e9fa] px-2.5 py-1 font-semibold text-[#6f35b6]">
                      {brief.route}
                    </span>
                  ) : null}
                  <span>Updated {formattedDate(brief.updatedAt)}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => onView(brief.id)}>
                  <Eye className="size-3.5" /> View summary
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={deletingId === brief.id}
                  onClick={() => onDelete(brief)}
                  className="text-red-700 hover:bg-red-50 hover:text-red-800"
                >
                  {deletingId === brief.id ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Delete
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-dashed border-black/15 bg-white/65 px-6 py-14 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-full bg-[#eee5fa] text-[#6f35b6]">
            <FileText className="size-5" />
          </div>
          <h2 className="mt-4 text-base font-semibold">No saved briefs yet</h2>
          <p className="mt-2 text-sm text-black/45">
            Save a brief at any point to create its local project.
          </p>
        </div>
      )}
    </div>
  );
}
