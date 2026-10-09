import { chromium } from "@playwright/test";

/**
 * Real-browser UPLOAD test — proves the CORS fix end-to-end in an actual
 * Chromium (the exact scenario that used to fail with "Network error").
 * It drives the file input, waits for the upload to complete, then verifies the
 * file appears in the list, and finally cleans up via the DELETE API.
 *   node scripts/browser-upload-test.mjs [baseUrl]
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

const name = `pw-upload-${Date.now()}.txt`;
const content = `Hello from a real browser upload at ${new Date().toISOString()}\n`;

await page.goto(BASE + "/", { waitUntil: "networkidle" });

// Drive the hidden file input directly (same as the "browse" button does).
await page.setInputFiles('input[type="file"]', {
  name,
  mimeType: "text/plain",
  buffer: Buffer.from(content),
});

// The share dialog opens on the first successful upload — that proves success.
let uploaded = false;
try {
  await page.waitForSelector('[role="dialog"]', { timeout: 25000 });
  uploaded = true;
} catch {
  uploaded = false;
}
check("browser upload completes (share dialog appears)", uploaded);

// Close the share dialog, then confirm the row is present in the list.
if (uploaded) {
  await page.keyboard.press("Escape");
}
await page.waitForTimeout(1200);
const listText = (await page.textContent("body")) ?? "";
check("uploaded file shows in list", listText.includes(name));

// Clean up: find it via the API and delete it.
const res = await page.request.get(BASE + "/api/files");
const body = await res.json();
const row = (body.files ?? []).find((f) => f.filename === name);
if (row) {
  const del = await page.request.fetch(BASE + `/api/files/${row.id}`, { method: "DELETE" });
  check("cleanup delete succeeds", del.ok(), `status=${del.status()}`);
} else {
  check("cleanup found the uploaded row", false, "row not in /api/files");
}

// No CORS / network console errors (the original bug surfaced here).
const relevant = consoleErrors.filter(
  (e) => /network|cors|access-control|failed to fetch|load failed/i.test(e),
);
check("no CORS/network console errors during upload", relevant.length === 0,
  relevant.slice(0, 2).join(" | "));

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
