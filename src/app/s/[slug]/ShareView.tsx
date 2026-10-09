"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertIcon,
  ClockIcon,
  DownloadIcon,
  FileIcon,
  LinkIcon,
  LockIcon,
  SpinnerIcon,
} from "@/components/icons";
import { formatBytes } from "@/lib/format";

type ShareMeta = {
  filename: string;
  mime_type: string;
  size_bytes: number;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  has_password: boolean;
};

/**
 * Public share view — `/s/<slug>` (client half).
 *
 * No auth: anyone holding the link can download while the share rules
 * (password, expiry, max downloads) hold. All rules are enforced server-side
 * in /api/share/[slug]; this page just surfaces them. The slug arrives as a
 * prop from the server page wrapper so the prerenderer never needs
 * useParams() outside a Suspense boundary (Next 16 requirement).
 */
export default function ShareView({ slug }: { slug: string }) {
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [status, setStatus] = useState<
    "loading" | "ready" | "expired" | "exhausted" | "notfound" | "error"
  >("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 410) {
        setStatus(body.exhausted ? "exhausted" : "expired");
        return;
      }
      if (res.status === 404) {
        setStatus("notfound");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setErrorMessage(body.error || `Lookup failed (${res.status})`);
        return;
      }
      setMeta(body as ShareMeta);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Network error");
    }
  }, [slug]);

  useEffect(() => {
    // Deferred out of the synchronous effect body (react-hooks/set-state-in-effect)
    // — load() only sets state after its network await resolves.
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const download = async () => {
    if (!meta || downloading) return;
    setDownloading(true);
    setPwError("");
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setPwError(body.error || "Incorrect password");
        return;
      }
      if (res.status === 410) {
        setStatus(body.exhausted ? "exhausted" : "expired");
        return;
      }
      if (!res.ok || !body.download_url) {
        setPwError(body.error || `Download failed (${res.status})`);
        return;
      }
      // Browser follows the signed URL straight to the storage bytes.
      window.location.href = body.download_url;
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Network error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-12">
      <header className="mb-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-indigo-500">
          DropNook
        </p>
      </header>

      <section className="rounded-3xl border border-zinc-200/80 bg-white p-7 shadow-[0_16px_48px_-24px_rgba(24,24,27,0.25)] dark:border-zinc-800 dark:bg-zinc-900/70">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10 text-zinc-400">
            <SpinnerIcon className="h-7 w-7 animate-spin text-indigo-500" />
            <p className="text-sm">Loading shared file...</p>
          </div>
        )}

        {status === "notfound" && (
          <EmptyState
            title="Link not found"
            body="This share link doesn't exist - double-check the URL you were given."
          />
        )}

        {status === "expired" && (
          <EmptyState
            title="This link has expired"
            body="The sender set an expiry date on this file and it has passed. Ask them for a fresh link."
          />
        )}

        {status === "exhausted" && (
          <EmptyState
            title="Download limit reached"
            body="The sender limited how many times this file can be downloaded, and the limit has been reached."
          />
        )}

        {status === "error" && (
          <EmptyState
            title="Something went wrong"
            body={errorMessage || "Please try again in a moment."}
          />
        )}

        {status === "ready" && meta && (
          <>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25">
                <FileIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1
                  className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-100"
                  title={meta.filename}
                >
                  {meta.filename}
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {formatBytes(meta.size_bytes)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400">
                {meta.download_count} download{meta.download_count === 1 ? "" : "s"}
                {meta.max_downloads != null ? ` of ${meta.max_downloads}` : ""}
              </span>
              {meta.expires_at && (
                <span className="flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400">
                  <ClockIcon className="h-3.5 w-3.5" />
                  Expires {new Date(meta.expires_at).toLocaleString()}
                </span>
              )}
              {meta.has_password && (
                <span className="flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400">
                  <LockIcon className="h-3.5 w-3.5" />
                  Password required
                </span>
              )}
            </div>

            {meta.has_password && (
              <div className="mt-5">
                <label
                  htmlFor="share-password"
                  className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Enter password to unlock
                </label>
                <input
                  id="share-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void download();
                  }}
                  placeholder="Password"
                  autoFocus
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
                />
              </div>
            )}

            {pwError && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-rose-500">
                <AlertIcon className="h-4 w-4 shrink-0" />
                {pwError}
              </p>
            )}

            <button
              onClick={() => void download()}
              disabled={downloading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:opacity-90 disabled:opacity-60"
            >
              {downloading ? (
                <SpinnerIcon className="h-4 w-4 animate-spin" />
              ) : (
                <DownloadIcon className="h-4 w-4" />
              )}
              {downloading ? "Preparing..." : "Download"}
            </button>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-zinc-400 dark:text-zinc-500">
              <LinkIcon className="h-3.5 w-3.5" />
              Shared via DropNook - no account needed
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      <AlertIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</p>
      <p className="max-w-xs text-sm text-zinc-500 dark:text-zinc-400">{body}</p>
    </div>
  );
}

