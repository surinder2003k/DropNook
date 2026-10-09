import { PassThrough, Readable } from "node:stream";
import { ZipArchive, type ArchiverError } from "archiver";
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase";
import { b2ObjectKey, isB2Configured, presignB2Download } from "@/lib/b2";

const BUCKET = "uploads";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILES = 50;

/**
 * GET /api/zip?ids=<uuid,uuid,…>
 *
 * Streams all requested files back as a single ZIP archive (the classic
 * "Download all" button). Bytes are fetched server-side from B2/Supabase and
 * piped into archiver, so the response streams and memory stays flat.
 *
 * Share rules (expiry / max downloads) are enforced per file — an expired or
 * exhausted file fails the whole request before any bytes stream.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ids = (url.searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ error: "No file ids provided" }, { status: 400 });
    }
    if (ids.length > MAX_FILES || !ids.every((id) => UUID_RE.test(id))) {
      return NextResponse.json(
        { error: `Provide 1-${MAX_FILES} valid file ids` },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServer();
    const { data, error } = await supabase
      .from("file_uploads")
      .select("id, filename, storage_key, expires_at, max_downloads, download_count")
      .in("id", ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Files not found" }, { status: 404 });
    }

    // Enforce share rules before streaming a single byte.
    const now = Date.now();
    for (const file of data) {
      if (file.expires_at && new Date(file.expires_at).getTime() < now) {
        return NextResponse.json(
          { error: `"${file.filename}" has expired`, expired: true },
          { status: 410 },
        );
      }
      if (
        file.max_downloads != null &&
        (file.download_count ?? 0) >= file.max_downloads
      ) {
        return NextResponse.json(
          { error: `"${file.filename}" reached its download limit`, exhausted: true },
          { status: 410 },
        );
      }
    }

    // Resolve every file to a fetchable signed URL (B2 presigned or Supabase).
    const entries: { name: string; url: string }[] = [];
    const usedNames = new Set<string>();
    for (const file of data) {
      const b2Key = b2ObjectKey(file.storage_key);
      let signed: string;
      if (b2Key !== null) {
        if (!isB2Configured()) {
          return NextResponse.json(
            { error: "B2 storage is not configured on this server" },
            { status: 503 },
          );
        }
        signed = await presignB2Download(b2Key, file.filename);
      } else {
        const { data: s, error: signError } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(file.storage_key, 900, { download: file.filename });
        if (signError || !s?.signedUrl) {
          return NextResponse.json(
            { error: `Could not sign "${file.filename}"` },
            { status: 500 },
          );
        }
        signed = s.signedUrl;
      }

      // Deduplicate names inside the archive (a.zip, a (1).zip, …).
      let name = file.filename || "file";
      if (usedNames.has(name.toLowerCase())) {
        const dot = name.lastIndexOf(".");
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        let n = 1;
        while (usedNames.has(`${base} (${n})${ext}`.toLowerCase())) n++;
        name = `${base} (${n})${ext}`;
      }
      usedNames.add(name.toLowerCase());
      entries.push({ name, url: signed });
    }

    // Count the downloads (best-effort — archive still streams on failure).
    for (const file of data) {
      await supabase
        .from("file_uploads")
        .update({ download_count: (file.download_count ?? 0) + 1 })
        .eq("id", file.id);
    }

    // Build the ZIP and stream it: archiver → PassThrough → web Response.
    const archive = new ZipArchive({ zlib: { level: 5 } });
    const out = new PassThrough();
    archive.on("error", (err: ArchiverError) => out.destroy(err));
    archive.pipe(out);

    void (async () => {
      try {
        for (const entry of entries) {
          const res = await fetch(entry.url);
          if (!res.ok || !res.body) {
            throw new Error(`Fetch failed for "${entry.name}" (${res.status})`);
          }
          archive.append(Readable.fromWeb(res.body as never), {
            name: entry.name,
          });
        }
        await archive.finalize();
      } catch (err) {
        out.destroy(err instanceof Error ? err : new Error("Zip failed"));
      }
    })();

    return new Response(Readable.toWeb(out) as ReadableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="dropnook-${entries.length}-files.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
