// lib/supabase-pikago-admin.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function getPikagoClient(): SupabaseClient {
  const url = process.env.PIKAGO_SUPABASE_URL
  const key = process.env.PIKAGO_SERVICE_ROLE_KEY

  if (!url || !key) {
    // Throwing here makes the API respond with a clear 500 explaining what's missing.
    throw new Error(
      'Missing PIKAGO_SUPABASE_URL or PIKAGO_SERVICE_ROLE_KEY. ' +
        'Set these in .env.local and restart the dev server.'
    )
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// PRIMARY table name can be overridden; we also have a fallback below.
export const PIKAGO_STORE_ADDRESS_TABLE =
  process.env.PIKAGO_STORE_ADDRESS_TABLE || 'store_addresses'

// Useful Postgres error code when a relation (table) is missing.
export const PG_RELATION_MISSING = '42P01'
