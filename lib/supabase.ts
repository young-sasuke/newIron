// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

// These are safe to be exposed on the client
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  (() => { throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL') })()

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  (() => { throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY') })()

/**
 * Single browser Supabase client.
 * Use this in client components/hooks.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Utility for SSR/server actions (still anon role).
 * For server-only admin work, use lib/supabase-admin.ts.
 */
export function getSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}
