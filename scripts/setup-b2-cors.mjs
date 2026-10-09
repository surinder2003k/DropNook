/**
 * One-time setup: configure CORS rules on the Backblaze B2 bucket.
 *
 * WHY THIS EXISTS
 * ----------------
 * The browser uploads file bytes DIRECTLY to a presigned B2 URL using
 * XMLHttpRequest, and sets custom headers (content-type, cache-control).
 * Custom headers trigger a CORS preflight (an OPTIONS request) that B2 must
 * answer with Access-Control-Allow-* headers. B2 buckets start with NO CORS
 * rules, so the preflight is rejected and the real PUT is blocked by the
 * browser — surfacing as "Network error — check your connection" even though
 * server-side uploads (curl/Node, which ignore CORS) work fine.
 *
 * Run once after pointing DROPNOOK_B2_* at a new bucket:
 *     node scripts/setup-b2-cors.mjs [origin ...]
 *
 * With no origins passed, it allows any origin (allowedOrigins: ["*"]) — fine
 * for a public, anonymous, no-auth handoff tool where the presigned URL itself
 * is the security boundary. To lock it down, pass your exact origins:
 *     node scripts/setup-b2-cors.mjs http://localhost:3000 https://dropnook.vercel.app
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
const ACCESS_KEY_ID = env.DROPNOOK_B2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = env.DROPNOOK_B2_SECRET_ACCESS_KEY;
const BUCKET = env.DROPNOOK_B2_BUCKET;

// Origins allowed to call storage from the browser. Default: any origin.
const origins =
  process.argv.length > 2
    ? process.argv.slice(2)
    : ["*"];

if (!ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET) {
  console.error(
    "Missing B2 config — set DROPNOOK_B2_ACCESS_KEY_ID, DROPNOOK_B2_SECRET_ACCESS_KEY and DROPNOOK_B2_BUCKET in .env.local",
  );
  process.exit(1);
}

// Operations the browser needs: PUT to upload, GET to download/preview,
// HEAD for existence/size checks. (POST/DELETE are for multipart — not used yet.)
const corsRules = [
  {
    corsRuleName: "dropnook-browser",
    allowedOrigins: origins,
    allowedOperations: ["s3_put", "s3_get", "s3_head"],
    allowedHeaders: ["*"],
    exposeHeaders: ["ETag", "Content-Length", "Content-Type", "Content-Disposition"],
    maxAgeSeconds: 3600,
  },
];

async function main() {
  console.log(`Configuring CORS for B2 bucket "${BUCKET}"…\n`);

  // 1. Authorize → accountId + apiUrl + authorizationToken
  const basic = Buffer.from(`${ACCESS_KEY_ID}:${SECRET_ACCESS_KEY}`).toString("base64");
  const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!authRes.ok) {
    throw new Error(`b2_authorize_account failed (${authRes.status}): ${await authRes.text()}`);
  }
  const auth = await authRes.json();
  const headers = {
    Authorization: auth.authorizationToken,
    "Content-Type": "application/json",
  };

  // 2. Resolve the bucket name → bucketId
  const listRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
    method: "POST",
    headers,
    body: JSON.stringify({ accountId: auth.accountId, bucketName: BUCKET }),
  });
  if (!listRes.ok) {
    throw new Error(`b2_list_buckets failed (${listRes.status}): ${await listRes.text()}`);
  }
  const bucketId = (await listRes.json()).buckets?.[0]?.bucketId;
  if (!bucketId) {
    throw new Error(`Bucket "${BUCKET}" not found on this account`);
  }

  // 3. Apply the CORS rules
  const updRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_update_bucket`, {
    method: "POST",
    headers,
    body: JSON.stringify({ accountId: auth.accountId, bucketId, corsRules }),
  });
  if (!updRes.ok) {
    throw new Error(`b2_update_bucket failed (${updRes.status}): ${await updRes.text()}`);
  }

  console.log("✅ CORS rules applied:");
  console.log(`   bucketId       ${bucketId}`);
  console.log(`   allowedOrigins ${JSON.stringify(origins)}`);
  console.log(`   operations     s3_put, s3_get, s3_head`);
  console.log("\nBrowser uploads should work now. Hard-refresh the site and retry.");
}

main().catch((err) => {
  console.error("\n❌ Failed to configure CORS:");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
