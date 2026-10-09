import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import {
  b2ObjectKey,
  isB2Configured,
  presignB2Download,
} from "@/lib/b2";
import { previewKind } from "@/lib/preview";

const BUCKET = "uploads";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Text previews read at most this many bytes (64 KB) so a huge log/csv can't
// blow up the response — the UI flags when a file was truncated.
const TEXT_PREVIEW_BYTES = 64 * 1024;

/**
 * GET /api/files/[id]/preview — inline preview payload for the lightbox.
 *
 * Returns a discriminated shape the client can render directly:
 *   { kind: "image"|"video"|"audio"|"pdf", url }  → render `url` (inline)
 *   { kind: "text", text, truncated }             → render the decoded text
 *   { kind: "none" }                              → 415, download only
 *
 * Share rules (expiry / max downloads) are enforced exactly like the download
 * endpoint, but a PREVIEW NEVER increments the download counter — browsing a
 * file must not burn a limited link.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();
    const { data: file, error } = await supabase
      .from("file_uploads")
      .select("filename, mime_type, size_bytes, storage_key, expires_at, max_downloads, download_count")
      .eq("id", id)
      .single();

    if (error || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (file.expires_at && new Date(file.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "This link has expired", expired: true },
        { status: 410 },
      );
    }
    if (file.max_downloads != null && (file.download_count ?? 0) >= file.max_downloads) {
      return NextResponse.json(
        { error: "Download limit reached", exhausted: true },
        { status: 410 },
      );
    }

    const kind = previewKind(file.mime_type, file.filename);
    if (kind === "none") {
      return NextResponse.json(
        { error: "This file type can't be previewed — download it instead", kind: "none" },
        { status: 415 },
      );
    }

    // Resolve an inline signed URL for whichever backend holds the object.
    const b2Key = b2ObjectKey(file.storage_key);
    let inlineUrl: string;
    if (b2Key !== null) {
      if (!isB2Configured()) {
        return NextResponse.json(
          { error: "B2 storage is not configured on this server" },
          { status: 503 },
        );
      }
      inlineUrl = await presignB2Download(b2Key, file.filename, {
        inline: true,
        contentType: file.mime_type,
      });
    } else {
      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(file.storage_key, 900, { download: false });
      if (signError || !signed?.signedUrl) {
        return NextResponse.json(
          { error: `Could not prepare preview (${signError?.message ?? "unknown error"})` },
          { status: 500 },
        );
      }
      inlineUrl = signed.signedUrl;
    }

    // Media / PDF: hand the inline URL straight to the browser (no proxying).
    if (kind !== "text") {
      return NextResponse.json({
        kind,
        url: inlineUrl,
        filename: file.filename,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
      });
    }

    // Text: fetch the first 64 KB server-side (keeps storage creds private) and
    // decode as UTF-8. A Range request avoids pulling a multi-GB log; we still
    // slice in JS in case Range was ignored.
    const res = await fetch(inlineUrl, {
      headers: { Range: `bytes=0-${TEXT_PREVIEW_BYTES - 1}` },
    });
    if (!res.ok && res.status !== 206) {
      return NextResponse.json(
        { error: `Could not read file for preview (${res.status})` },
        { status: 502 },
      );
    }
    const buf = Buffer.from(await res.arrayBuffer()).subarray(0, TEXT_PREVIEW_BYTES);
    return NextResponse.json({
      kind: "text",
      text: buf.toString("utf8"),
      truncated: (file.size_bytes ?? 0) > TEXT_PREVIEW_BYTES,
      filename: file.filename,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
