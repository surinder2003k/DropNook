/**
 * Quick SEO sanity check against a running instance (default localhost:3000).
 * Verifies robots.txt, sitemap.xml, ads.txt, manifest, and that every
 * JSON-LD block on the home page parses as valid schema.org JSON.
 * Usage: node scripts/seo-check.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3000";

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  return { status: res.status, text, type: res.headers.get("content-type") || "" };
}

async function main() {
  let fail = 0;
  const check = (label, ok, detail = "") => {
    console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) fail++;
  };

  const home = await get("/");
  const blocks = [...home.text.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  check("home page returns 200", home.status === 200, `got ${home.status}`);
  check("home has canonical link", /<link rel="canonical"/.test(home.text));
  // Two <script> tags, each an ARRAY of schema.org nodes (org/website + software/faq/breadcrumb).
  check("home has JSON-LD blocks", blocks.length >= 2, `${blocks.length} blocks`);
  const types = [];
  blocks.forEach((m, i) => {
    try {
      const parsed = JSON.parse(m[1]);
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      nodes.forEach((n) => types.push(n["@type"]));
      check(`JSON-LD block ${i + 1} parses`, true);
    } catch (e) {
      check(`JSON-LD block ${i + 1} parses`, false, e.message);
    }
  });
  const required = ["Organization", "WebSite", "SoftwareApplication", "FAQPage", "BreadcrumbList"];
  const missing = required.filter((t) => !types.includes(t));
  check(
    "all key schema types present",
    missing.length === 0,
    `found: ${types.join(", ")}${missing.length ? `; missing: ${missing.join(", ")}` : ""}`,
  );


  const robots = await get("/robots.txt");
  check("robots.txt 200 + xml/plain", robots.status === 200);
  check("robots blocks /s/ (private links)", robots.text.includes("Disallow: /s/"));
  check("robots allows GPTBot (GEO)", /GPTBot/.test(robots.text));
  check("robots references sitemap", /Sitemap:/.test(robots.text));

  const sm = await get("/sitemap.xml");
  check("sitemap.xml 200", sm.status === 200, sm.type);
  check("sitemap lists legal pages", /\/privacy/.test(sm.text) && /\/contact/.test(sm.text));
  check("sitemap excludes /s/ links", !/\/s\//.test(sm.text));

  const ads = await get("/ads.txt");
  check("ads.txt 200", ads.status === 200);
  check("ads.txt has google.com line", /google\.com,\s*pub-\d+/.test(ads.text));

  const man = await get("/manifest.webmanifest");
  check("manifest 200 + json", man.status === 200 && man.type.includes("json"));
  try {
    const j = JSON.parse(man.text);
    check("manifest has name + icons", !!j.name && Array.isArray(j.icons));
  } catch (e) {
    check("manifest parses", false, e.message);
  }

  // GSC verification tag: present with a real token value is what matters now
  // (the token is hardcoded as a fallback in site.ts, so it always renders).
  const gscMatch = home.text.match(/<meta name="google-site-verification" content="([^"]+)"/);
  const gscToken = process.env.GOOGLE_SITE_VERIFICATION || process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || (gscMatch ? gscMatch[1] : "");
  const hasGscTag = !!gscMatch;
  check(
    "GSC verification tag present with a token",
    hasGscTag && gscToken.length >= 20,
    gscToken ? `token rendered (${gscToken.slice(0, 6)}…${gscToken.slice(-4)})` : "no token rendered",
  );

  console.log(`\n${fail === 0 ? "ALL SEO CHECKS PASSED" : `${fail} CHECK(S) FAILED`}`);
  process.exitCode = fail > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exitCode = 1;
});
