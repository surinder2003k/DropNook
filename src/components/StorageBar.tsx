"use client";

import { useCallback, useEffect, useState } from "react";
import { formatBytes } from "@/lib/format";

/** Dispatch this (from anywhere in the app) to refresh the bar instantly. */
export const STORAGE_REFRESH_EVENT = "dropnook:storage-refresh";

type StorageInfo = { used: number; total: number; objects?: number };

export default function StorageBar() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/storage", { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !Number.isFinite(body.used) || !Number.isFinite(body.total)) {
        throw new Error(body.error || `status ${res.status}`);
      }
      setInfo({
        used: body.used,
        total: body.total,
        objects: Number.isFinite(body.objects) ? body.objects : undefined,
      });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    // Deferred out of the synchronous effect body (react-hooks/set-state-in-effect)
    // — load() only sets state after its network await resolves.
    queueMicrotask(() => {
      void load();
    });
    const interval = setInterval(() => void load(), 30_000);
    const onFocus = () => void load();
    window.addEventListener(STORAGE_REFRESH_EVENT, onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener(STORAGE_REFRESH_EVENT, onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const pct = info && info.total > 0 ? (info.used / info.total) * 100 : 0;
  const clamped = Math.min(100, pct);
  // Keep a sliver visible for non-zero usage so tiny percentages still render.
  const width = info && info.used > 0 ? Math.max(clamped, 1.5) : clamped;
  const barColor =
    pct >= 90
      ? "bg-rose-500"
      : pct >= 75
        ? "bg-amber-500"
        : "bg-gradient-to-r from-indigo-500 to-violet-500";

  return (
    <div className="border-t border-zinc-200/70 bg-zinc-50/60 dark:border-zinc-800/70 dark:bg-zinc-950/60">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 py-1.5">
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Storage
        </span>
        <div
          role="progressbar"
          aria-label="Storage used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(clamped)}
          title={info ? `${pct.toFixed(1)}% used` : undefined}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        >
          <div
            className={`h-full rounded-full transition-all duration-700 ${failed ? "bg-zinc-400 dark:bg-zinc-600" : barColor}`}
            style={{ width: `${failed ? 100 : width}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
          {failed
            ? "status unavailable"
            : info
              ? `${formatBytes(info.used)} used · ${formatBytes(Math.max(0, info.total - info.used))} free`
              : "…"}
        </span>
      </div>
    </div>
  );
}
