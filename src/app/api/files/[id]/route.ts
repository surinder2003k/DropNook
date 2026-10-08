import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import {
  b2ObjectKey,
  deleteB2Object,
  isB2Configured,
  presignB2Download,
} from "@/lib/b2";

const BUCKET = "uploads";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/files/[id] — redirect to a short-lived signed download URL.
 */
export async function GET(_req: Request, { params }: RouteContext) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();
    const { data: file, error } = await supabase
      .from("file_uploads")
      .select("filename, storage_key")
      .eq("id", id)
      .single();

    if (error || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const b2Key = b2ObjectKey(file.storage_key);
    if (b2Key !== null) {
      if (!isB2Configured()) {
        return NextResponse.json(
          {
            error:
              "This file lives in B2 storage, which is not configured on this server",
          },
          { status: 503 },
        );
      }
      const url = await presignB2Download(b2Key, file.filename);
      return NextResponse.redirect(url, {
        status: 307,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_key, 3600, { download: file.filename });

    if (signError || !signed?.signedUrl) {
      return NextResponse.json(
        { error: `Could not prepare download (${signError?.message ?? "unknown error"})` },
        { status: 500 },
      );
    }

    return NextResponse.redirect(signed.signedUrl, {
      status: 307,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/files/[id] — remove the metadata row and the storage object.
 */
export async function DELETE(_req: Request, { params }: RouteContext) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();

    const { data: file, error: lookupError } = await supabase
      .from("file_uploads")
      .select("storage_key")
      .eq("id", id)
      .single();

    if (lookupError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("file_uploads")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Best-effort cleanup of the stored bytes.
    const b2Key = b2ObjectKey(file.storage_key);
    if (b2Key !== null) {
      if (isB2Configured()) await deleteB2Object(b2Key).catch(() => undefined);
    } else {
      await supabase.storage.from(BUCKET).remove([file.storage_key]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
