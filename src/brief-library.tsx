import { useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { Button } from '@monksflow/monks-ui';

export type BriefSummary = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  stage: string;
  route: string;
  brands?: string[];
  dueDate?: string | null;
  projectId?: string;
  published?: boolean;
};

type Status = 'progress' | 'review' | 'published';
type StatusFilter = Status | 'all';

const statusLabels: Record<Status, string> = {
  progress: 'In progress',
  review: 'Ready for review',
  published: 'Published',
};

function statusOf(brief: BriefSummary): Status {
  if (brief.published) return 'published';
  return brief.stage === 'final' ? 'review' : 'progress';
}

function formattedDate(value: string, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' as const } : {}),
  }).format(date);
}

function deliveryDate(value: string) {
  return formattedDate(`${value}T12:00:00`);
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [routeFilter, setRouteFilter] = useState('all');
  const counts = {
    progress: briefs.filter((brief) => statusOf(brief) === 'progress').length,
    review: briefs.filter((brief) => statusOf(brief) === 'review').length,
    published: briefs.filter((brief) => statusOf(brief) === 'published').length,
  };
  const routes = [
    ...new Set(briefs.flatMap((brief) => brief.route.split(', ').filter(Boolean))),
  ].sort();
  const query = search.trim().toLocaleLowerCase();
  const filteredBriefs = briefs.filter((brief) => {
    if (statusFilter !== 'all' && statusOf(brief) !== statusFilter) return false;
    if (routeFilter !== 'all' && !brief.route.split(', ').includes(routeFilter)) return false;
    return (
      !query ||
      [brief.name, brief.projectId, brief.route, ...(brief.brands || [])]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(query))
    );
  });
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const upcoming = briefs
    .filter((brief) => brief.dueDate && brief.dueDate >= today)
    .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
    .slice(0, 4);
  const cards = [
    {
      filter: 'all' as const,
      label: 'Total briefs',
      count: briefs.length,
      icon: FileText,
      hint: 'All saved requests',
    },
    {
      filter: 'progress' as const,
      label: 'In progress',
      count: counts.progress,
      icon: Clock3,
      hint: 'Still being prepared',
    },
    {
      filter: 'review' as const,
      label: 'Ready for review',
      count: counts.review,
      icon: FileText,
      hint: 'At the summary stage',
    },
    {
      filter: 'published' as const,
      label: 'Published',
      count: counts.published,
      icon: CheckCircle2,
      hint: 'Sent to Jira or Drive',
    },
  ];

  return (
    <div className="mx-auto max-w-[1320px]">
      <section className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#eee5fa] px-3 py-1.5 text-[11px] font-bold tracking-[0.12em] text-[#6f35b6]">
            <FileText className="size-3.5" /> SAVED LOCALLY
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Briefs dashboard
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-black/55">
            Track saved requests, review their progress, and open a brief to continue.
          </p>
        </div>
        <Button
          type="button"
          onClick={onCreate}
          className="rounded-full bg-[#171717] px-5 text-white hover:bg-[#303030]"
        >
          <Plus className="size-4" /> New Brief
        </Button>
      </section>

      {loading ? (
        <div className="grid min-h-48 place-items-center rounded-[24px] border border-black/10 bg-white">
          <p className="flex items-center gap-2 text-sm text-black/50">
            <LoaderCircle className="size-4 animate-spin" /> Loading briefs
          </p>
        </div>
      ) : (
        <>
          <section aria-label="Brief overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(({ filter, label, count, icon: Icon, hint }) => (
              <button
                key={filter}
                type="button"
                aria-pressed={statusFilter === filter}
                onClick={() => setStatusFilter(filter)}
                className={`rounded-[22px] border bg-white p-5 text-left shadow-[0_10px_35px_rgba(30,22,12,0.04)] transition-colors hover:border-[#a77ad8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f35b6] ${statusFilter === filter ? 'border-[#a77ad8] ring-1 ring-[#a77ad8]/40' : 'border-black/10'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-black/55">{label}</span>
                  <span className="grid size-9 place-items-center rounded-xl bg-[#f4effa] text-[#6f35b6]">
                    <Icon className="size-4" />
                  </span>
                </div>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{count}</p>
                <p className="mt-2 text-xs text-black/40">{hint}</p>
              </button>
            ))}
          </section>

          {briefs.length ? (
            <>
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                <section className="rounded-[22px] border border-black/10 bg-white p-5 sm:p-6">
                  <h2 className="text-base font-semibold">Briefs by status</h2>
                  <p className="mt-1 text-sm text-black/45">See where your requests stand.</p>
                  <div className="mt-6 grid gap-5">
                    {(['progress', 'review', 'published'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setStatusFilter(status)}
                        className="text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f35b6]"
                      >
                        <span className="mb-2 flex justify-between text-sm">
                          <span>{statusLabels[status]}</span>
                          <span className="font-semibold">{counts[status]}</span>
                        </span>
                        <span className="block h-2.5 overflow-hidden rounded-full bg-black/[0.06]">
                          <span
                            className="block h-full rounded-full bg-[#8d51c7]"
                            style={{ width: `${(counts[status] / briefs.length) * 100}%` }}
                          />
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
                <section className="rounded-[22px] border border-black/10 bg-white p-5 sm:p-6">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-[#6f35b6]" />
                    <h2 className="text-base font-semibold">Upcoming deliveries</h2>
                  </div>
                  <p className="mt-1 text-sm text-black/45">Next expected delivery dates.</p>
                  {upcoming.length ? (
                    <div className="mt-4 divide-y divide-black/10">
                      {upcoming.map((brief) => (
                        <button
                          key={brief.id}
                          type="button"
                          onClick={() => onView(brief.id)}
                          className="flex w-full items-center justify-between gap-4 py-3 text-left hover:text-[#6f35b6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6f35b6]"
                        >
                          <span className="min-w-0 truncate text-sm font-medium">{brief.name}</span>
                          <span className="shrink-0 text-xs text-black/45">
                            {deliveryDate(brief.dueDate!)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-6 text-sm text-black/45">
                      No upcoming delivery dates in saved briefs.
                    </p>
                  )}
                </section>
              </div>

              <section className="mt-8" aria-label="All briefs">
                <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold tracking-[-0.02em]">All briefs</h2>
                    <p className="mt-1 text-sm text-black/45">
                      Showing {filteredBriefs.length} of {briefs.length} briefs
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <label className="relative min-w-0 sm:w-72">
                      <span className="sr-only">Search briefs</span>
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/40" />
                      <input
                        type="search"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search briefs"
                        className="h-10 w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#8d51c7]"
                      />
                    </label>
                    <label>
                      <span className="sr-only">Filter by content type</span>
                      <select
                        value={routeFilter}
                        onChange={(event) => setRouteFilter(event.target.value)}
                        className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#8d51c7] sm:w-48"
                      >
                        <option value="all">All content types</option>
                        {routes.map((route) => (
                          <option key={route} value={route}>
                            {route}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                {filteredBriefs.length ? (
                  <div className="overflow-hidden rounded-[22px] border border-black/10 bg-white shadow-[0_10px_35px_rgba(30,22,12,0.04)]">
                    {filteredBriefs.map((brief) => {
                      const status = statusOf(brief);
                      return (
                        <article
                          key={brief.id}
                          className="flex flex-col gap-4 border-b border-black/[0.07] p-4 last:border-b-0 sm:p-5 xl:flex-row xl:items-center xl:justify-between"
                        >
                          <div className="min-w-0 xl:flex-1">
                            <h3 className="[overflow-wrap:anywhere] text-sm font-semibold sm:text-base">
                              {brief.name}
                            </h3>
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-black/45">
                              {brief.projectId ? <span>{brief.projectId}</span> : null}
                              {brief.brands?.length ? <span>{brief.brands.join(', ')}</span> : null}
                              <span>Updated {formattedDate(brief.updatedAt, true)}</span>
                              {brief.dueDate ? (
                                <span>Due {deliveryDate(brief.dueDate)}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                            {brief.route ? (
                              <span className="rounded-full bg-[#f5f2ed] px-2.5 py-1 text-xs font-medium text-black/60">
                                {brief.route}
                              </span>
                            ) : null}
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'published' ? 'bg-[#e8f7ed] text-[#147a3f]' : status === 'review' ? 'bg-[#eee5fa] text-[#6f35b6]' : 'bg-[#f3ebdc] text-[#795523]'}`}
                            >
                              {statusLabels[status]}
                            </span>
                            <Button type="button" size="sm" onClick={() => onView(brief.id)}>
                              <ArrowRight className="size-3.5" /> Open
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Delete ${brief.name}`}
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
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[22px] border border-dashed border-black/15 bg-white px-6 py-10 text-center text-sm text-black/55">
                    No briefs match these filters.
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('all');
                        setSearch('');
                        setRouteFilter('all');
                      }}
                      className="ml-2 font-semibold text-[#6f35b6] underline underline-offset-2"
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="mt-5 rounded-[24px] border border-dashed border-black/15 bg-white/65 px-6 py-14 text-center">
              <div className="mx-auto grid size-11 place-items-center rounded-full bg-[#eee5fa] text-[#6f35b6]">
                <FileText className="size-5" />
              </div>
              <h2 className="mt-4 text-base font-semibold">No saved briefs yet</h2>
              <p className="mt-2 text-sm text-black/45">
                Save a brief at any point to create its local project.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
