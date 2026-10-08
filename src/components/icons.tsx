import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function LogoIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2} {...props}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v2a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-2" />
    </svg>
  );
}

export function CloudUploadIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 13v8" />
      <path d="m8 17 4-4 4 4" />
      <path d="M20.5 14.5A5.5 5.5 0 0 0 17 5.2 7 7 0 0 0 4.3 9.7 4.5 4.5 0 0 0 5.5 18.5" />
    </svg>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L16 17" />
      <path d="m14 14 1.7-1.7a2 2 0 0 1 2.8 0L21 15" />
    </svg>
  );
}

export function VideoIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="5" width="14" height="14" rx="2" />
      <path d="m17 10 4-2.5v9L17 14" />
    </svg>
  );
}

export function AudioIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  );
}

export function ArchiveIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </svg>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
      <path d="m13.5 5-3 14" />
    </svg>
  );
}

export function DownloadIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M10 14a4.5 4.5 0 0 0 6.4.4l2.8-2.8a4.5 4.5 0 0 0-6.4-6.4L11.4 6.6" />
      <path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-2.8 2.8a4.5 4.5 0 0 0 6.4 6.4l1.4-1.4" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} {...props}>
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 13h4l1.5 3h5L16 13h4" />
      <path d="M6.5 5.5h11L20 13v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4z" />
    </svg>
  );
}

/** Pick an icon that matches the file's type. */
export function fileGlyph(mime: string | null, filename: string) {
  const m = (mime ?? "").toLowerCase();
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (m.startsWith("image/")) return ImageIcon;
  if (m.startsWith("video/")) return VideoIcon;
  if (m.startsWith("audio/")) return AudioIcon;
  if (
    ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz"].includes(ext) ||
    m.includes("zip") ||
    m.includes("tar") ||
    m.includes("compressed")
  )
    return ArchiveIcon;
  if (
    m.startsWith("text/") ||
    m.includes("json") ||
    m.includes("xml") ||
    m.includes("html") ||
    m.includes("javascript") ||
    m.includes("typescript") ||
    ["js", "ts", "jsx", "tsx", "py", "rb", "go", "rs", "java", "c", "cpp", "sh", "sql", "md", "yml", "yaml", "toml", "csv"].includes(ext)
  )
    return CodeIcon;
  return FileIcon;
}
