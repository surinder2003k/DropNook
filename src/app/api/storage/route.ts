import { connection, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { getB2BucketUsage, isB2Configured } from "@/lib/b2";

// Free-tier quotas: Supabase includes 1 GB of Storage per project, while the
// optional Backblaze B2 backend (DROPNOOK_B2_* env vars) includes 10 GB.
// Override with DROPNOOK_STORAGE_QUOTA_BYTES if either plan changes
// (e.g. 100 GB = 107374182400 for Supabase Pro).
const SUPABASE_QUOTA_BYTES = 1024 * 1024 * 1024;
const B2_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;

/**
 * GET /api/storage — storage usage for the status bar.
 *
 * Returns { used, total } in bytes. When the B2 backend is configured,
 * `used` is the LIVE bucket size (every stored version summed via the B2
 * native API — the ground truth, so the bar matches the billed size in the
 * B2 console even when S3 listings show 0 or DB rows drift). Without B2,
 * it falls back to the sum of every recorded file's size_bytes.
 * `total` is the project quota.
 */
export async function GET() {
  // Opt out of static prerendering (cacheComponents) — B2 auth + listing
  // must run live on every request.
  await connection();
  try {
    const envQuota = Number(process.env.DROPNOOK_STORAGE_QUOTA_BYTES);
    const total =
      Number.isFinite(envQuota) && envQuota > 0
        ? envQuota
        : isB2Configured()
          ? B2_QUOTA_BYTES
          : SUPABASE_QUOTA_BYTES;

    // Live bucket size wins when B2 is on — the DB sum drifts whenever an
    // object exists without a metadata row (or vice versa).
    if (isB2Configured()) {
      try {
        const { used, objects } = await getB2BucketUsage();
        return NextResponse.json(
          { used, total, objects, backend: "b2" },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch (err) {
        console.error(
          "[storage] live B2 usage failed, falling back to DB sum:",
          err instanceof Error ? err.message : err,
        );
        // fall through to the DB sum below
      }
    }

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

    return NextResponse.json(
      { used, total, backend: "supabase" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
