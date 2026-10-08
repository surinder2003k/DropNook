import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

// Supabase Free tier includes 1 GB of Storage per project. Override with
// DROPNOOK_STORAGE_QUOTA_BYTES if the plan changes (e.g. 100 GB Pro).
const DEFAULT_QUOTA_BYTES = 1024 * 1024 * 1024;

/**
 * GET /api/storage — storage usage for the status bar.
 *
 * Returns { used, total } in bytes. `used` is the sum of every recorded
 * file's size_bytes (objects in the `uploads` bucket are mirrored 1:1 by
 * these rows); `total` is the project quota.
 */
export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("file_uploads")
      .select("size_bytes")
      .limit(10000);

    if (error) {
      const hint = /does not exist|schema|relation/i.test(error.message)
        ? " — run supabase/schema.sql first"
        : "";
      return NextResponse.json(
        { error: `${error.message}${hint}` },
        { status: 500 },
      );
    }

    const used = (data ?? []).reduce(
      (sum, row) => sum + (row.size_bytes || 0),
      0,
    );

    const envQuota = Number(process.env.DROPNOOK_STORAGE_QUOTA_BYTES);
    const total =
      Number.isFinite(envQuota) && envQuota > 0
        ? envQuota
        : DEFAULT_QUOTA_BYTES;

    return NextResponse.json(
      { used, total },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
