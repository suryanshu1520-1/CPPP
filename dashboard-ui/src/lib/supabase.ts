import { createClient } from '@supabase/supabase-js';

// The URL and publishable key are public-by-design (Supabase ships them in
// browser bundles on every project); all data access is constrained by RLS:
// read-only on the aggregate tables, insert-only on alert_subscriptions.
// Env vars override the defaults when set (e.g. to point at another project).
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://guispyomolybktujbkxt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_8cUpLq53drZ0_5zCn9FeGA_iEMX8_gK';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});
