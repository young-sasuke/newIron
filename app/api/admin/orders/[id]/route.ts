// app/api/admin/orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sharedSecret = request.headers.get('x-shared-secret')
    const secret = process.env.PIKAGO_SHARED_SECRET || process.env.INTERNAL_API_SECRET
    if (!sharedSecret || !secret || sharedSecret !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const orderId = params?.id
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 })
    }

    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (error) {
      console.error('Error fetching order:', error)
      return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
    }
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Pikago expects flat JSON (not { order: {...} })
    return NextResponse.json(order)
  } catch (err) {
    console.error('API Error (GET /api/admin/orders/[id]):', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
