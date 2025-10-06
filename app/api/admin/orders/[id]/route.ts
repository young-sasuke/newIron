// app/api/admin/orders/[id]/route.ts  (IronXpress)
import { NextRequest, NextResponse } from 'next/server'
// Import service-role client dynamically inside handler
import { supabase as supabaseUser } from '@/lib/supabase'
import { RiContactsBookLine } from 'react-icons/ri'

/**
 * Accept BOTH:
 *  - Internal calls (Pikago/Postman): x-shared-secret: <PIKAGO_SHARED_SECRET or INTERNAL_API_SECRET>
 *  - Admin panel calls:               Authorization: Bearer <admin_jwt>
 */
function isInternal(req: NextRequest): boolean {
  const xs = req.headers.get('x-shared-secret')?.trim()
  const secret = process.env.PIKAGO_SHARED_SECRET || process.env.INTERNAL_API_SECRET
  return !!xs && !!secret && xs === secret
}

async function requireAdminUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false as const, res: NextResponse.json({ error: 'No authorization header' }, { status: 401 }) }
  }
  const token = authHeader.slice('Bearer '.length).trim()
  const { data: { user }, error } = await supabaseUser.auth.getUser(token)
  if (error || !user) {
    return { ok: false as const, res: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }
  const meta = { ...(user.user_metadata || {}), ...(user.app_metadata || {}) }
  const isAdmin = meta.role === 'admin'
  if (!isAdmin) {
    return { ok: false as const, res: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  return { ok: true as const, userId: user.id }
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // Next.js App Router (await params)
) {
  try {
    console.log('API GET /api/admin/orders/[id] called')
    const { id } = await ctx.params
    if (!id) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
    }

    // Auth: allow internal secret OR admin bearer
    const internal = isInternal(_req)
    if (!internal) {
      const adminCheck = await requireAdminUser(_req)
      if (!adminCheck.ok) return adminCheck.res
    }

    // Fetch the order
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (orderErr) {
      return NextResponse.json({ error: orderErr.message }, { status: 500 })
    }
    if (!order) {
      return NextResponse.json({ error: `Order ${id} not found` }, { status: 404 })
    }

    // Fetch its items (best effort; empty array if not found/no perms)
    let items: any[] = []
    const { data: orderItems, error: itemsErr } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .eq('order_id', id)

    if (!itemsErr && Array.isArray(orderItems)) {
      items = orderItems
    }

    // Lightweight, printable customer address (non-breaking)
    const deliveryJson = typeof order.delivery_address === 'string' ? null : order.delivery_address
    const customer_text =
      (typeof order.delivery_address === 'string' && order.delivery_address) ||
      deliveryJson?.address_line_1 ||
      deliveryJson?.address ||
      order.address ||
      null

    // IMPORTANT: embed items INSIDE the order (so Pikago sees order.order_items)
    const orderWithItems = {
      ...order,
      order_items: items,
      addresses: { customer_text } // ← NEW, optional
    }

    // Keep the old shape compatible: { order: {...} }
    return NextResponse.json({ order: orderWithItems })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? 'Internal server error' },
      { status: 500 }
    )
  }
}
