"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  LockIcon,
  QrIcon,
  XIcon,
} from "./icons";
import { formatBytes } from "@/lib/format";

/**
 * ShareModal — shown after an upload (or from a file row's share button).
 *
 * Displays the shareable `/s/<slug>` link with:
 * - a scannable QR code (rendered client-side via the `qrcode` package)
 * - one-click copy
 * - badges for expiry / password / download limit set at upload time
 */
export type ShareFile = {
  id: string;
  filename: string;
  size_bytes: number;
  slug?: string | null;
  expires_at?: string | null;
  max_downloads?: number | null;
  download_count?: number | null;
};

type Props = {
  file: ShareFile | null;
  /** True when the uploader protected this file with a password. */
  hasPassword?: boolean;
  onClose: () => void;
};

function shareUrlFor(file: ShareFile): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://dropnook.vercel.app";
  return file.slug ? `${origin}/s/${file.slug}` : `${origin}/api/files/${file.id}`;
}

export default function ShareModal({ file, hasPassword, onClose }: Props) {
  // QR payload is stored together with the URL it was generated for, so a
  // stale code from the previously opened file can never flash on screen.
  const [qr, setQr] = useState<{ url: string; dataUrl: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  // "Now" captured when the modal opens — keeps render pure (no Date.now()).
  const [openedAt, setOpenedAt] = useState(0);

  const url = file ? shareUrlFor(file) : null;

  // Capture the clock once per opened file, deferred out of the effect body
  // (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!file) return;
    queueMicrotask(() => setOpenedAt(Date.now()));
  }, [file]);

  // Render the QR code whenever the target file changes.
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    QRCode.toDataURL(url, {
      width: 224,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#18181b", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (!cancelled) setQr({ url, dataUrl });
      })
      .catch(() => {
        if (!cancelled) setQr({ url, dataUrl: null });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Close on Escape.
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, onClose]);

  if (!file || !url) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — select the input so the user can copy manually.
      const input = document.getElementById("share-link-input") as HTMLInputElement | null;
      input?.select();
    }
  };

  const expired =
    !!file.expires_at &&
    openedAt > 0 &&
    new Date(file.expires_at).getTime() < openedAt;
  // Only show the QR once it matches the currently displayed URL.
  const qrDataUrl = qr && qr.url === url ? qr.dataUrl : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="animate-pop-in w-full max-w-md rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="share-modal-title"
              className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
            >
              <QrIcon className="h-5 w-5 text-indigo-500" />
              Share your file
            </h2>
            <p
              className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400"
              title={file.filename}
            >
              {file.filename} · {formatBytes(file.size_bytes)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* QR code */}
        <div className="mt-5 flex justify-center">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- QR is generated at runtime as a data URL
            <img
              src={qrDataUrl}
              alt={`QR code for ${file.filename}`}
              width={224}
              height={224}
              className="rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-700"
            />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-xs text-zinc-400 dark:border-zinc-600">
              Generating QR…
            </div>
          )}
        </div>

        {/* Link + copy */}
        <div className="mt-5 flex items-center gap-2">
          <input
            id="share-link-input"
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 outline-none focus:border-indigo-400 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300"
            aria-label="Share link"
          />
          <button
            onClick={() => void copy()}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-medium text-white transition ${
              copied
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {/* Share-rule badges */}
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400">
            {file.download_count ?? 0} download{(file.download_count ?? 0) === 1 ? "" : "s"}
            {file.max_downloads != null ? ` of ${file.max_downloads}` : ""}
          </span>
          {file.expires_at && (
            <span
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                expired
                  ? "border-rose-200 bg-rose-50 text-rose-600 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
                  : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400"
              }`}
            >
              <ClockIcon className="h-3.5 w-3.5" />
              {expired ? "Expired" : `Expires ${new Date(file.expires_at).toLocaleString()}`}
            </span>
          )}
          {hasPassword && (
            <span className="flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400">
              <LockIcon className="h-3.5 w-3.5" />
              Password protected
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-2">
          <a
            href={`/s/${file.slug ?? file.id}`}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            <DownloadIcon className="h-4 w-4" />
            Open download page
          </a>
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

