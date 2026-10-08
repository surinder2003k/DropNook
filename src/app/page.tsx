import Dropzone from "@/components/Dropzone";
import { LogoIcon } from "@/components/icons";

// Evaluated once at module load (outside the render phase) so static
// prerendering stays deterministic — Next 16 blocks `new Date()` in render.
const YEAR = new Date().getFullYear();

export default function Home() {
  return (
    <div className="bg-ambient min-h-screen">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/70 backdrop-blur-md dark:border-zinc-800/70 dark:bg-zinc-950/70">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm shadow-indigo-500/30">
              <LogoIcon className="h-4.5 w-4.5" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Drop
              <span className="text-indigo-600 dark:text-indigo-400">Nook</span>
            </span>
          </div>
          <span className="hidden text-xs text-zinc-400 dark:text-zinc-500 sm:block">
            Free · No sign-up · 25 MB per file
          </span>
        </div>
      </header>

      {/* ---------- Main ---------- */}
      <main className="mx-auto w-full max-w-3xl px-5 pb-24 pt-14">
        <div className="animate-fade-up mb-10 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/70 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Storage connected · ready to receive
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl dark:text-zinc-50">
            Share files.
            <br className="sm:hidden" />{" "}
            <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
              No account needed.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-zinc-500 dark:text-zinc-400">
            DropNook lets you drop any file — documents, photos, videos,
            archives — and get a shareable link in seconds. Powered by Supabase
            Storage.
          </p>
        </div>

        <div className="animate-fade-up" style={{ animationDelay: "0.12s" }}>
          <Dropzone />
        </div>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-zinc-200/70 py-6 dark:border-zinc-800/70">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-2 px-5 text-xs text-zinc-400 sm:flex-row dark:text-zinc-500">
          <span>© {YEAR} DropNook</span>
          <span>
            Files live in Supabase Storage · Region{" "}
            <span className="font-mono">ap-south-1</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
