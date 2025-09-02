// app/api/orders/update-status/route.ts - Iron Project Order Status Update API
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, OrderStatus } from '@/lib/supabase-admin'
import { notifyOrderStatusChange } from '@/lib/notification-hooks'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    console.log('[API] Order status update request received')
    
    const { orderId, status } = await request.json()
    
    if (!orderId || !status) {
      return NextResponse.json(
        { error: 'orderId and status are required' },
        { status: 400 }
      )
    }

    // Validate status
    const validStatuses = ['shipped', 'delivered']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    console.log(`[API] Updating order ${orderId} to status: ${status}`)

    // Get current order status for comparison
    const { data: currentOrder, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('order_status, user_id')
      .eq('id', orderId)
      .single()

    if (fetchError || !currentOrder) {
      console.error('[API] Error fetching current order:', fetchError)
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    const previousStatus = currentOrder.order_status
    console.log(`[API] Previous status: ${previousStatus}, New status: ${status}`)

    // Update order status
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ 
        order_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select()
      .single()

    if (updateError) {
      console.error('[API] Error updating order status:', updateError)
      return NextResponse.json(
        { error: 'Failed to update order status' },
        { status: 500 }
      )
    }

    console.log('[API] Order status updated successfully')

    // Trigger notification system
    try {
      const notificationResult = await notifyOrderStatusChange(
        orderId,
        status,
        previousStatus
      )

      console.log('[API] Notification result:', notificationResult)
      
      // Create notification record for the user
      const notificationMessage = status === 'shipped' 
        ? 'Your order is out for delivery'
        : 'Your order has been completed'
      
      const { error: notifError } = await supabaseAdmin
        .from('notifications')
        .insert({
          order_id: orderId,
          user_id: currentOrder.user_id,
          type: 'order_status',
          title: status === 'shipped' ? 'Out for Delivery' : 'Order Completed',
          message: notificationMessage,
          status: status,
          metadata: {
            previous_status: previousStatus,
            notification_type: 'success'
          },
          created_at: new Date().toISOString(),
          read: false,
          sent: true
        })

      if (notifError) {
        console.warn('[API] Failed to create notification record:', notifError)
      } else {
        console.log('[API] Notification record created successfully')
      }

    } catch (notificationError) {
      console.error('[API] Error triggering notifications:', notificationError)
      // Don't fail the whole request if notifications fail
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      message: `Order status updated to ${status}`,
      previousStatus
    })

  } catch (error) {
    console.error('[API] Unexpected error updating order status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Allow GET requests to check status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const orderId = searchParams.get('orderId')

  if (!orderId) {
    return NextResponse.json(
      { error: 'orderId is required' },
      { status: 400 }
    )
  }

  try {
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_status, updated_at')
      .eq('id', orderId)
      .single()

    if (error || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ order })
  } catch (error) {
    console.error('[API] Error fetching order status:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
