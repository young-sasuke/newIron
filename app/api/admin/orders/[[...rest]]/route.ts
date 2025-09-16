// app/api/admin/orders/[[...rest]]/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabase as supabaseUser } from '@/lib/supabase'
import {
  getPikagoClient,
  PIKAGO_STORE_ADDRESS_TABLE,
  PG_RELATION_MISSING,
} from '@/lib/supabase-pikago-admin'
import { notifyOrderStatusChange } from '@/lib/notification-hooks'

/** HEAD avoids odd auto-redirects; note params is a Promise in Next 15 */
export async function HEAD(
  _req: NextRequest,
  { params }: { params: Promise<{ rest?: string[] }> }
) {
  const { rest } = await params
  if (rest?.length) return new Response(null, { status: 404 })
  return new Response(null, { status: 204 })
}

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
      if (error && error.code !== PG_RELATION_MISSING) return null
    }

    // Fallback: first created
    for (const t of candidates) {
      const { data, error } = await client.from(t).select('*').order('created_at', { ascending: true }).limit(1)
      if (!error && Array.isArray(data) && data.length) return { table: t, row: data[0] }
      if (error && error.code !== PG_RELATION_MISSING) return null
    }
  } catch {
    // noop
  }
  return null
}

/* ---------------- GET ---------------- */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ rest?: string[] }> }
) {
  try {
    const { rest } = await params
    // Guard: only allow /api/admin/orders and /api/admin/orders/
    if (rest?.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { supabaseAdmin, adminOperations } = await import('@/lib/supabase-admin')

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')?.toLowerCase() || null
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.max(1, parseInt(limitParam)) : null

    // A) Internal service call (shared secret) – direct DB select
    if (isInternalSharedSecret(request)) {
      let q = supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false })
      if (status) q = q.eq('order_status', status)
      if (limit) q = q.limit(limit)
      const { data, error } = await q
      if (error) throw error
      return NextResponse.json(
        { orders: data ?? [], count: (data ?? []).length },
        { headers: { 'X-API': 'orders-internal' } }
      )
    }

    // B) Admin panel call (Bearer token)
    const adminCheck = await requireAdminUser(request)
    if (!adminCheck.ok) return adminCheck.res

    // Fetch orders via admin ops
    let ordersData: any[] = []
    if (limit) {
      const { data, error } = await adminOperations.getOrders(limit)
      if (error) throw error
      ordersData = data ?? []
    } else {
      const { data, error } = await adminOperations.getOrdersWithCustomers()
      if (error) throw error
      ordersData = data ?? []
    }

    // Enrich with customer profiles
    const userIds = Array.from(new Set(ordersData.map((o: any) => o.user_id).filter(Boolean)))
    let profileMap: Record<string, any> = {}
    if (userIds.length) {
      const { data: profiles, error: pErr } = await supabaseAdmin
        .from('user_profiles')
        .select('user_id, first_name, last_name, email, phone_number')
        .in('user_id', userIds)
      if (!pErr && profiles) profileMap = Object.fromEntries(profiles.map((p: any) => [p.user_id, p]))
    }

    const shapedOrders = ordersData.map((o: any) => {
      const profile = profileMap[o.user_id] || {}
      return {
        ...o,
        full_name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown Customer',
        email: profile.email || null,
        phone: profile.phone_number || null,
      }
    })

    const filteredOrders = status
      ? shapedOrders.filter((o: any) => (o.order_status || '').toLowerCase() === status)
      : shapedOrders

    return NextResponse.json(
      { orders: filteredOrders, count: filteredOrders.length },
      { headers: { 'X-API': 'orders-ok' } }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: { 'X-API': 'orders-error' } }
    )
  }
}

/* ---------------- PATCH ---------------- */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ rest?: string[] }> }
) {
  try {
    const { rest } = await params
    if (rest?.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // A) Internal service-to-service auth (Bearer or x-shared-secret)
    if (isInternalBearer(request) || isInternalSharedSecret(request)) {
      const { supabaseAdmin } = await import('@/lib/supabase-admin')

      const body = await request.json().catch(() => ({}))
      const id: string = String(body?.id ?? body?.orderId ?? body?.order_id ?? '').trim()
      if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

      const incomingStatus = (body?.order_status ?? body?.status) as string | undefined
      const patch: Record<string, any> = { updated_at: new Date().toISOString() }
      if (incomingStatus) patch.order_status = String(incomingStatus)

      const { data, error } = await supabaseAdmin
        .from('orders')
        .update(patch)
        .eq('id', id)
        .select('id, order_status, user_id')
        .maybeSingle()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data) return NextResponse.json({ error: `Order ${id} not found` }, { status: 404 })

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

    const { supabaseAdmin, adminOperations } = await import('@/lib/supabase-admin')

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

    // Trigger notification hooks asynchronously
    if (previousStatus !== status) {
      notifyOrderStatusChange(orderId, status, previousStatus).catch(() => {})
    }

    // If accepted/confirmed -> notify Pikago with pickup address
    const shouldNotifyPikago = status.toLowerCase() === 'accepted' || status.toLowerCase() === 'confirmed'
    if (shouldNotifyPikago) {
      const pikagoBase = process.env.PIKAGO_BASE_URL || 'http://localhost:3001'
      const shared = process.env.PIKAGO_SHARED_SECRET
      if (shared) {
        try {
          const addr = await fetchDefaultStoreAddressFromPikago()
          const payload: any = { orderId, source: 'ironxpress' }
          if (addr?.row) {
            const addressObj = addr.row.address || {}
            payload.store_address_id = addr.row.id
            payload.store_address = {
              id: addr.row.id,
              name: addr.row.name,
              address: {
                ...addressObj,
                latitude: addressObj.latitude || addressObj.lat || null,
                longitude: addressObj.longitude || addressObj.lng || null,
              },
              is_default: !!(addr.row.is_default ?? addr.row.address?.is_default),
            }
          }
          await fetch(`${pikagoBase}/api/import-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-shared-secret': shared },
            body: JSON.stringify(payload),
          })
        } catch {
          // noop
        }
      }
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
