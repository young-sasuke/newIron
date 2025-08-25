import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { supabase as supabaseUser } from '@/lib/supabase';
import { notifyOrderStatusChange } from '@/lib/notification-hooks';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  }
);

async function requireAdminUser(req: NextRequest): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
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

export async function POST(request: NextRequest) {
  try {
    // Admin authentication check
    const adminCheck = await requireAdminUser(request)
    if (!adminCheck.ok) return adminCheck.res

    const { orderId } = await request.json();

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    // Validate required environment variables
    const pikagoBaseUrl = process.env.PIKAGO_API_BASE_URL || process.env.NEXT_PUBLIC_PIKAGO_API_URL;
    const sharedSecret = process.env.INTERNAL_API_SHARED_SECRET;

    if (!pikagoBaseUrl) {
      console.error('[Ready for Delivery] ❌ PIKAGO_API_BASE_URL environment variable is required');
      return NextResponse.json({ 
        error: 'Server configuration error: Pikago API URL not configured' 
      }, { status: 500 });
    }

    if (!sharedSecret) {
      console.error('[Ready for Delivery] ❌ INTERNAL_API_SHARED_SECRET environment variable is required');
      return NextResponse.json({ 
        error: 'Server configuration error: Shared secret not configured' 
      }, { status: 500 });
    }

    console.log(`[Ready for Delivery] 🔄 Processing order ${orderId}`);
    console.log(`[Ready for Delivery] 📡 Pikago base URL: ${pikagoBaseUrl}`);
    console.log(`[Ready for Delivery] 🔐 Using x-shared-secret authentication`);

    // First, get the order details from our database
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error(`[Ready for Delivery] ❌ Order ${orderId} not found in IX:`, orderError);
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Call Pikago ready-to-dispatch endpoint
    const pikagoResponse = await fetch(`${pikagoBaseUrl}/api/ready-to-dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-shared-secret': sharedSecret,
      },
      body: JSON.stringify({
        orderId: orderId
      }),
    });

    console.log(`[Ready for Delivery] 📡 PG response status: ${pikagoResponse.status}`);

    if (!pikagoResponse.ok) {
      const errorData = await pikagoResponse.json().catch(() => ({ error: 'Unknown error' }));
      console.error(`[Ready for Delivery] ❌ PG ready-to-dispatch failed (${pikagoResponse.status}):`, errorData);
      console.error(`[Ready for Delivery] 📡 PG response body:`, JSON.stringify(errorData, null, 2));
      return NextResponse.json({ 
        error: `Failed to prepare order for delivery: ${errorData.error || 'Pikago service error'}` 
      }, { status: 500 });
    }

    const pikagoResult = await pikagoResponse.json();
    console.log(`[Ready for Delivery] ✅ PG ready-to-dispatch succeeded`);
    console.log(`[Ready for Delivery] 📡 PG response:`, JSON.stringify(pikagoResult, null, 2));

    // Only update IX status AFTER PG has successfully processed the order
    console.log(`[Ready for Delivery] 🔄 Updating IX order status to ready_for_delivery`);

    // Get current status for notification comparison
    const { data: currentOrder } = await supabaseAdmin
      .from('orders')
      .select('order_status')
      .eq('id', orderId)
      .single()
    const previousStatus = currentOrder?.order_status

    // Update our order status to ready_for_delivery
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({ 
        order_status: 'ready_for_delivery',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)

    if (updateError) {
      console.error(`[Ready for Delivery] ❌ Failed to update IX order status:`, updateError)
      return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 })
    }

    console.log(`[Ready for Delivery] ✅ IX order ${orderId} status updated to ready_for_delivery`);
    console.log(`[Ready for Delivery] 📊 Status transition: ${previousStatus} → ready_for_delivery`);

    // Trigger notification hooks asynchronously
    if (previousStatus !== 'ready_for_delivery') {
      notifyOrderStatusChange(orderId, 'ready_for_delivery', previousStatus)
        .then(success => {
          if (success) {
            console.log(`[Ready for Delivery] ✅ Notification sent for order ${orderId}: ${previousStatus} → ready_for_delivery`);
          } else {
            console.warn(`[Ready for Delivery] ⚠️ Notification failed for order ${orderId}`);
          }
        })
        .catch(error => {
          console.error(`[Ready for Delivery] ❌ Notification error for order ${orderId}:`, error);
        });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Order marked as ready for delivery',
      pikagoResult 
    })

  } catch (error) {
    console.error('Ready for delivery error:', error);
    return NextResponse.json({ 
      error: 'Failed to process ready for delivery request' 
    }, { status: 500 });
  }
}
