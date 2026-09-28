import { ArrowRight, FolderOpen } from 'lucide-react';

export function Home() {
  return (
    <div className="intent-shell min-h-screen text-[#171717]">
      <header className="border-b border-black/10 bg-white/85">
        <div className="mx-auto flex h-[60px] max-w-[1400px] items-center gap-3 px-5 sm:px-8">
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
      </header>

      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="mb-5 text-xs font-bold tracking-[0.13em] text-[#6f35b6]">
          SCJ BRIEF INTAKE
        </p>
        <h1 className="text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl">
          Welcome to the SCJ Brief Intake Tool
        </h1>
        <p className="mt-6 text-lg leading-8 text-black/60">
          Turn your project needs into a clear, structured brief. Describe your request, add
          supporting documents, and let the brief assistant guide you through the details.
        </p>
        <p className="mt-4 text-base leading-7 text-black/55">
          Start a new brief to define your scope, deliverables, and timelines, or visit the briefs
          dashboard to review and manage your saved briefs.
        </p>
        <div className="mt-9 flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-6">
          <a
            href="/intent?new=1"
            className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#303030] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6f35b6]"
          >
            New Brief <ArrowRight aria-hidden="true" className="size-4" />
          </a>
          <a
            href="/briefs"
            className="inline-flex items-center gap-2 rounded-sm text-sm font-medium text-[#6f35b6] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6f35b6]"
          >
            <FolderOpen aria-hidden="true" className="size-4" /> View briefs dashboard
          </a>
        </div>
      </main>
    </div>
  );
}
