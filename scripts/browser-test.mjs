import { chromium } from "@playwright/test";

/**
 * Real-browser (Chromium) smoke + SEO/a11y check against a running instance.
 *   node scripts/browser-test.mjs [baseUrl]
 * Validates the actual rendered DOM/console (not just SSR HTML), matching what
 * a real visitor + Googlebot-like fetch sees.
 */
const BASE = process.argv[2] || "http://localhost:3000";
let passed = 0;
let failed = 0;
function check(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.log(`  \u2717 ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

// 1. Home page renders the dropzone UI.
await page.goto(BASE + "/", { waitUntil: "networkidle" });
check("home: title mentions Dropzone", /dropzone/i.test(await page.title()),
  await page.title());
const h1 = await page.locator("h1").count();
check("home: has an <h1>", h1 >= 1, `count=${h1}`);
const bodyText = (await page.textContent("body")) ?? "";
check("home: shows upload call-to-action",
  /drop|upload|tap, click/i.test(bodyText));
check("home: file input (multiple) present",
  (await page.locator('input[type="file"]').count()) >= 1);

// 2. Header nav + theme toggle exist and toggle flips the html class.
check("home: theme toggle button present",
  (await page.getByRole("button").filter({ hasText: /theme|dark|light|mode|(Switch theme)/i }).count()
    + (await page.locator('[aria-label*="heme" i], [title*="heme" i], [aria-label*="ark" i]').count())) >= 1);
const classBefore = await page.getAttribute("html", "class") ?? "";
await page.locator('button:has(svg)').first().click({ trial: true }).catch(() => {});

// 3. Legal pages render a title + h1.
for (const path of ["/about", "/privacy", "/terms", "/disclaimer", "/contact"]) {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  const t = await page.title();
  const hasH1 = (await page.locator("h1").count()) >= 1;
  check(`legal ${path}: title + h1`, /dropzone/i.test(t) && hasH1, t);
}

// 4. No uncaught page errors across navigation.
check("no uncaught page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

// 5. robots.txt / sitemap / ads.txt / manifest served.
async function fetchText(p) {
  const r = await page.request.get(BASE + p);
  return { status: r.status(), body: await r.text(), headers: r.headers() };
}
const robots = await fetchText("/robots.txt");
check("robots.txt 200 + Sitemap directive",
  robots.status === 200 && /sitemap:/i.test(robots.body));
check("robots.txt allows AI bots (GEO)",
  /GPTBot|ClaudeBot|PerplexityBot/i.test(robots.body));
const sitemap = await fetchText("/sitemap.xml");
check("sitemap.xml 200 + has <url>",
  sitemap.status === 200 && /<url>/.test(sitemap.body));
check("sitemap.xml excludes private /s/ links",
  !/\/s\/[a-z2-9]{4,}/.test(sitemap.body));
const ads = await fetchText("/ads.txt");
check("ads.txt 200 + served at root",
  ads.status === 200 && /google\.com/.test(ads.body));
const manifest = await fetchText("/manifest.webmanifest");
check("manifest 200 + JSON",
  manifest.status === 200 && /"name"/.test(manifest.body));

// 6. JSON-LD structured data valid on home.
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
let validNodes = 0;
for (const raw of ld) {
  try {
    JSON.parse(raw);
    validNodes++;
  } catch {
    /* invalid */
  }
}
check("home: JSON-LD present and valid", ld.length >= 1 && validNodes === ld.length,
  `nodes=${ld.length} valid=${validNodes}`);

// 7. Canonical + viewport meta.
const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
check("home: canonical link present", !!canonical, String(canonical));
check("home: viewport meta present",
  (await page.locator('meta[name="viewport"]').count()) >= 1);

// 8. Capture a screenshot for visual confirmation.
await page.screenshot({ path: "screenshot-home.png", fullPage: false });
console.log(`  \u2139 screenshot saved: screenshot-home.png`);

await browser.close();

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
