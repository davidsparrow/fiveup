// The service-role Supabase client the adapter writes through.
//
// Server-only. The service role bypasses RLS, so this module must never be
// imported from a client component or a route that echoes its results back
// without filtering. It exists because the bot has no member session: every
// RPC it calls re-checks auth.role() = 'service_role' in its own body.

import { createClient } from "@supabase/supabase-js";

let cached = null;

export function hasServiceRoleCredentials() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; the bot cannot reach the database.",
    );
  }

  if (!cached) {
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return cached;
}
