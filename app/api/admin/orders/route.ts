// app/api/admin/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase as supabaseUser } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { adminOperations } from '@/lib/supabase-admin' // keep if you use it elsewhere

/**
 * Accept BOTH:
 *  - Internal calls:       x-shared-secret: <PIKAGO_SHARED_SECRET>
 *  - Admin panel calls:    Authorization: Bearer <user_jwt> (must be admin)
 */
function isInternal(req: NextRequest): boolean {
  const xs = req.headers.get('x-shared-secret')?.trim()
  const secret = process.env.PIKAGO_SHARED_SECRET || process.env.INTERNAL_API_SECRET
  return !!xs && !!secret && xs === secret
}

async function requireAdminUser(req: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, res: NextResponse.json({ error: 'No authorization header' }, { status: 401 }) }
  }
  const token = authHeader.slice('Bearer '.length).trim()
  const { data: { user }, error } = await supabaseUser.auth.getUser(token)
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')?.toLowerCase() || null
    const limitParam = searchParams.get('limit')
    const limit = limitParam ? Math.max(1, parseInt(limitParam)) : null

    // Path A: Internal (Pikago / Postman with shared secret)
    if (isInternal(request)) {
      let q = supabaseAdmin.from('orders').select('*').order('created_at', { ascending: false })
      if (status) q = q.eq('order_status', status)
      if (limit) q = q.limit(limit)

      const { data, error } = await q
      if (error) throw error

      return NextResponse.json({ orders: data ?? [], count: (data ?? []).length })
    }

    // Path B: Admin panel (Bearer admin JWT)
    const adminCheck = await requireAdminUser(request)
    if (!adminCheck.ok) return adminCheck.res

    // Use your existing admin ops for panel (kept intact)
    if (limit) {
      const { data, error } = await adminOperations.getOrders(limit)
      if (error) throw error
      const filtered = status ? (data ?? []).filter((o: any) => (o.order_status || '').toLowerCase() === status) : (data ?? [])
      return NextResponse.json({ orders: filtered, count: filtered.length })
    } else {
      const { data, error } = await adminOperations.getOrdersWithCustomers()
      if (error) throw error
      const filtered = status ? (data ?? []).filter((o: any) => (o.order_status || '').toLowerCase() === status) : (data ?? [])
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

export async function PATCH(request: NextRequest) {
  try {
    // For status changes we keep the Admin JWT path (panel action)
    const adminCheck = await requireAdminUser(request)
    if (!adminCheck.ok) return adminCheck.res

    const { orderId, status } = (await request.json()) as { orderId: string; status: string }
    if (!orderId || !status) {
      return NextResponse.json({ error: 'Missing orderId or status' }, { status: 400 })
    }

    // Update using admin client (you already had this)
    const { data, error } = await adminOperations.updateOrderStatus(orderId, status as any)
    if (error) throw error

    // If accepted/confirmed → ping Pikago to import
    const shouldNotifyPikago = status === 'accepted' || status === 'confirmed'
    if (shouldNotifyPikago) {
      const pikagoBase = process.env.PIKAGO_BASE_URL || 'http://localhost:3001'
      const shared = process.env.PIKAGO_SHARED_SECRET
      if (!shared) {
        console.warn('PIKAGO_SHARED_SECRET not set – skipping Pikago import')
      } else {
        try {
          const res = await fetch(`${pikagoBase}/api/import-order`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-shared-secret': shared,
            },
            body: JSON.stringify({ orderId, source: 'ironxpress' }),
          })
          if (!res.ok) {
            const text = await res.text()
            console.error('Pikago import failed', res.status, text)
          }
        } catch (e) {
          console.error('Error calling Pikago import-order:', e)
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
