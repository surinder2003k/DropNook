import { connection, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { generateSlug, hashPassword } from "@/lib/share";
import {
  B2_KEY_PREFIX,
  deleteB2Object,
  headB2Object,
  isB2Configured,
} from "@/lib/b2";

const BUCKET = "uploads";
const MAX_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB single-PUT ceiling (matches /api/upload)

export const FILE_SELECT =
  "id, filename, mime_type, size_bytes, storage_key, status, uploaded_at, slug, expires_at, max_downloads, download_count";

type FileRow = {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number;
  storage_key: string;
  status: string;
  uploaded_at: string;
  slug: string | null;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  password_hash?: string | null;
};

/** Public shape of a file row: never leaks storage_key or the password hash. */
function toPublicFile(row: FileRow) {
  return {
    id: row.id,
    filename: row.filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    status: row.status,
    uploaded_at: row.uploaded_at,
    slug: row.slug,
    expires_at: row.expires_at,
    max_downloads: row.max_downloads,
    download_count: row.download_count,
    has_password: !!row.password_hash,
  };
}

/**
 * GET /api/files — list uploaded files, newest first.
 */
export async function GET() {
  // Live per request (pairs with connection() usage across API routes).
  await connection();
  try {
    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("file_uploads")
      .select(`${FILE_SELECT}, password_hash`)
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

    return NextResponse.json({ files: (data ?? []).map(toPublicFile) });
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
    password?: unknown;
    expires_in_hours?: unknown;
    max_downloads?: unknown;
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
  // B2 objects carry a `b2:` prefix in storage_key — validate the raw key.
  const isB2Path = path.startsWith(B2_KEY_PREFIX);
  const storageKey = isB2Path ? path.slice(B2_KEY_PREFIX.length) : path;
  if (/[\\/]\.\.|^\.|\s{2,}/.test(storageKey) || !/^[\w.\- /]+$/.test(storageKey)) {
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
      { error: "size_bytes must be between 1 byte and 5 GB" },
      { status: 400 },
    );
  }

  let verifiedSize = size_bytes;

  try {
    const supabase = getSupabaseServer();

    if (isB2Path) {
      if (!isB2Configured()) {
        return NextResponse.json(
          { error: "B2 storage is not configured on this server" },
          { status: 503 },
        );
      }
      // Verify the object actually landed in B2 before recording it. A
      // presigned PUT cannot enforce the size cap server-side, so check the
      // real byte count here and use it (the claim can't understate usage).
      const actualSize = await headB2Object(storageKey);
      if (actualSize === null) {
        return NextResponse.json(
          { error: "File not found in storage — upload may have failed" },
          { status: 404 },
        );
      }
      if (actualSize === 0) {
        return NextResponse.json({ error: "File is empty" }, { status: 400 });
      }
      if (actualSize > MAX_SIZE_BYTES) {
        await deleteB2Object(storageKey).catch(() => undefined);
        return NextResponse.json(
          { error: "File exceeds the 5 GB limit" },
          { status: 413 },
        );
      }
      verifiedSize = actualSize;
    } else {
      // Verify the object actually landed in storage before recording it.
      const { error: urlError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(storageKey, 30);
      if (urlError) {
        return NextResponse.json(
          {
            error: `File not found in storage — upload may have failed (${urlError.message})`,
          },
          { status: 404 },
        );
      }
    }

    const { data, error } = await supabase
      .from("file_uploads")
      .insert({
        filename: filename.slice(0, 240),
        mime_type:
          typeof mime_type === "string" && mime_type.length > 0
            ? mime_type.slice(0, 120)
            : "application/octet-stream",
        size_bytes: verifiedSize,
        storage_key: path,
        status: "uploaded",
        slug: generateSlug(),
        password_hash:
          typeof body.password === "string" && body.password.length > 0
            ? hashPassword(body.password)
            : null,
        expires_at:
          typeof body.expires_in_hours === "number" &&
          Number.isFinite(body.expires_in_hours) &&
          body.expires_in_hours > 0
            ? new Date(Date.now() + body.expires_in_hours * 3600 * 1000).toISOString()
            : null,
        max_downloads:
          typeof body.max_downloads === "number" &&
          Number.isFinite(body.max_downloads) &&
          body.max_downloads > 0
            ? Math.floor(body.max_downloads)
            : null,
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
