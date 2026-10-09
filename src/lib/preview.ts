/**
 * Shared file-type helpers for the list filter, row thumbnails and the
 * preview lightbox — one source of truth so a file categorized as "images"
 * is also previewable as an image.
 */

export type PreviewKind = "image" | "video" | "audio" | "pdf" | "text" | "none";
export type FileCategory = "images" | "videos" | "audio" | "archives" | "documents";

const ARCHIVE_EXT = ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz"];
const TEXT_EXT = [
  "txt", "md", "json", "csv", "tsv", "log", "yml", "yaml", "toml", "xml",
  "html", "css", "scss", "js", "ts", "jsx", "tsx", "py", "rb", "go", "rs",
  "java", "c", "cpp", "h", "sh", "sql", "ini", "cfg", "env", "srt", "vtt",
];

function extOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

/** How a file can be previewed in the lightbox (or "none" → download only). */
export function previewKind(mime: string | null, filename: string): PreviewKind {
  const m = (mime ?? "").toLowerCase();
  const ext = extOf(filename);
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (
    m.startsWith("text/") ||
    m.includes("json") ||
    m.includes("xml") ||
    m.includes("html") ||
    m.includes("javascript") ||
    m.includes("typescript") ||
    m.includes("csv") ||
    TEXT_EXT.includes(ext)
  )
    return "text";
  return "none";
}

/** Coarse category used by the toolbar type filter. */
export function fileCategory(mime: string | null, filename: string): FileCategory {
  const kind = previewKind(mime, filename);
  if (kind === "image") return "images";
  if (kind === "video") return "videos";
  if (kind === "audio") return "audio";
  const m = (mime ?? "").toLowerCase();
  const ext = extOf(filename);
  if (
    ARCHIVE_EXT.includes(ext) ||
    m.includes("zip") ||
    m.includes("tar") ||
    m.includes("compressed")
  )
    return "archives";
  return "documents";
}
