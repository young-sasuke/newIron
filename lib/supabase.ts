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

/**
 * Real-time subscription for order status updates
 * Listens for changes in order_status field and triggers notifications
 */
export function subscribeToOrderStatusUpdates(
  onStatusUpdate: (payload: any) => void,
  onError?: (error: any) => void
) {
  const channel = supabase
    .channel('order-status-updates')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: 'order_status=in.("shipped","delivered")'
      },
      (payload) => {
        console.log('Order status updated:', payload)
        onStatusUpdate(payload)
      }
    )
    .on('subscribe', (status) => {
      console.log('Order status subscription status:', status)
    })
    .on('error', (error) => {
      console.error('Order status subscription error:', error)
      if (onError) onError(error)
    })
    .subscribe()

  return () => {
    channel.unsubscribe()
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
    // If we have a session token, use it for authorization
    let headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`
    }

    // Call API route that will update status and trigger notifications
    const response = await fetch('/api/orders/update-status', {
      method: 'POST',
      headers,
      body: JSON.stringify({ 
        orderId, 
        status: newStatus 
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to update order status')
    }

    const result = await response.json()
    console.log('Order status updated successfully:', result)
    return result
  } catch (error) {
    console.error('Error updating order status:', error)
    throw error
  }
}
