import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;

/** True when the Supabase env vars are present. Without them the site runs on the built-in static menu. */
export const backendConfigured = Boolean(url && key);

/**
 * Public-site client: anonymous, no session storage. It can only do what the
 * Row Level Security policies allow a visitor to do (read the menu, add a lead).
 */
export const publicClient: SupabaseClient | null = backendConfigured
  ? createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

/** Admin client: keeps the owner's login session in this browser. Used only by /admin. */
export function createAdminClient(): SupabaseClient | null {
  return backendConfigured ? createClient(url!, key!) : null;
}
