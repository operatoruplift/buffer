import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseFetch } from './auth-flow';
import { createIdentityBoundAuthStorage } from './auth-storage';

let client: SupabaseClient | null = null;
/** Browser-only public credentials. Authorization is enforced by database RLS. */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, {
    global: { fetch: createSupabaseFetch(url) },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: createIdentityBoundAuthStorage(url) },
  });
  return client;
}
