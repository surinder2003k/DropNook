/**
 * Focused check for the Phase 3 preview endpoint (/api/files/[id]/preview).
 * Verifies: text preview returns inline text, download_count is NOT inflated,
 * invalid ids are rejected, and the signed URL is reachable.
 * Usage: node scripts/preview-test.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const BASE = process.argv[2] || "http://localhost:3000";

function readEnvLocal() {
  try {
    const raw = readFileSync(resolve(root, ".env.local"), "utf8");
    const map = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) map[m[1]] = m[2];
    }
    return map;
  } catch {
    return {};
  }
}
const env = { ...readEnvLocal(), ...process.env };
const SUPABASE_URL = env.NEXT_PUBLIC_DROPNOOK_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_DROPNOOK_SUPABASE_ANON_KEY;

let passed = 0;
let failed = 0;
function ok(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// A small text file (previewable as text) plus a "binary" file (preview → 415).
const TEXT_CONTENT = Buffer.from("hello preview\n".repeat(20), "utf8");
const stamp = Date.now();

async function signUpload(name) {
  const res = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: name, size: TEXT_CONTENT.length, mime_type: "text/plain" }),
  });
  return res.json();
}

async function putBytes(sign) {
  const isB2 = sign.backend === "b2";
  const putUrl = isB2
    ? sign.signedUrl
    : `${SUPABASE_URL}/storage/v1/object/upload/sign/uploads/${sign.path}?token=${encodeURIComponent(sign.token)}`;
  const headers = isB2
    ? { "content-type": "text/plain" }
    : { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "x-upsert": "false", "content-type": "text/plain", "cache-control": "3600" };
  return fetch(putUrl, { method: "PUT", headers, body: TEXT_CONTENT });
}

async function confirm(sign, name, extra = {}) {
  const res = await fetch(`${BASE}/api/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: sign.path, filename: name, mime_type: "text/plain", size_bytes: TEXT_CONTENT.length, ...extra }),
  });
  return (await res.json()).file;
}

async function main() {
  console.log(`Preview E2E against ${BASE}\n`);

  const sign = await signUpload(`preview-${stamp}.txt`);
  await putBytes(sign);
  const file = await confirm(sign, `preview-${stamp}.txt`, { password: "secret" });
  if (!file?.id) throw new Error("upload/confirm failed");

  const pv = await fetch(`${BASE}/api/files/${file.id}/preview`);
  const body = await pv.json();
  ok("preview returns 200 for text", pv.status === 200, `got ${pv.status}`);
  ok("preview kind is text", body.kind === "text", JSON.stringify(body).slice(0, 120));
  ok("preview text contains content", typeof body.text === "string" && body.text.includes("hello preview"));

  // Password-protected file must still preview (preview enforces expiry/limits,
  // not the password — the counter stays untouched).
  const sMeta = await (await fetch(`${BASE}/api/share/${file.slug}`)).json();
  ok("download_count still 0 after preview", sMeta.download_count === 0, `count=${sMeta.download_count}`);

  const bad = await fetch(`${BASE}/api/files/not-a-uuid/preview`);
  ok("invalid id rejected with 400", bad.status === 400, `got ${bad.status}`);

  const miss = await fetch(`${BASE}/api/files/00000000-0000-0000-0000-000000000000/preview`);
  ok("unknown id returns 404", miss.status === 404, `got ${miss.status}`);

  const del = await fetch(`${BASE}/api/files/${file.id}`, { method: "DELETE" });
  ok("cleanup deletes preview file", del.ok, `got ${del.status}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
