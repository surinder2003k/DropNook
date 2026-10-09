/**
 * Central site configuration. Everything that needs the canonical origin
 * (metadata, sitemap, robots, JSON-LD, share links) reads it from here so it
 * stays consistent. Override with NEXT_PUBLIC_SITE_URL in the environment.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://dropnook.vercel.app"
).replace(/\/+$/, "");

export const SITE_NAME = "Dropzone";
export const SITE_DESCRIPTION =
  "Send files or text that disappear once accessed. Upload, get a single-use link, and share it — no account needed.";
export const SITE_TAGLINE = "Share files securely";
export const SITE_CATEGORY = "File Sharing & Storage";
export const TWITTER_HANDLE = "@dropzone";

/** Google AdSense publisher id, e.g. "ca-pub-1234567890123456". */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";

/**
 * Google Search Console verification token (the content value of the
 * `google-site-verification` meta tag). Add the DNS TXT or HTML-tag method's
 * token here — or via GOOGLE_SITE_VERIFICATION in the environment. Leave empty
 * to omit the tag entirely.
 */
export const GOOGLE_SITE_VERIFICATION =
  process.env.GOOGLE_SITE_VERIFICATION ??
  process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ??
  "7DDDhNUg6jYfqTlpcjhcRviMdzzUvxJd2Y-rKmNEqdk";

