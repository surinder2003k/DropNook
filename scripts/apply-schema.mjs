/**
 * Applies supabase/schema.sql to the manas-files Supabase project.
 * Usage: node scripts/apply-schema.mjs   (run from the Dropzone-web folder)
 *
 * Reads .env.local for DROPNOOK_SUPABASE_DB_URL / DATABASE_URL, falls back to the
 * direct connection string for project manas-files.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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
const connectionString = env.DROPNOOK_SUPABASE_DB_URL || env.DATABASE_URL;
if (!connectionString) {
  console.error(
    [
      "Missing DROPNOOK_SUPABASE_DB_URL (or DATABASE_URL).",
      "Set it in .env.local — never hardcode credentials. The direct",
      "`db.<ref>.supabase.co` host is IPv6-only, so use the IPv4 session pooler:",
      "  postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres",
    ].join("\n"),
  );
  process.exit(1);
}

const sql = readFileSync(resolve(root, "supabase", "schema.sql"), "utf8");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log("Connected. Applying schema.sql ...");
  await client.query(sql);
  console.log("Schema applied successfully.");

  const { rows } = await client.query(
    "select column_name, data_type from information_schema.columns where table_schema='public' and table_name='file_uploads' order by ordinal_position",
  );
  console.log("file_uploads columns:", rows);

  const buckets = await client.query(
    "select id, name, public, file_size_limit from storage.buckets where id='uploads'",
  );
  console.log("uploads bucket:", buckets.rows);

  const policies = await client.query(
    "select tablename, policyname from pg_policies where schemaname in ('public','storage') and tablename in ('file_uploads','objects')",
  );
  console.log("relevant policies:", policies.rows);
} catch (err) {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
