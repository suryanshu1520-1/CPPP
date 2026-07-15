import { createClient } from '@supabase/supabase-js';

// URL + publishable key for the CPPP Watchdog Supabase project. These are
// public-by-design (Supabase ships them in browser bundles on every project);
// all access is constrained by RLS — read-only on the aggregate tables,
// insert-only on alert_subscriptions.
//
// These are the source of truth and are intentionally NOT read from the
// `SUPABASE_URL` / `SUPABASE_ANON_KEY` env vars: Vercel's Supabase integration
// auto-injects those, and a stale value from a previous project silently
// clobbers the client and produces "TypeError: fetch failed" on every route.
// An explicit, app-owned override is still possible via APP_SUPABASE_* (which
// no integration injects), and only when it is a well-formed https URL.
const DEFAULT_URL = 'https://guispyomolybktujbkxt.supabase.co';
const DEFAULT_KEY = 'sb_publishable_8cUpLq53drZ0_5zCn9FeGA_iEMX8_gK';

function resolveUrl() {
  const override = process.env.APP_SUPABASE_URL;
  if (override) {
    try {
      const u = new URL(override);
      if (u.protocol === 'https:') return override;
    } catch {
      // fall through to default
    }
    console.warn('[supabase] Ignoring malformed APP_SUPABASE_URL; using default.');
  }
  return DEFAULT_URL;
}

const SUPABASE_URL = resolveUrl();
const SUPABASE_PUBLISHABLE_KEY = process.env.APP_SUPABASE_KEY || DEFAULT_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
