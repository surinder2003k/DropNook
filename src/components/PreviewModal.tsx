"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertIcon,
  DownloadIcon,
  FileIcon,
  SpinnerIcon,
  XIcon,
} from "./icons";
import { formatBytes } from "@/lib/format";

export type PreviewFile = {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number;
};

type PreviewKind = "image" | "video" | "audio" | "pdf" | "text";
type State =
  | { status: "loading" }
  | {
      status: "ready";
      kind: PreviewKind;
      url?: string;
      text?: string;
      truncated?: boolean;
    }
  | { status: "none" }
  | { status: "error"; message: string };

/**
 * PreviewModal — in-page lightbox for a stored file.
 *
 * Fetches /api/files/[id]/preview (share rules enforced server-side, download
 * counter untouched) and renders image / video / audio / PDF inline, or text
 * in a scrollable <pre>. Non-previewable types fall back to a download prompt.
 */
export default function PreviewModal({
  file,
  onClose,
}: {
  file: PreviewFile | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    if (!file) return;
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/files/${file.id}/preview`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 415) {
        setState({ status: "none" });
        return;
      }
      if (!res.ok) {
        setState({ status: "error", message: body.error || `Preview failed (${res.status})` });
        return;
      }
      setState({
        status: "ready",
        kind: body.kind,
        url: body.url,
        text: body.text,
        truncated: body.truncated,
      });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Network error" });
    }
  }, [file]);

  useEffect(() => {
    // Deferred out of the synchronous effect body (react-hooks/set-state-in-effect)
    // — load() only sets state after its network await resolves.
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  // Close on Escape.
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [file, onClose]);

  if (!file) return null;

  const renderBody = () => {
    if (state.status === "loading") {
      return (
        <div className="flex h-64 items-center justify-center text-zinc-400">
          <SpinnerIcon className="h-6 w-6 animate-spin" />
        </div>
      );
    }
    if (state.status === "none") {
      return (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
          <FileIcon className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            This file type can&apos;t be previewed. Download it to open.
          </p>
        </div>
      );
    }
    if (state.status === "error") {
      return (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
          <AlertIcon className="h-8 w-8 text-rose-400" />
          <p className="text-sm text-rose-500">{state.message}</p>
        </div>
      );
    }

    switch (state.kind) {
      case "image":
        return (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded images render fine via a plain img
          <img
            src={state.url}
            alt={file.filename}
            className="mx-auto max-h-[65vh] max-w-full rounded-xl object-contain"
          />
        );
      case "video":
        return (
          <video
            src={state.url}
            controls
            className="mx-auto max-h-[65vh] max-w-full rounded-xl"
          />
        );
      case "audio":
        return (
          <div className="flex flex-col items-center gap-3 py-6">
            <FileIcon className="h-12 w-12 text-indigo-400" />
            <audio src={state.url} controls className="w-full max-w-md" />
          </div>
        );
      case "pdf":
        return (
          <iframe
            src={state.url}
            title={file.filename}
            className="h-[65vh] w-full rounded-xl border border-zinc-200 dark:border-zinc-700"
          />
        );
      case "text":
        return (
          <div className="relative">
            <pre className="max-h-[65vh] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              {state.text}
            </pre>
            {state.truncated && (
              <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">
                Showing the first 64 KB — download to view the full file.
              </p>
            )}
          </div>
        );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${file.filename}`}
        onClick={(e) => e.stopPropagation()}
        className="animate-pop-in flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {file.filename}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
              {formatBytes(file.size_bytes)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">{renderBody()}</div>

        <div className="mt-4 flex justify-end">
          <a
            href={`/api/files/${file.id}`}
            download={file.filename}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <DownloadIcon className="h-4 w-4" />
            Download
          </a>
        </div>
      </div>
    </div>
  );
}

