import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

const BUCKET = "uploads";
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

export const FILE_SELECT =
  "id, filename, mime_type, size_bytes, storage_key, status, uploaded_at";

/**
 * GET /api/files — list uploaded files, newest first.
 */
export async function GET() {
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("file_uploads")
      .select(FILE_SELECT)
      .order("uploaded_at", { ascending: false })
      .limit(100);

    if (error) {
      const hint = /does not exist|schema|relation/i.test(error.message)
        ? " — run supabase/schema.sql first"
        : "";
      return NextResponse.json(
        { error: `${error.message}${hint}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ files: data ?? [] });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/files
 * Body: { path, filename, mime_type?, size_bytes }
 *
 * Step 2 of the direct-to-storage upload flow: called by the browser after
 * the file bytes have landed in Supabase Storage. Verifies the object exists
 * and inserts the metadata row into Postgres.
 */
export async function POST(req: Request) {
  let body: {
    path?: unknown;
    filename?: unknown;
    mime_type?: unknown;
    size_bytes?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { path, filename, mime_type, size_bytes } = body;

  if (typeof path !== "string" || path.length === 0 || path.length > 240) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  if (/[\\/]\.\.|^\.|\s{2,}/.test(path) || !/^[\w.\- /]+$/.test(path)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  if (typeof filename !== "string" || filename.trim().length === 0) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }
  if (
    typeof size_bytes !== "number" ||
    !Number.isFinite(size_bytes) ||
    size_bytes <= 0 ||
    size_bytes > MAX_SIZE_BYTES
  ) {
    return NextResponse.json(
      { error: "size_bytes must be between 1 byte and 25 MB" },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseServer();

    // Verify the object actually landed in storage before recording it.
    const { error: urlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 30);
    if (urlError) {
      return NextResponse.json(
        { error: `File not found in storage — upload may have failed (${urlError.message})` },
        { status: 404 },
      );
    }

    const { data, error } = await supabase
      .from("file_uploads")
      .insert({
        filename: filename.slice(0, 240),
        mime_type:
          typeof mime_type === "string" && mime_type.length > 0
            ? mime_type.slice(0, 120)
            : "application/octet-stream",
        size_bytes,
        storage_key: path,
        status: "uploaded",
      })
      .select(FILE_SELECT)
      .single();

    if (error) {
      const hint = /does not exist|schema|relation/i.test(error.message)
        ? " — run supabase/schema.sql first"
        : "";
      return NextResponse.json(
        { error: `${error.message}${hint}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ file: data }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
