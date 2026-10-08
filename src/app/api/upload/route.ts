import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";

export const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB (matches Supabase free-tier bucket cap)
const BUCKET = "uploads";

function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const safe = base
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "-")
    .replace(/^[.]+/, "_")
    .slice(0, 120);
  return safe || "file";
}

/**
 * POST /api/upload
 * Body: { filename: string, size: number, mime_type?: string }
 *
 * Step 1 of the direct-to-storage upload flow: validates the file metadata
 * and returns a signed upload URL token. The browser then PUTs the file bytes
 * straight to Supabase Storage (no 4.5 MB Vercel body limit), and confirms
 * the metadata via POST /api/files afterwards.
 */
export async function POST(req: Request) {
  let body: {
    filename?: unknown;
    size?: unknown;
    mime_type?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { filename, size, mime_type } = body;

  if (typeof filename !== "string" || filename.trim().length === 0) {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }
  if (typeof size !== "number" || !Number.isFinite(size) || size < 0) {
    return NextResponse.json({ error: "size must be a positive number" }, { status: 400 });
  }
  if (size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File exceeds the 50 MB limit" },
      { status: 413 },
    );
  }

  const safeName = sanitizeFilename(filename);
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;

  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error) {
      const isBucketMissing = /bucket|not found|404/i.test(error.message);
      return NextResponse.json(
        {
          error: isBucketMissing
            ? `Storage bucket "${BUCKET}" is missing — run supabase/schema.sql in the Supabase SQL editor first. (${error.message})`
            : `Could not prepare upload: ${error.message}`,
        },
        { status: isBucketMissing ? 503 : 500 },
      );
    }

    return NextResponse.json({
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
      contentType:
        typeof mime_type === "string" && mime_type.length > 0
          ? mime_type
          : "application/octet-stream",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
