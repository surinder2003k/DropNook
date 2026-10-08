import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_DROPNOOK_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_DROPNOOK_SUPABASE_ANON_KEY!;

/** Browser/client-side Supabase client (anon / publishable key). */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Server-side Supabase client (used in route handlers only — never expose
 * the returned client to the browser).
 *
 * Uses DROPNOOK_SUPABASE_SERVICE_ROLE_KEY when it looks like a real API key
 * (`sb_secret_…` / `eyJ…`). Otherwise falls back to the publishable key:
 * this app is intentionally no-auth and its RLS policies are permissive
 * (select/insert/delete on file_uploads, full CRUD on the uploads bucket),
 * so publishable-level access performs every operation the API routes need.
 */
export function getSupabaseServer(): SupabaseClient {
  const serviceRoleKey = process.env.DROPNOOK_SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_DROPNOOK_SUPABASE_ANON_KEY;
  const isApiKey = (v?: string) =>
    !!v && (v.startsWith("sb_secret_") || v.startsWith("eyJ")) && v.length > 40;
  const key = isApiKey(serviceRoleKey) ? serviceRoleKey! : publishableKey;
  if (!key) {
    throw new Error(
      "No Supabase API key configured — set NEXT_PUBLIC_DROPNOOK_SUPABASE_ANON_KEY (and optionally DROPNOOK_SUPABASE_SERVICE_ROLE_KEY) in .env.local",
    );
  }
  if (!isApiKey(serviceRoleKey)) {
    console.warn(
      "[supabase] DROPNOOK_SUPABASE_SERVICE_ROLE_KEY missing or invalid — using the publishable key (RLS is permissive by design).",
    );
  }
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

