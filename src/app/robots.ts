import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt.
 *
 * - Public content (home + legal pages) is fully indexable.
 * - Private/share routes are blocked: /api/* are endpoints, /s/* are the
 *   single-use share links (must never be indexed), and /preview is internal.
 * - AI / LLM crawlers (GPTBot, Claude, Perplexity, Google-Extended, …) are
 *   explicitly allowed so the site can be cited by generative engines (GEO).
 *   Google-Extended powers Gemini/AI Overviews training + grounding.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = ["/api/", "/s/", "/preview"];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
      // --- AI / generative-engine crawlers (GEO) — allowed on purpose ---
      { userAgent: "GPTBot", allow: "/", disallow },
      { userAgent: "OAI-SearchBot", allow: "/", disallow },
      { userAgent: "ChatGPT-User", allow: "/", disallow },
      { userAgent: "ClaudeBot", allow: "/", disallow },
      { userAgent: "Claude-Web", allow: "/", disallow },
      { userAgent: "PerplexityBot", allow: "/", disallow },
      { userAgent: "Google-Extended", allow: "/", disallow },
      { userAgent: "Applebot-Extended", allow: "/", disallow },
      { userAgent: "Bytespider", disallow },
      { userAgent: "CCBot", disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
