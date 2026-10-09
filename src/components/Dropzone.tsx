"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertIcon,
  CheckIcon,
  CloudUploadIcon,
  DownloadIcon,
  EyeIcon,
  InboxIcon,
  LinkIcon,
  LockIcon,
  QrIcon,
  SearchIcon,
  SpinnerIcon,
  TrashIcon,
  XIcon,
  fileGlyph,
} from "./icons";
import { formatBytes } from "@/lib/format";
import { previewKind, fileCategory, type FileCategory } from "@/lib/preview";
import { STORAGE_REFRESH_EVENT } from "./StorageBar";
import ShareModal, { type ShareFile } from "./ShareModal";
import PreviewModal, { type PreviewFile } from "./PreviewModal";

const MAX_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB single-PUT ceiling

type UploadedFile = {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number;
  uploaded_at: string;
  slug?: string | null;
  expires_at?: string | null;
  max_downloads?: number | null;
  download_count?: number | null;
  has_password?: boolean;
};

/** Share rules chosen before uploading (all optional, enforced server-side). */
type ShareOptions = {
  password?: string;
  expires_in_hours?: number;
  max_downloads?: number;
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
  share?: ShareOptions,
): Promise<{ file: UploadedFile }> {
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
        reject(
          new Error(
            "Network error — the upload request was blocked before reaching storage. " +
              "This is usually a stale CORS permission from before it was configured: " +
              "hard-refresh the page (Ctrl+Shift+R) and try again.",
          ),
        );
      xhr.ontimeout = () => reject(new Error("Upload timed out — check your connection"));
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
        // Optional share rules (password / expiry / max downloads).
        ...(share?.password ? { password: share.password } : {}),
        ...(share?.expires_in_hours
          ? { expires_in_hours: share.expires_in_hours }
          : {}),
        ...(share?.max_downloads ? { max_downloads: share.max_downloads } : {}),
      }),
    });
    const confirmBody = await confirmRes.json().catch(() => ({}));
    if (!confirmRes.ok || !confirmBody.file?.id) {
      throw new Error(confirmBody.error || `Confirm failed (${confirmRes.status})`);
    }

    onProgress(100);
    return { file: confirmBody.file as UploadedFile };
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
  // Share-modal state (opens after an upload, or from a row's share button).
  const [shareFile, setShareFile] = useState<ShareFile | null>(null);
  const [shareHasPassword, setShareHasPassword] = useState(false);
  // Pre-upload share options panel.
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [optPassword, setOptPassword] = useState("");
  const [optExpiry, setOptExpiry] = useState(""); // hours as a string, "" = never
  const [optMaxDownloads, setOptMaxDownloads] = useState(""); // "" = unlimited
  // Lightbox preview.
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  // Toolbar: search / type filter / sort.
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<FileCategory | "all">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name" | "size">("newest");
  // Multi-select bulk actions.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
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
      // A fresh list invalidates any prior selection (ids may be gone).
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const live = new Set((body.files ?? []).map((f: UploadedFile) => f.id));
        const next = new Set([...prev].filter((id) => live.has(id)));
        return next.size === prev.size ? prev : next;
      });
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

      // Snapshot the current share options for this batch of uploads.
      const shareOpts: ShareOptions = {
        password: optPassword.trim() || undefined,
        expires_in_hours: optExpiry ? Number(optExpiry) : undefined,
        max_downloads: optMaxDownloads ? Number(optMaxDownloads) : undefined,
      };
      const hadPassword = !!shareOpts.password;

      const results = await Promise.allSettled(
        accepted.map((file, i) =>
          uploadFile(
            file,
            (pct) =>
              setQueue((q) =>
                q.map((it) =>
                  it.localId === items[i].localId ? { ...it, progress: pct } : it,
                ),
              ),
            shareOpts,
          ),
        ),
      );

      let succeeded = 0;
      let firstUploaded: UploadedFile | null = null;
      results.forEach((result, i) => {
        const localId = items[i].localId;
        if (result.status === "fulfilled") {
          succeeded++;
          if (!firstUploaded) firstUploaded = result.value.file;
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
        // Pop the share dialog for the first successful upload — that's the
        // "share link ready" moment Dropzone-Share-style tools use.
        if (firstUploaded) {
          setShareHasPassword(hadPassword);
          setShareFile(firstUploaded);
        }
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
    [refreshList, showBanner, optPassword, optExpiry, optMaxDownloads],
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
    // Prefer the public share page (/s/<slug>); fall back to the raw
    // download endpoint for rows created before slugs existed.
    const url = file.slug
      ? `${window.location.origin}/s/${file.slug}`
      : `${window.location.origin}/api/files/${file.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId((cur) => (cur === file.id ? null : cur)), 1800);
    } catch {
      showBanner("Copy failed — your browser blocked clipboard access.");
    }
  };

  const openShare = (file: UploadedFile, hasPassword = false) => {
    setShareHasPassword(hasPassword);
    setShareFile(file);
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

  // Derived: apply search + type filter + sort to the full list.
  const visibleFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = files;
    if (q) list = list.filter((f) => f.filename.toLowerCase().includes(q));
    if (categoryFilter !== "all") {
      list = list.filter((f) => fileCategory(f.mime_type, f.filename) === categoryFilter);
    }
    const sorted = [...list];
    switch (sortBy) {
      case "newest":
        sorted.sort(
          (a, b) =>
            new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
        );
        break;
      case "oldest":
        sorted.sort(
          (a, b) =>
            new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime(),
        );
        break;
      case "name":
        sorted.sort((a, b) => a.filename.localeCompare(b.filename));
        break;
      case "size":
        sorted.sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0));
        break;
    }
    return sorted;
  }, [files, query, categoryFilter, sortBy]);

  // Stats dashboard aggregates (over the full list, not the filtered view).
  const stats = useMemo(() => {
    const totalDownloads = files.reduce((s, f) => s + (f.download_count ?? 0), 0);
    return {
      files: files.length,
      bytes: files.reduce((s, f) => s + (f.size_bytes || 0), 0),
      downloads: totalDownloads,
      shared: files.filter((f) => !!f.slug).length,
    };
  }, [files]);

  const allVisibleSelected =
    visibleFiles.length > 0 && visibleFiles.every((f) => selectedIds.has(f.id));

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleFiles.forEach((f) => next.delete(f.id));
      else visibleFiles.forEach((f) => next.add(f.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const openPreview = (file: UploadedFile) => {
    setPreviewFile({
      id: file.id,
      filename: file.filename,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
    });
  };

  // Bulk delete selected files (reuses the single-file backend-aware path via
  // the new DELETE /api/files endpoint).
  const bulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Bulk delete failed");
      const gone = new Set(body.deleted ?? ids);
      setFiles((f) => f.filter((x) => !gone.has(x.id)));
      clearSelection();
      window.dispatchEvent(new Event(STORAGE_REFRESH_EVENT));
      showBanner(`Deleted ${gone.size} file${gone.size === 1 ? "" : "s"}.`);
    } catch (err) {
      showBanner(err instanceof Error ? err.message : "Bulk delete failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const totalSize = stats.bytes;


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
        className={`group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_48px_-24px_rgba(24,24,27,0.25)] transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-900/70 ${
          dragActive
            ? "scale-[1.005] border-zinc-900 ring-2 ring-zinc-900/10 dark:border-zinc-100 dark:ring-white/10"
            : "hover:border-zinc-300 dark:hover:border-zinc-700"
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
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            <CloudUploadIcon className="h-8 w-8" />
          </div>

          <div>
            <p className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {dragActive ? "Release to upload" : "Tap, click, or drop to upload"}
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              or{" "}
              <button
                onClick={() => inputRef.current?.click()}
                className="font-medium text-zinc-900 underline underline-offset-2 transition hover:opacity-70 dark:text-zinc-100"
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

          {/* Optional share rules applied to the next upload(s). */}
          <div className="w-full max-w-sm">
            <button
              type="button"
              onClick={() => setOptionsOpen((o) => !o)}
              aria-expanded={optionsOpen}
              className="mx-auto flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
            >
              <LockIcon className="h-3.5 w-3.5" />
              Share options
              {(optPassword || optExpiry || optMaxDownloads) && (
                <span className="ml-1 h-1.5 w-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
              )}
            </button>

            {optionsOpen && (
              <div className="animate-pop-in mt-3 flex flex-col gap-3 rounded-2xl border border-zinc-200/80 bg-white/90 p-4 text-left shadow-sm dark:border-zinc-700 dark:bg-zinc-800/60">
                <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  Password (optional)
                  <input
                    type="password"
                    value={optPassword}
                    onChange={(e) => setOptPassword(e.target.value)}
                    placeholder="Require a password to download"
                    className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 dark:focus:border-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    Link expires
                    <select
                      value={optExpiry}
                      onChange={(e) => setOptExpiry(e.target.value)}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 dark:focus:border-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="">Never</option>
                      <option value="1">1 hour</option>
                      <option value="24">24 hours</option>
                      <option value="72">3 days</option>
                      <option value="168">7 days</option>
                      <option value="720">30 days</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    Max downloads
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={optMaxDownloads}
                      onChange={(e) => setOptMaxDownloads(e.target.value)}
                      placeholder="Unlimited"
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 dark:focus:border-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </label>
                </div>

                {(optPassword || optExpiry || optMaxDownloads) && (
                  <button
                    type="button"
                    onClick={() => {
                      setOptPassword("");
                      setOptExpiry("");
                      setOptMaxDownloads("");
                    }}
                    className="self-start text-xs font-medium text-zinc-400 transition hover:text-rose-500"
                  >
                    Clear options
                  </button>
                )}
              </div>
            )}
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
                      <SpinnerIcon className="h-4 w-4 animate-spin text-zinc-500" />
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
                          : "bg-gradient-to-r from-zinc-700 to-zinc-900 dark:from-zinc-200 dark:to-zinc-100"
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

      {/* Stats dashboard — live aggregates over the whole account. */}
      {!listLoading && !listError && stats.files > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Files" value={String(stats.files)} tone="indigo" />
          <StatCard label="Storage" value={formatBytes(stats.bytes)} tone="violet" />
          <StatCard label="Downloads" value={String(stats.downloads)} tone="emerald" />
          <StatCard label="Shared links" value={String(stats.shared)} tone="amber" />
        </div>
      )}

      {/* Toolbar: search / type filter / sort (only once there are files). */}
      {!listLoading && !listError && files.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files by name…"
              aria-label="Search files"
              className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-900 dark:focus:border-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-100"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as FileCategory | "all")}
            aria-label="Filter by type"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none transition focus:border-zinc-900 dark:focus:border-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200"
          >
            <option value="all">All types</option>
            <option value="images">Images</option>
            <option value="videos">Videos</option>
            <option value="audio">Audio</option>
            <option value="archives">Archives</option>
            <option value="documents">Documents</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            aria-label="Sort files"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none transition focus:border-zinc-900 dark:focus:border-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
            <option value="size">Largest</option>
          </select>
        </div>
      )}

      {/* Bulk action bar — appears when one or more files are selected. */}
      {selectedIds.size > 0 && (
        <div className="animate-pop-in flex flex-wrap items-center gap-2 rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {selectedIds.size} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <a
              href={`/api/zip?ids=${[...selectedIds].join(",")}`}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 transition hover:border-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              Download ZIP
            </a>
            <button
              type="button"
              onClick={() => void bulkDelete()}
              disabled={bulkBusy}
              className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-rose-500 disabled:opacity-60"
            >
              {bulkBusy ? (
                <SpinnerIcon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <TrashIcon className="h-3.5 w-3.5" />
              )}
              Delete
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-white dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Clear
            </button>
          </div>
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
            <span className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
              <span className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  aria-label="Select all files"
                  className="h-3.5 w-3.5 cursor-pointer rounded border-zinc-300 accent-zinc-900 dark:accent-zinc-100 dark:border-zinc-600"
                />
                {files.length} file{files.length === 1 ? "" : "s"} ·{" "}
                {formatBytes(totalSize)} total
              </span>
              <a
                href={`/api/zip?ids=${files
                  .map((f) => f.id)
                  .join(",")}`}
                title="Download every file as a single ZIP"
                className="flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-medium text-zinc-500 transition hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:border-zinc-100 dark:hover:text-zinc-100"
              >
                <DownloadIcon className="h-3.5 w-3.5" />
                ZIP all
              </a>
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

        {!listLoading && !listError && visibleFiles.length === 0 && files.length > 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200/80 bg-white/60 px-6 py-10 text-center dark:border-zinc-800 dark:bg-zinc-900/40">
            <SearchIcon className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              No files match your filters
            </p>
            <button
              onClick={() => {
                setQuery("");
                setCategoryFilter("all");
              }}
              className="text-xs font-medium text-zinc-900 underline-offset-2 transition hover:underline dark:text-zinc-100"
            >
              Clear search & filters
            </button>
          </div>
        )}

        {!listLoading && !listError && visibleFiles.length > 0 && (
          <ul className="stagger flex flex-col gap-3">
            {visibleFiles.map((file) => {
              const Glyph = fileGlyph(file.mime_type, file.filename);
              const isConfirming = confirmDeleteId === file.id;
              const isCopied = copiedId === file.id;
              const isSelected = selectedIds.has(file.id);
              const previewable = previewKind(file.mime_type, file.filename) !== "none";
              return (
                <li
                  key={file.id}
                  className={`group flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm transition hover:shadow dark:bg-zinc-900/60 ${
                    isSelected
                      ? "border-zinc-900 ring-1 ring-zinc-900/10 dark:border-zinc-100 dark:ring-white/10"
                      : "border-zinc-200/80 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(file.id)}
                    aria-label={`Select ${file.filename}`}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 text-zinc-900 accent-zinc-900 dark:accent-zinc-100 dark:border-zinc-600"
                  />

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-500 transition group-hover:from-zinc-100 group-hover:to-zinc-300 group-hover:text-zinc-900 dark:from-zinc-800 dark:to-zinc-700 dark:text-zinc-400 dark:group-hover:from-zinc-1000/20 dark:group-hover:to-zinc-700 dark:group-hover:text-zinc-100">
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
                    {previewable && (
                      <button
                        onClick={() => openPreview(file)}
                        title="Preview"
                        aria-label={`Preview ${file.filename}`}
                        className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      >
                        <EyeIcon className="h-4.5 w-4.5" />
                      </button>
                    )}
                    <a
                      href={`/api/files/${file.id}`}
                      download={file.filename}
                      title="Download"
                      aria-label={`Download ${file.filename}`}
                      className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    >
                      <DownloadIcon className="h-4.5 w-4.5" />
                    </a>
                    <button
                      onClick={() => void copyLink(file)}
                      title={isCopied ? "Link copied!" : "Copy share link"}
                      aria-label={`Copy share link for ${file.filename}`}
                      className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    >
                      {isCopied ? (
                        <CheckIcon className="h-4.5 w-4.5 text-emerald-500" />
                      ) : (
                        <LinkIcon className="h-4.5 w-4.5" />
                      )}
                    </button>
                    <button
                      onClick={() => openShare(file, file.has_password === true)}
                      title="Share (QR & options)"
                      aria-label={`Share ${file.filename}`}
                      className="rounded-lg p-2 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-100 hover:text-zinc-900 focus:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    >
                      <QrIcon className="h-4.5 w-4.5" />
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

      {/* Share dialog (QR + copy + rules) */}
      <ShareModal
        file={shareFile}
        hasPassword={shareHasPassword}
        onClose={() => setShareFile(null)}
      />

      {/* In-page preview lightbox */}
      <PreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}

/** A single stat tile for the dashboard row. */
function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "indigo" | "violet" | "emerald" | "amber";
}) {
  const dot: Record<typeof tone, string> = {
    indigo: "bg-zinc-900 dark:bg-zinc-100",
    violet: "bg-zinc-400",
    emerald: "bg-zinc-900",
    amber: "bg-zinc-300",
  };
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        <span className={`h-1.5 w-1.5 rounded-full ${dot[tone]}`} />
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </span>
    </div>
  );
}

