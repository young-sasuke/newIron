// app/api/admin/orders/route.ts (IronXpress)
import { NextRequest, NextResponse } from 'next/server'
import { supabase as supabaseUser } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { adminOperations } from '@/lib/supabase-admin'
import {
  getPikagoClient,
  PIKAGO_STORE_ADDRESS_TABLE,
  PG_RELATION_MISSING,
} from '@/lib/supabase-pikago-admin'
import { notifyOrderStatusChange } from '@/lib/notification-hooks'

/* ---------------- auth helpers ---------------- */

function isInternalSharedSecret(req: NextRequest): boolean {
  const xs = req.headers.get('x-shared-secret')?.trim()
  const secret = process.env.PIKAGO_SHARED_SECRET || process.env.INTERNAL_API_SECRET
  return !!xs && !!secret && xs === secret
}

function isInternalBearer(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const expected = process.env.INTERNAL_API_SECRET || ''
  return !!token && !!expected && token === expected
}

async function requireAdminUser(
  req: NextRequest
): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, res: NextResponse.json({ error: 'No authorization header' }, { status: 401 }) }
  }
  const token = authHeader.slice('Bearer '.length).trim()
  const {
    data: { user },
    error,
  } = await supabaseUser.auth.getUser(token)
  if (error || !user) {
    return { ok: false, res: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }
  const userMetadata = user.user_metadata || {}
  const appMetadata = user.app_metadata || {}
  const isAdmin = userMetadata.role === 'admin' || appMetadata.role === 'admin'
  if (!isAdmin) {
    return { ok: false, res: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  return { ok: true, userId: user.id }
}

/* --------- helpers: read DEFAULT store address from Pikago DB ---------- */

async function fetchDefaultStoreAddressFromPikago() {
  try {
    const client = getPikagoClient()
    const candidates = [PIKAGO_STORE_ADDRESS_TABLE, 'store_address']

    // Prefer explicitly-marked default
    for (const t of candidates) {
      const { data, error } = await client.from(t).select('*').eq('is_default', true).limit(1)
      if (!error && Array.isArray(data) && data.length) return { table: t, row: data[0] }
      if (error && error.code !== PG_RELATION_MISSING) {
        console.warn('[orders] fetch default (explicit) error', error)
        return null
      }
    }

    // Fallback: first created
    for (const t of candidates) {
      const { data, error } = await client.from(t).select('*').order('created_at', { ascending: true }).limit(1)
      if (!error && Array.isArray(data) && data.length) return { table: t, row: data[0] }
      if (error && error.code !== PG_RELATION_MISSING) {
        console.warn('[orders] fetch default (first) error', error)
        return null
      }
    }
  } catch (e) {
    console.warn('[orders] fetchDefaultStoreAddressFromPikago fatal:', e)
  }
  return null
}

/* ---------------- GET ---------------- */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')?.toLowerCase() || null
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.max(1, parseInt(limitParam)) : null

    if (isInternalSharedSecret(request)) {
      let q = supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false })
      if (status) q = q.eq('order_status', status)
      if (limit) q = q.limit(limit)
      const { data, error } = await q
      if (error) throw error
      return NextResponse.json({ orders: data ?? [], count: (data ?? []).length })
    }

    const adminCheck = await requireAdminUser(request)
    if (!adminCheck.ok) return adminCheck.res

    // Fetch orders
    let ordersData;
    if (limit) {
      const { data, error } = await adminOperations.getOrders(limit)
      if (error) throw error
      ordersData = data ?? []
    } else {
      const { data, error } = await adminOperations.getOrdersWithCustomers()
      if (error) throw error
      ordersData = data ?? []
    }

    // Fetch customer profiles based on user_ids
    const userIds = Array.from(
      new Set(ordersData.map((o: any) => o.user_id).filter(Boolean))
    )

    let profileMap: Record<string, any> = {}
    if (userIds.length) {
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from('user_profiles')
        .select('user_id, first_name, last_name, email, phone_number')
        .in('user_id', userIds)

      if (pErr) {
        console.warn('Error fetching profiles:', pErr)
      } else {
        profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]))
      }
    }

    // Merge profile data with orders
    const shapedOrders = ordersData.map((o: any) => {
      const profile = profileMap[o.user_id] || {}
      return {
        ...o,
        full_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown Customer',
        email: profile.email || null,
        phone: profile.phone_number || null,
      }
    })

    // Filter by status if provided
    const filteredOrders = status
      ? shapedOrders.filter((o: any) => (o.order_status || '').toLowerCase() === status)
      : shapedOrders

    return NextResponse.json({ orders: filteredOrders, count: filteredOrders.length })
  } catch (error) {
    console.error('API Error (GET /api/admin/orders):', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/* ---------------- PATCH ---------------- */

export async function PATCH(request: NextRequest) {
  try {
    // A) internal service-to-service auth (Bearer or x-shared-secret)
    if (isInternalBearer(request) || isInternalSharedSecret(request)) {
      const authType = isInternalBearer(request) ? 'Bearer' : 'x-shared-secret'
      console.log(`[IX Admin Orders] 🔐 Service auth via ${authType}`)
      
      const body = await request.json().catch(() => ({}))
      const id: string = String(body?.id ?? body?.orderId ?? body?.order_id ?? '').trim()
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

      const incomingStatus = (body?.order_status ?? body?.status) as string | undefined
      const patch: Record<string, any> = { updated_at: new Date().toISOString() }
      if (incomingStatus) {
        patch.order_status = String(incomingStatus)
        console.log(`[IX Admin Orders] 🔄 Updating order ${id}: ${patch.order_status}`)
      }

      const { data, error } = await supabaseAdmin
        .from('orders')
        .update(patch)
        .eq('id', id)
        .select('id, order_status, user_id')
        .maybeSingle()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data) return NextResponse.json({ error: `Order ${id} not found` }, { status: 404 })
      
      console.log(`[IX Admin Orders] ✅ Updated order ${id} to ${data.order_status}`)
      return NextResponse.json({ ok: true, updated: data })
    }

    // B) Admin panel action
    const adminCheck = await requireAdminUser(request)
    if (!adminCheck.ok) return adminCheck.res

    const body = (await request.json()) as { orderId?: string; status?: string; id?: string; order_status?: string }
    const orderId = String(body?.orderId ?? body?.id ?? '').trim()
    const status = String(body?.status ?? body?.order_status ?? '').trim()

    if (!orderId || !status) {
      return NextResponse.json({ error: 'Missing orderId or status' }, { status: 400 })
    }

    // Get current status for notification comparison
    const { data: currentOrder } = await supabaseAdmin
      .from('orders')
      .select('order_status')
      .eq('id', orderId)
      .single()
    const previousStatus = currentOrder?.order_status

    // Update status in IX
    const { data, error } = await adminOperations.updateOrderStatus(orderId, status as any)
    if (error) throw error

    // Trigger notification hooks asynchronously (don't wait/block the response)
    if (previousStatus !== status) {
      notifyOrderStatusChange(orderId, status, previousStatus)
        .then(success => {
          if (success) {
            console.log(`[API] ✅ Notification sent for order ${orderId}: ${previousStatus} → ${status}`);
          } else {
            console.warn(`[API] ⚠️ Notification failed for order ${orderId}: ${previousStatus} → ${status}`);
          }
        })
        .catch(error => {
          console.error(`[API] ❌ Notification error for order ${orderId}:`, error);
        });
    }

    // If accepted/confirmed -> notify Pikago with pickup address
    const shouldNotifyPikago = status.toLowerCase() === 'accepted' || status.toLowerCase() === 'confirmed'
    if (shouldNotifyPikago) {
      const pikagoBase = process.env.PIKAGO_BASE_URL || 'http://localhost:3001'
      const shared = process.env.PIKAGO_SHARED_SECRET

      if (!shared) {
        console.warn('[IronXpress] PIKAGO_SHARED_SECRET not set – skipping Pikago import')
      } else {
        try {
          const addr = await fetchDefaultStoreAddressFromPikago()
          // Shape BOTH id + full object so PG can consume either (with lat/lng)
          const payload: any = { orderId, source: 'ironxpress' }
          if (addr?.row) {
            const addressObj = addr.row.address || {}
            payload.store_address_id = addr.row.id
            payload.store_address = {
              id: addr.row.id,
              name: addr.row.name,
              address: {
                ...addressObj,
                // Ensure lat/lng are included if available
                latitude: addressObj.latitude || addressObj.lat || null,
                longitude: addressObj.longitude || addressObj.lng || null,
              },
              is_default: !!(addr.row.is_default ?? addr.row.address?.is_default),
            }
            console.log(`[IX Orders] 🗺️ Including store address with lat/lng:`, {
              id: payload.store_address.id,
              name: payload.store_address.name,
              hasLatLng: !!(payload.store_address.address?.latitude && payload.store_address.address?.longitude)
            })
          }

          console.log('[IronXpress] Sending to Pikago /api/import-order:', JSON.stringify(payload, null, 2))

          const res = await fetch(`${pikagoBase}/api/import-order`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-shared-secret': shared,
            },
            body: JSON.stringify(payload),
          })

          const responseText = await res.text()
          console.log(`[IronXpress] Pikago response: ${res.status}`)  
          if (!res.ok) {
            console.error('[IronXpress] Pikago import failed', res.status, responseText)
          } else {
            console.log('[IronXpress] ✅ Pikago import successful!')
          }
        } catch (e) {
          console.error('[IronXpress] Error calling Pikago import-order:', e)
        }
      }
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('API Error (PATCH /api/admin/orders):', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}  
