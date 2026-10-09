/**
 * End-to-end smoke test against a running instance (default localhost:3000).
 * Simulates exactly what the browser does:
 *   sign → PUT bytes to storage → confirm → list → download → delete
 * Usage: node scripts/e2e-test.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

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
const BASE = process.argv[2] || "http://localhost:3000";

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

// Test payload: ~1.2 MB so it also proves multi-MB files work.
const CONTENT = Buffer.alloc(Math.floor((1.2 * 1024 * 1024) / 4) * 4);
for (let i = 0; i + 4 <= CONTENT.length; i += 4) CONTENT.writeUInt32LE(0x44524f50, i); // "PROD"
const FILENAME = `e2e-test-${Date.now()}.bin`;

async function main() {
  console.log(`E2E against ${BASE}\n`);

  // 0. landing page
  const page = await fetch(`${BASE}/`);
  ok("GET / returns 200", page.status === 200, `got ${page.status}`);
  const html = await page.text();
  ok("page renders DropNook branding", html.includes("DropNook"));

  // 1. empty list
  const list0 = await fetch(`${BASE}/api/files`);
  const list0Body = await list0.json();
  ok("GET /api/files returns array", list0.ok && Array.isArray(list0Body.files),
    JSON.stringify(list0Body).slice(0, 200));

  // 1b. storage usage endpoint (powers the header progress bar)
  const stor0 = await fetch(`${BASE}/api/storage`);
  const stor0Body = await stor0.json();
  ok("GET /api/storage returns used+total bytes",
    stor0.ok && Number.isFinite(stor0Body.used) && Number.isFinite(stor0Body.total) && stor0Body.total > 0,
    JSON.stringify(stor0Body).slice(0, 200));
  const used0 = Number(stor0Body.used) || 0;

  // 2. oversized rejection (5 GB + 1 byte metadata → 413)
  const big = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: "huge.bin", size: 5 * 1024 * 1024 * 1024 + 1 }),
  });
  ok("POST /api/upload rejects >5 GB with 413", big.status === 413,
    `got ${big.status}`);

  // 3. sign the upload
  const signRes = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: FILENAME,
      size: CONTENT.length,
      mime_type: "application/octet-stream",
    }),
  });
  const sign = await signRes.json();
  const isB2 = sign.backend === "b2";
  ok("POST /api/upload returns path+token",
    signRes.ok && sign.path && (isB2 ? sign.signedUrl : sign.token),
    JSON.stringify(sign).slice(0, 300));
  if (!sign.path) throw new Error("cannot continue without sign");

  // 4. PUT bytes directly to storage (as the browser does) — Supabase or B2
  const putUrl = isB2
    ? sign.signedUrl
    : `${SUPABASE_URL}/storage/v1/object/upload/sign/uploads/${sign.path}?token=${encodeURIComponent(sign.token)}`;
  const putHeaders = isB2
    ? { "content-type": "application/octet-stream" }
    : {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "x-upsert": "false",
        "content-type": "application/octet-stream",
        "cache-control": "3600",
      };
  const put = await fetch(putUrl, {
    method: "PUT",
    headers: putHeaders,
    body: CONTENT,
  });
  const putText = await put.text();
  ok("direct storage PUT succeeds", put.ok, `${put.status}: ${putText.slice(0, 300)}`);

  // 5. confirm metadata
  const confirmRes = await fetch(`${BASE}/api/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: sign.path,
      filename: FILENAME,
      mime_type: "application/octet-stream",
      size_bytes: CONTENT.length,
    }),
  });
  const confirm = await confirmRes.json();
  ok("POST /api/files creates row", confirmRes.ok && confirm.file?.id,
    JSON.stringify(confirm).slice(0, 300));
  const id = confirm.file?.id;
  if (!id) throw new Error("cannot continue without id");

  // 6. appears in list
  const list1 = await fetch(`${BASE}/api/files`);
  const list1Body = await list1.json();
  ok("file appears in GET /api/files",
    list1Body.files?.some((f) => f.id === id && f.filename === FILENAME));

  // 6b. usage reflects the new file
  const stor1 = await (await fetch(`${BASE}/api/storage`)).json();
  ok("storage used grew by file size",
    Number(stor1.used) === used0 + CONTENT.length,
    `used ${used0} → ${stor1.used}, expected ${used0 + CONTENT.length}`);

  // 7. download redirect + content integrity
  const dl = await fetch(`${BASE}/api/files/${id}`, { redirect: "manual" });
  ok("GET /api/files/[id] issues 307 redirect", dl.status === 307,
    `got ${dl.status}`);
  const signed = dl.headers.get("location");
  ok("redirect targets storage signed URL",
    !!signed &&
      (signed.includes("/storage/v1/object/sign/") ||
        signed.includes("X-Amz-Signature=")),
    signed ?? "(none)");
  if (signed) {
    const body = await fetch(signed);
    ok("download fetch succeeds", body.ok, `got ${body.status}`);
    const bytes = Buffer.from(await body.arrayBuffer());
    ok("downloaded bytes match uploaded bytes",
      bytes.length === CONTENT.length && bytes.equals(CONTENT),
      `len=${bytes.length} vs ${CONTENT.length}`);
  }

  // 8. delete
  const del = await fetch(`${BASE}/api/files/${id}`, { method: "DELETE" });
  ok("DELETE /api/files/[id] succeeds", del.ok, `got ${del.status}`);
  const list2 = await (await fetch(`${BASE}/api/files`)).json();
  ok("file gone from list", !list2.files?.some((f) => f.id === id));

  // 8b. usage dropped back after delete
  const stor2 = await (await fetch(`${BASE}/api/storage`)).json();
  ok("storage used dropped back after delete",
    Number(stor2.used) === used0, `used ${stor2.used}, expected ${used0}`);

  // 9. 404s
  const miss = await fetch(`${BASE}/api/files/00000000-0000-0000-0000-000000000000`);
  ok("GET unknown id returns 404", miss.status === 404, `got ${miss.status}`);

  // ---------- Phase 2: share links / password / limits / zip ----------

  /** Upload a small file exactly like the browser, with optional share rules. */
  async function uploadWithShare(shareOpts, name) {
    const sRes = await fetch(`${BASE}/api/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: name, size: CONTENT.length, mime_type: "application/octet-stream" }),
    });
    const s = await sRes.json();
    if (!sRes.ok) throw new Error(`sign failed: ${JSON.stringify(s)}`);
    const putUrl2 = isB2
      ? s.signedUrl
      : `${SUPABASE_URL}/storage/v1/object/upload/sign/uploads/${s.path}?token=${encodeURIComponent(s.token)}`;
    const pr = await fetch(putUrl2, { method: "PUT", headers: putHeaders, body: CONTENT });
    if (!pr.ok) throw new Error(`PUT failed (${pr.status})`);
    const cRes = await fetch(`${BASE}/api/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: s.path,
        filename: name,
        mime_type: "application/octet-stream",
        size_bytes: CONTENT.length,
        ...shareOpts,
      }),
    });
    const c = await cRes.json();
    if (!cRes.ok) throw new Error(`confirm failed: ${JSON.stringify(c)}`);
    return c.file;
  }

  const stamp = Date.now();

  // 10. shareable link: slug + password + expiry metadata
  const pwFile = await uploadWithShare(
    { password: "hunter2", max_downloads: 5, expires_in_hours: 1 },
    `share-pw-${stamp}.bin`,
  );
  ok("upload with share options stores a slug", !!pwFile.slug,
    JSON.stringify(pwFile).slice(0, 300));

  const sGet = await fetch(`${BASE}/api/share/${pwFile.slug}`);
  const sMeta = await sGet.json();
  ok("GET /api/share/[slug] returns metadata",
    sGet.ok && sMeta.filename === pwFile.filename && sMeta.has_password === true,
    JSON.stringify(sMeta).slice(0, 300));
  ok("share metadata carries expiry + max_downloads",
    !!sMeta.expires_at && sMeta.max_downloads === 5,
    `expires_at=${sMeta.expires_at} max=${sMeta.max_downloads}`);

  const badPw = await fetch(`${BASE}/api/share/${pwFile.slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "wrong" }),
  });
  ok("POST wrong password returns 401", badPw.status === 401, `got ${badPw.status}`);

  const goodPw = await fetch(`${BASE}/api/share/${pwFile.slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "hunter2" }),
  });
  const goodBody = await goodPw.json();
  ok("POST correct password returns download_url",
    goodPw.ok && !!goodBody.download_url,
    JSON.stringify(goodBody).slice(0, 300));
  ok("signed download URL is fetchable", !!goodBody.download_url &&
    (await fetch(goodBody.download_url)).ok);

  const sMeta2 = await (await fetch(`${BASE}/api/share/${pwFile.slug}`)).json();
  ok("download counter incremented after share download",
    sMeta2.download_count === 1, `count=${sMeta2.download_count}`);

  // 11. max-downloads exhaustion (share + raw endpoints both enforce)
  const oneFile = await uploadWithShare({ max_downloads: 1 }, `share-1x-${stamp}.bin`);
  const d1 = await fetch(`${BASE}/api/share/${oneFile.slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  ok("first (and only) download allowed", d1.ok, `got ${d1.status}`);
  const d2 = await fetch(`${BASE}/api/share/${oneFile.slug}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  ok("second download blocked with 410", d2.status === 410, `got ${d2.status}`);
  const gEx = await fetch(`${BASE}/api/share/${oneFile.slug}`);
  ok("GET after exhaustion returns 410", gEx.status === 410, `got ${gEx.status}`);
  const rawEx = await fetch(`${BASE}/api/files/${oneFile.id}`, { redirect: "manual" });
  ok("raw /api/files/[id] also 410 after exhaustion", rawEx.status === 410,
    `got ${rawEx.status}`);

  // 12. public share page renders
  const sp = await fetch(`${BASE}/s/${pwFile.slug}`);
  ok("GET /s/[slug] returns 200", sp.status === 200, `got ${sp.status}`);
  const spHtml = await sp.text();
  // The server shell streams the Suspense fallback ("Loading...").
  ok("share page serves the client shell",
    spHtml.includes("Loading"), `len=${spHtml.length}`);

  // 13. ZIP download-all
  const zip = await fetch(`${BASE}/api/zip?ids=${pwFile.id}`);
  const ctype = zip.headers.get("content-type") || "";
  ok("GET /api/zip responds with zip content-type",
    zip.ok && ctype.includes("zip"), `${zip.status} ${ctype}`);
  const zipBytes = Buffer.from(await zip.arrayBuffer());
  ok("zip payload has PK signature and real bytes",
    zipBytes.length > 100 && zipBytes[0] === 0x50 && zipBytes[1] === 0x4b,
    `len=${zipBytes.length}`);
  const zipBad = await fetch(`${BASE}/api/zip?ids=not-a-uuid`);
  ok("GET /api/zip rejects invalid ids", zipBad.status === 400, `got ${zipBad.status}`);

  // 14. cleanup share fixtures
  for (const f of [pwFile, oneFile]) {
    const cd = await fetch(`${BASE}/api/files/${f.id}`, { method: "DELETE" });
    ok(`cleanup deletes ${f.filename}`, cd.ok, `got ${cd.status}`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exitCode = 1;
});
