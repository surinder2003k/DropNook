import type { ReactNode } from "react";
import Link from "next/link";
import { LogoIcon } from "./icons";

/**
 * LegalPage — shared chrome for About / Privacy / Terms / Disclaimer / Contact.
 * Keeps the dropzone.sh monochrome look and a single "back home" affordance so
 * every policy page feels like part of the same site (an AdSense requirement:
 * reviewers expect a real, navigable site, not orphaned legal text).
 */
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-ambient flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-[#0a0a0a]/80">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
              <LogoIcon className="h-4.5 w-4.5" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Dropzone
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← Back to upload
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {title}
        </h1>
        {updated && (
          <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            Last updated {updated}
          </p>
        )}
        <div className="mt-8 space-y-5 text-sm leading-7 text-zinc-600 [&_a]:text-zinc-900 [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-zinc-900 [&_strong]:font-semibold [&_strong]:text-zinc-800 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 dark:text-zinc-400 dark:[&_a]:text-zinc-100 dark:[&_h2]:text-zinc-100 dark:[&_strong]:text-zinc-200">
          {children}
        </div>
      </main>

      <footer className="border-t border-zinc-200 py-6 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-5 text-xs text-zinc-500 dark:text-zinc-500">
          <Link href="/about" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">About</Link>
          <Link href="/privacy" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">Privacy</Link>
          <Link href="/terms" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">Terms</Link>
          <Link href="/disclaimer" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">Disclaimer</Link>
          <Link href="/contact" className="transition hover:text-zinc-900 dark:hover:text-zinc-200">Contact</Link>
        </div>
      </footer>
    </div>
  );
}
