// lib/supabase.ts
import {
  createClient,
  type SupabaseClient,
  type RealtimeChannel,
  type RealtimePostgresUpdatePayload,
} from '@supabase/supabase-js'

// These are safe to be exposed on the client
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  (() => {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  })()

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  (() => {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')
  })()

/**
 * Single browser Supabase client.
 * Use this in client components/hooks.
 */
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Utility for SSR/server actions (still anon role).
 * For server-only admin work, use lib/supabase-admin.ts.
 */
export function getSupabaseClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey)
}

/**
 * Real-time subscription for order status updates
 * Listens for changes in order_status field and triggers notifications
 * Supabase v2: use .subscribe(cb) instead of .on('subscribe', ...)
 */
export function subscribeToOrderStatusUpdates(
  onStatusUpdate: (payload: RealtimePostgresUpdatePayload<any>) => void,
  onError?: (error: Error) => void
) {
  const channel: RealtimeChannel = supabase
    .channel('order-status-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: 'order_status=in.("shipped","delivered")',
      },
      (payload) => {
        // type-narrow payload if you have generated types for your DB
        onStatusUpdate(payload as RealtimePostgresUpdatePayload<any>)
      }
    )
    .subscribe((status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED') => {
      console.log('Order status subscription status:', status)
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        onError?.(new Error(`Realtime channel status: ${status}`))
      }
    })

  return () => {
    try {
      channel.unsubscribe()
    } catch {
      // ignore
    }
  }
}

/**
 * Update order status and trigger notifications
 * This should be used by rider apps or admin interfaces
 */
export async function updateOrderStatusWithNotification(
  orderId: string,
  newStatus: 'shipped' | 'delivered',
  sessionToken?: string
) {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`

    // NOTE: keep this path if you have /api/orders/update-status;
    // if your route is /api/admin/orders (PATCH), adjust accordingly.
    const response = await fetch('/api/orders/update-status', {
      method: 'POST',
      headers,
      body: JSON.stringify({ orderId, status: newStatus }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => null)
      throw new Error(error?.message || 'Failed to update order status')
    }

    const result = await response.json()
    console.log('Order status updated successfully:', result)
    return result
  } catch (error) {
    console.error('Error updating order status:', error)
    throw error
  }
}
