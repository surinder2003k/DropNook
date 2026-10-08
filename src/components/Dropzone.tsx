"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertIcon,
  CheckIcon,
  CloudUploadIcon,
  DownloadIcon,
  InboxIcon,
  LinkIcon,
  SpinnerIcon,
  TrashIcon,
  XIcon,
  fileGlyph,
} from "./icons";
import { formatBytes } from "@/lib/format";
import { STORAGE_REFRESH_EVENT } from "./StorageBar";

const MAX_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB single-PUT ceiling

type UploadedFile = {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number;
  uploaded_at: string;
};

type QueueItem = {
  localId: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_DROPNOOK_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_DROPNOOK_SUPABASE_ANON_KEY!;
const STORAGE_BUCKET = "uploads";

/**
 * Three-step direct-to-storage upload (B2 backend live):
 * 1. POST /api/upload  → presigned B2 PUT url (tiny JSON request)
 * 2. PUT bytes straight to Backblaze B2 (us-east-005, bucket dropnook-files)
 *    via presigned S3 URL (XHR, real progress, 15-min expiry)
 * 3. POST /api/files   → verify bytes via HeadObject + record metadata row
 *
 * Going direct matters: Vercel serverless functions cap request bodies at
 * 4.5 MB, so proxying a multi-GB file through an API route would fail.
 * S3/B2 single PUT caps at 5 GB — bigger files need multipart (Phase 2).
 */
function uploadFile(
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ id: string }> {
  return (async () => {
    // --- step 1: get a signed upload token -------------------------------
    const signRes = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        size: file.size,
        mime_type: file.type,
      }),
    });
    const sign = await signRes.json().catch(() => ({}));
    const isB2 = sign.backend === "b2";
    if (!signRes.ok || !sign.path || (isB2 ? !sign.signedUrl : !sign.token)) {
      throw new Error(sign.error || `Sign request failed (${signRes.status})`);
    }

    // --- step 2: stream the bytes straight to B2 via the presigned URL ---
    await new Promise<void>((resolve, reject) => {
      const putUrl = isB2
        ? sign.signedUrl
        : `${SUPABASE_URL}/storage/v1/object/upload/sign/${STORAGE_BUCKET}/${sign.path}?token=${encodeURIComponent(sign.token)}`;
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", putUrl);
      if (!isB2) {
        xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
        xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_ANON_KEY}`);
        xhr.setRequestHeader("x-upsert", "false");
      }
      xhr.setRequestHeader(
        "content-type",
        file.type || "application/octet-stream",
      );
      xhr.setRequestHeader("cache-control", "3600");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          let message = `Storage upload failed (${xhr.status})`;
          try {
            const body = JSON.parse(xhr.responseText || "{}");
            if (body.message || body.error) {
              message = `${body.message || body.error} (${xhr.status})`;
            }
          } catch {
            /* keep default message */
          }
          reject(new Error(message));
        }
      };
      xhr.onerror = () =>
        reject(new Error("Network error — check your connection"));
      xhr.onabort = () => reject(new Error("Upload cancelled"));
      xhr.send(file);
    });

    // --- step 3: confirm the metadata ------------------------------------
    const confirmRes = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: sign.path,
        filename: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      }),
    });
    const confirmBody = await confirmRes.json().catch(() => ({}));
    if (!confirmRes.ok || !confirmBody.file?.id) {
      throw new Error(confirmBody.error || `Confirm failed (${confirmRes.status})`);
    }

    onProgress(100);
    return { id: confirmBody.file.id as string };
  })();
}


export default function Dropzone() {
  const [dragActive, setDragActive] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBanner = useCallback((msg: string) => {
    setBanner(msg);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 4000);
  }, []);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch("/api/files", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load files");
      setFiles(body.files ?? []);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    // Deferred out of the synchronous effect body (react-hooks/set-state-in-effect)
    // — refreshList only sets state after its network await resolves.
    queueMicrotask(() => {
      void refreshList();
    });
  }, [refreshList]);

  const handleFiles = useCallback(
    async (selected: FileList | File[]) => {
      const incoming = Array.from(selected);
      if (incoming.length === 0) return;

      const accepted: File[] = [];
      for (const f of incoming) {
        if (f.size > MAX_SIZE_BYTES) {
          showBanner(
            `"${f.name}" is ${formatBytes(f.size)} — the limit is 5 GB per file.`,
          );
        } else {
          accepted.push(f);
        }
      }
      if (accepted.length === 0) return;

      const items: QueueItem[] = accepted.map((f) => ({
        localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: f.name,
        size: f.size,
        progress: 0,
        status: "uploading" as const,
      }));
      setQueue((q) => [...q, ...items]);

      const results = await Promise.allSettled(
        accepted.map((file, i) =>
          uploadFile(file, (pct) =>
            setQueue((q) =>
              q.map((it) =>
                it.localId === items[i].localId ? { ...it, progress: pct } : it,
              ),
            ),
          ),
        ),
      );

      let succeeded = 0;
      results.forEach((result, i) => {
        const localId = items[i].localId;
        if (result.status === "fulfilled") {
          succeeded++;
          setQueue((q) =>
            q.map((it) =>
              it.localId === localId ? { ...it, status: "done", progress: 100 } : it,
            ),
          );
        } else {
          const message =
            result.reason instanceof Error ? result.reason.message : "Upload failed";
          setQueue((q) =>
            q.map((it) =>
              it.localId === localId ? { ...it, status: "error", error: message } : it,
            ),
          );
          showBanner(`${items[i].name}: ${message}`);
        }
      });

      if (succeeded > 0) {
        await refreshList();
        window.dispatchEvent(new Event(STORAGE_REFRESH_EVENT));
        setTimeout(() => {
          const doneIds = new Set(
            items
              .filter((_, i) => results[i].status === "fulfilled")
              .map((it) => it.localId),
          );
          setQueue((q) => q.filter((it) => !doneIds.has(it.localId)));
        }, 2500);
      }
    },
    [refreshList, showBanner],
  );

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragActive(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  };

  const copyLink = async (file: UploadedFile) => {
    const url = `${window.location.origin}/api/files/${file.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId((cur) => (cur === file.id ? null : cur)), 1800);
    } catch {
      showBanner("Copy failed — your browser blocked clipboard access.");
    }
  };

  const deleteFile = async (file: UploadedFile) => {
    try {
      const res = await fetch(`/api/files/${file.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) throw new Error(body.error || "Delete failed");
      setFiles((f) => f.filter((x) => x.id !== file.id));
      window.dispatchEvent(new Event(STORAGE_REFRESH_EVENT));
      showBanner(`Deleted "${file.filename}".`);
    } catch (err) {
      showBanner(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const totalSize = files.reduce((sum, f) => sum + (f.size_bytes || 0), 0);

  return (
    <div className="flex flex-col gap-8">
      {banner && (
        <div
          role="status"
          className="animate-pop-in flex items-start gap-2.5 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1 break-words">{banner}</span>
          <button
            onClick={() => setBanner(null)}
            aria-label="Dismiss"
            className="rounded p-0.5 opacity-60 transition hover:opacity-100"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`group relative overflow-hidden rounded-3xl border-2 border-dashed bg-white/80 p-10 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_48px_-24px_rgba(24,24,27,0.25)] backdrop-blur transition-all duration-200 dark:bg-zinc-900/70 ${
          dragActive
            ? "scale-[1.01] border-indigo-500 bg-indigo-50/80 shadow-[0_0_0_6px_rgba(99,102,241,0.12)] dark:bg-indigo-500/10"
            : "border-zinc-300 hover:border-indigo-400 hover:bg-white dark:border-zinc-700 dark:hover:border-indigo-500 dark:hover:bg-zinc-900"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="flex flex-col items-center gap-4">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-colors ${
              dragActive
                ? "bg-indigo-600 text-white"
                : "bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25"
            }`}
          >
            <CloudUploadIcon className="h-8 w-8" />
          </div>

          <div>
            <p className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {dragActive ? "Release to upload" : "Drag & drop your files here"}
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              or{" "}
              <button
                onClick={() => inputRef.current?.click()}
                className="font-medium text-indigo-600 underline-offset-2 transition hover:text-indigo-500 hover:underline dark:text-indigo-400"
              >
                browse from your device
              </button>
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 dark:border-zinc-700 dark:bg-zinc-800/60">
              Any file type
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 dark:border-zinc-700 dark:bg-zinc-800/60">
              Up to 5 GB each
            </span>
            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 dark:border-zinc-700 dark:bg-zinc-800/60">
              No sign-up needed
            </span>
          </div>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="animate-pop-in rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Uploading
          </p>
          <ul className="flex flex-col gap-3">
            {queue.map((item) => (
              <li key={item.localId} className="px-1">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-800 dark:text-zinc-200">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-400">
                    {formatBytes(item.size)}
                  </span>
                  <span className="w-6 shrink-0 text-right">
                    {item.status === "uploading" && (
                      <SpinnerIcon className="h-4 w-4 animate-spin text-indigo-500" />
                    )}
                    {item.status === "done" && (
                      <CheckIcon className="h-4 w-4 text-emerald-500" />
                    )}
                    {item.status === "error" && (
                      <XIcon className="h-4 w-4 text-rose-500" />
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      item.status === "error"
                        ? "bg-rose-500"
                        : item.status === "done"
                          ? "bg-emerald-500"
                          : "bg-gradient-to-r from-indigo-500 to-violet-500"
                    }`}
                    style={{
                      width: `${item.status === "error" ? 100 : item.progress}%`,
                    }}
                  />
                </div>
                {item.error && (
                  <p className="mt-1 text-xs text-rose-500">{item.error}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section aria-labelledby="files-heading">
        <div className="mb-4 flex items-baseline justify-between px-1">
          <h2
            id="files-heading"
            className="text-sm font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
          >
            Your files
          </h2>
          {!listLoading && !listError && files.length > 0 && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {files.length} file{files.length === 1 ? "" : "s"} ·{" "}
              {formatBytes(totalSize)} total
            </span>
          )}
        </div>

        {listLoading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="animate-shimmer h-16 rounded-2xl border border-zinc-200/70 bg-gradient-to-r from-zinc-100 via-zinc-200/70 to-zinc-100 dark:border-zinc-800 dark:from-zinc-900 dark:via-zinc-800 dark:to-zinc-900"
              />
            ))}
          </div>
        )}

        {listError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <p className="font-medium">Couldn&apos;t load your files.</p>
            <p className="mt-1 opacity-80">{listError}</p>
            <button
              onClick={() => {
                setListLoading(true);
                void refreshList();
              }}
              className="mt-3 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500"
            >
              Try again
            </button>
          </div>
        )}

        {!listLoading && !listError && files.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white/60 px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
            <InboxIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Nothing here yet
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500">
              Files you upload will show up in this list.
            </p>
          </div>
        )}

        {!listLoading && !listError && files.length > 0 && (
          <ul className="stagger flex flex-col gap-3">
            {files.map((file) => {
              const Glyph = fileGlyph(file.mime_type, file.filename);
              const isConfirming = confirmDeleteId === file.id;
              const isCopied = copiedId === file.id;
              return (
                <li
                  key={file.id}
                  className="group flex items-center gap-4 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm transition hover:border-zinc-300 hover:shadow dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-700"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-500 transition group-hover:from-indigo-50 group-hover:to-indigo-100 group-hover:text-indigo-600 dark:from-zinc-800 dark:to-zinc-700 dark:text-zinc-400 dark:group-hover:from-indigo-500/20 dark:group-hover:to-indigo-500/10 dark:group-hover:text-indigo-300">
                    <Glyph className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100"
                      title={file.filename}
                    >
                      {file.filename}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                      {formatBytes(file.size_bytes)} · {timeAgo(file.uploaded_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={`/api/files/${file.id}`}
                      download={file.filename}
                      title="Download"
                      aria-label={`Download ${file.filename}`}
                      className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-indigo-600 dark:hover:bg-zinc-800 dark:hover:text-indigo-400"
                    >
                      <DownloadIcon className="h-4.5 w-4.5" />
                    </a>
                    <button
                      onClick={() => void copyLink(file)}
                      title={isCopied ? "Link copied!" : "Copy share link"}
                      aria-label={`Copy share link for ${file.filename}`}
                      className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-indigo-600 dark:hover:bg-zinc-800 dark:hover:text-indigo-400"
                    >
                      {isCopied ? (
                        <CheckIcon className="h-4.5 w-4.5 text-emerald-500" />
                      ) : (
                        <LinkIcon className="h-4.5 w-4.5" />
                      )}
                    </button>

                    {isConfirming ? (
                      <span className="flex items-center gap-1">
                        <button
                          onClick={() => void deleteFile(file)}
                          className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(file.id)}
                        title="Delete"
                        aria-label={`Delete ${file.filename}`}
                        className="rounded-lg p-2 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-100 hover:text-rose-600 focus:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
                      >
                        <TrashIcon className="h-4.5 w-4.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

