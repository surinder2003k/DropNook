import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { B2_KEY_PREFIX, isB2Configured, presignB2Upload } from "@/lib/b2";

// Single-PUT ceiling: S3/B2 PutObject supports one request up to 5 GB, so
// anything bigger must go through multipart (Phase 2). This cap is
// enforced on metadata here AND re-verified with HeadObject on confirm
// (presigned PUTs can't enforce size — over-limit bytes are deleted).
export const MAX_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
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
 * the metadata via POST /api/files afterwards. When the optional Backblaze B2
 * backend is configured (DROPNOOK_B2_* env vars), a presigned S3 PUT URL is
 * returned instead (`backend: "b2"`, no token) and the rest of the flow is
 * identical.
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
      { error: "File exceeds the 5 GB limit" },
      { status: 413 },
    );
  }

  const safeName = sanitizeFilename(filename);
  const objectKey = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;

  // Backblaze B2 backend configured: presign an S3 PUT URL for the object.
  if (isB2Configured()) {
    try {
      const signedUrl = await presignB2Upload(objectKey);
      return NextResponse.json({
        path: `${B2_KEY_PREFIX}${objectKey}`,
        backend: "b2",
        signedUrl,
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

  const path = objectKey;

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
