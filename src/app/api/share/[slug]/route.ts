import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { verifyPassword } from "@/lib/share";

export const PUBLIC_FILE_SELECT =
  "filename, mime_type, size_bytes, slug, expires_at, max_downloads, download_count, password_hash";

/**
 * GET /api/share/[slug]
 *
 * Public share-page lookup. Returns non-sensitive metadata for the share page
 * (filename, size, expiry, download limit, count) WITHOUT the storage key, so
 * the actual bytes are never exposed. `has_password` tells the page whether to
 * prompt for one; the hash itself never leaves the server.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  if (!/^[a-z2-9]{4,32}$/.test(slug)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();
    const { data: file, error } = await supabase
      .from("file_uploads")
      .select(PUBLIC_FILE_SELECT)
      .eq("slug", slug)
      .single();

    if (error || !file) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    // Expired links are treated as gone.
    if (file.expires_at && new Date(file.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "This link has expired", expired: true }, { status: 410 });
    }

    // Exhausted download limit → link is dead.
    if (file.max_downloads != null && file.download_count >= file.max_downloads) {
      return NextResponse.json(
        { error: "Download limit reached", exhausted: true },
        { status: 410 },
      );
    }

    return NextResponse.json({
      filename: file.filename,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      expires_at: file.expires_at,
      max_downloads: file.max_downloads,
      download_count: file.download_count,
      has_password: !!file.password_hash,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/share/[slug]
 * Body: { password?: string }
 *
 * Verifies the password (if any) and, on success, atomically increments the
 * download counter and returns a 15-minute signed download URL. Enforces the
 * expiry + max-downloads guardrails server-side so they can't be bypassed.
 */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;

  if (!/^[a-z2-9]{4,32}$/.test(slug)) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }

  let password = "";
  try {
    const body = await req.json();
    if (typeof body?.password === "string") password = body.password;
  } catch {
    // empty body is fine (no password)
  }

  try {
    const supabase = getSupabaseServer();
    const { data: file, error } = await supabase
      .from("file_uploads")
      .select("*")
      .eq("slug", slug)
      .single();

    if (error || !file) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (file.expires_at && new Date(file.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "This link has expired", expired: true }, { status: 410 });
    }

    if (file.max_downloads != null && file.download_count >= file.max_downloads) {
      return NextResponse.json(
        { error: "Download limit reached", exhausted: true },
        { status: 410 },
      );
    }

    if (!verifyPassword(password, file.password_hash)) {
      return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    }

    // Increment the download counter (best-effort; download still proceeds).
    await supabase
      .from("file_uploads")
      .update({ download_count: (file.download_count ?? 0) + 1 })
      .eq("id", file.id);

    // Build a signed download URL for whichever backend holds the object.
    const b2Key =
      typeof file.storage_key === "string" && file.storage_key.startsWith("b2:")
        ? file.storage_key.slice(3)
        : null;

    let downloadUrl: string | null = null;
    if (b2Key) {
      const { isB2Configured, presignB2Download } = await import("@/lib/b2");
      if (isB2Configured()) {
        downloadUrl = await presignB2Download(b2Key, file.filename);
      }
    } else {
      const { data: signed } = await supabase.storage
        .from("uploads")
        .createSignedUrl(file.storage_key, 900, { download: file.filename });
      downloadUrl = signed?.signedUrl ?? null;
    }

    if (!downloadUrl) {
      return NextResponse.json(
        { error: "Could not prepare download" },
        { status: 500 },
      );
    }

    return NextResponse.json({ download_url: downloadUrl, filename: file.filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
