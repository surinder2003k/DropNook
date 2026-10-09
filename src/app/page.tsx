import Dropzone from "@/components/Dropzone";
import StorageBar from "@/components/StorageBar";
import ThemeToggle from "@/components/ThemeToggle";
import { LogoIcon } from "@/components/icons";
import { softwareLd, faqLd, breadcrumbLd } from "@/lib/structured-data";
import Link from "next/link";

// Evaluated once at module load (outside the render phase) so static
// prerendering stays deterministic — Next 16 blocks `new Date()` in render.
const YEAR = new Date().getFullYear();

const LEGAL_LINKS = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/disclaimer", label: "Disclaimer" },
];

export default function Home() {
  return (
    <div className="bg-ambient flex min-h-screen flex-col">
      {/* ---------- Header ---------- */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-[#0a0a0a]/80">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
              <LogoIcon className="h-4.5 w-4.5" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Dropzone
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="hidden text-xs text-zinc-500 dark:text-zinc-400 sm:block">
              Free · No sign-up · 5 GB per file
            </span>
            <ThemeToggle />
          </div>
        </div>
        <StorageBar />
      </header>

      {/* ---------- Main ---------- */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16 pt-14 sm:pt-20">
        <div className="animate-fade-up text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
            Share files securely.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-7 text-zinc-500 dark:text-zinc-400">
            Send files that disappear once accessed. Upload, get a single-use
            link, share it — no account needed.
          </p>
        </div>

        <div
          className="animate-fade-up mt-10"
          style={{ animationDelay: "0.12s" }}
        >
          <Dropzone />
        </div>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-zinc-200 py-8 dark:border-zinc-800">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-5">
          {/* Legal / trust links — required surfaces for AdSense approval. */}
          <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-zinc-500 sm:justify-start dark:text-zinc-400">
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="transition hover:text-zinc-800 dark:hover:text-zinc-200"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col items-center justify-between gap-2 text-xs text-zinc-500 sm:flex-row dark:text-zinc-500">
            <span>© {YEAR} Dropzone</span>
            <span>
              Files live in Backblaze B2 · Region{" "}
              <span className="font-mono">us-east-005</span>
            </span>
          </div>
        </div>
      </footer>

      {/* Home-page structured data: product + FAQ + breadcrumbs. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([softwareLd(), faqLd(), breadcrumbLd()]),
        }}
      />
    </div>
  );
}
