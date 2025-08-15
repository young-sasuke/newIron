// app/api/admin/orders/route.ts  (IronXpress)
import { NextRequest, NextResponse } from 'next/server'
import { supabase as supabaseUser } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { adminOperations } from '@/lib/supabase-admin' // kept for admin flows

/* ---------------- auth helpers ---------------- */

/** Internal via shared secret header (used by GET path too) */
function isInternalSharedSecret(req: NextRequest): boolean {
  const xs = req.headers.get('x-shared-secret')?.trim()
  const secret = process.env.PIKAGO_SHARED_SECRET || process.env.INTERNAL_API_SECRET
  return !!xs && !!secret && xs === secret
}

/** Internal via Authorization: Bearer <INTERNAL_API_SECRET> (for PATCH from Pikago) */
function isInternalBearer(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const expected = process.env.INTERNAL_API_SECRET || ''
  return !!token && !!expected && token === expected
}

/** Admin panel JWT auth (unchanged) */
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

/* ---------------- GET (unchanged for panel; supports internal shared secret) ---------------- */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')?.toLowerCase() || null
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.max(1, parseInt(limitParam)) : null

    // A) Internal (Pikago / Postman with shared secret)
    if (isInternalSharedSecret(request)) {
      let q = supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false })
      if (status) q = q.eq('order_status', status)
      if (limit) q = q.limit(limit)
      const { data, error } = await q
      if (error) throw error
      return NextResponse.json({ orders: data ?? [], count: (data ?? []).length })
    }

    // B) Admin panel (Bearer admin JWT)
    const adminCheck = await requireAdminUser(request)
    if (!adminCheck.ok) return adminCheck.res

    if (limit) {
      const { data, error } = await adminOperations.getOrders(limit)
      if (error) throw error
      const filtered = status
        ? (data ?? []).filter((o: any) => (o.order_status || '').toLowerCase() === status)
        : (data ?? [])
      return NextResponse.json({ orders: filtered, count: filtered.length })
    } else {
      const { data, error } = await adminOperations.getOrdersWithCustomers()
      if (error) throw error
      const filtered = status
        ? (data ?? []).filter((o: any) => (o.order_status || '').toLowerCase() === status)
        : (data ?? [])
      return NextResponse.json({ orders: filtered, count: filtered.length })
    }
  } catch (error) {
    console.error('API Error (GET /api/admin/orders):', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/* ---------------- PATCH (extended: supports internal Bearer + existing admin flow) ---------------- */

export async function PATCH(request: NextRequest) {
  try {
    // Path A: Internal service-to-service (used by Pikago)
    if (isInternalBearer(request)) {
      const body = await request.json().catch(() => ({}))
      console.log('[IronXpress PATCH] Received internal request:', JSON.stringify(body, null, 2))

      // accept multiple input shapes
      const id: string =
        String(body?.id ?? body?.orderId ?? body?.order_id ?? '').trim()
      if (!id) {
        console.error('[IronXpress PATCH] Missing order ID')
        return NextResponse.json({ error: 'id is required' }, { status: 400 })
      }

      // allow both `order_status` and legacy `status`
      const incomingStatus = (body?.order_status ?? body?.status) as string | undefined
      const assignedUserId = body?.assigned_user_id as string | undefined

      console.log(`[IronXpress PATCH] Processing order ${id}:`)
      console.log(`[IronXpress PATCH] - Status: ${incomingStatus}`)
      console.log(`[IronXpress PATCH] - Assigned User: ${assignedUserId} (will be ignored - column doesn't exist)`)

      // build a safe patch (exclude assigned_user_id since column doesn't exist in IronXpress)
      const patch: Record<string, any> = { updated_at: new Date().toISOString() }
      if (incomingStatus) patch.order_status = String(incomingStatus)
      // Note: assigned_user_id column doesn't exist in IronXpress orders table, so we ignore it

      if (Object.keys(patch).length === 1) {
        console.error('[IronXpress PATCH] No updatable fields found')
        return NextResponse.json({ error: 'no updatable fields' }, { status: 400 })
      }

      console.log('[IronXpress PATCH] Applying patch:', JSON.stringify(patch, null, 2))

      const { data, error } = await supabaseAdmin
        .from('orders')
        .update(patch)
        .eq('id', id)
        .select('id, order_status, user_id')
        .maybeSingle()

      if (error) {
        console.error('[IronXpress PATCH] Database error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!data) {
        console.error(`[IronXpress PATCH] Order ${id} not found in database`)
        return NextResponse.json({ error: `Order ${id} not found` }, { status: 404 })
      }

      console.log('[IronXpress PATCH] ✅ Order updated successfully:', data)
      console.log('[IronXpress PATCH] 🔔 Database triggers should now fire for notifications')

      // Triggers on IronXpress will fire (e.g., send_order_status_notification)
      return NextResponse.json({ ok: true, updated: data })
    }

    // Path B: Admin panel action (existing behavior, unchanged)
    const adminCheck = await requireAdminUser(request)
    if (!adminCheck.ok) return adminCheck.res

    const body = (await request.json()) as { orderId?: string; status?: string; id?: string; order_status?: string }
    const orderId = String(body?.orderId ?? body?.id ?? '').trim()
    const status = String(body?.status ?? body?.order_status ?? '').trim()

    if (!orderId || !status) {
      return NextResponse.json({ error: 'Missing orderId or status' }, { status: 400 })
    }

    // Update using your admin operations (kept as-is)
    const { data, error } = await adminOperations.updateOrderStatus(orderId, status as any)
    if (error) throw error

    // If accepted/confirmed → ping Pikago to import (kept)
    const shouldNotifyPikago = status.toLowerCase() === 'accepted' || status.toLowerCase() === 'confirmed'
    console.log(`[IronXpress] Should notify Pikago: ${shouldNotifyPikago} (status: ${status})`)
    
    if (shouldNotifyPikago) {
      const pikagoBase = process.env.PIKAGO_BASE_URL || 'http://localhost:3001'
      const shared = process.env.PIKAGO_SHARED_SECRET
      
      console.log(`[IronXpress] Pikago URL: ${pikagoBase}`)
      console.log(`[IronXpress] Shared secret: ${shared ? 'SET' : 'MISSING'}`)
      
      if (!shared) {
        console.warn('[IronXpress] PIKAGO_SHARED_SECRET not set – skipping Pikago import')
      } else {
        try {
          const payload = { orderId, source: 'ironxpress' }
          console.log('[IronXpress] Sending to Pikago:', JSON.stringify(payload, null, 2))
          
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
          console.log(`[IronXpress] Pikago response body: ${responseText}`)
          
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
