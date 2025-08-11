// app/api/admin/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminOperations } from '@/lib/supabase-admin';
import { supabase } from '@/lib/supabase';
import { checkCurrentUserIsAdmin } from '@/lib/admin';

export async function GET(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Create a supabase client with the user's token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if user is admin
    const userMetadata = user.user_metadata || {};
    const appMetadata = user.app_metadata || {};
    const isAdmin = userMetadata.role === 'admin' || appMetadata.role === 'admin';

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // User is authenticated and is admin, fetch orders using admin client
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit');
    
    let orders;
    if (limit) {
      // Corrected: Use adminOperations.getOrders() instead of .getAllOrders()
      const { data, error } = await adminOperations.getOrders(parseInt(limit));
      if (error) throw error;
      orders = data || [];
    } else {
      const { data, error } = await adminOperations.getOrdersWithCustomers();
      if (error) throw error;
      orders = data || [];
    }

    return NextResponse.json({ orders, count: orders.length });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Create a supabase client with the user's token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if user is admin
    const userMetadata = user.user_metadata || {};
    const appMetadata = user.app_metadata || {};
    const isAdmin = userMetadata.role === 'admin' || appMetadata.role === 'admin';

    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Parse request body
    const { orderId, status } = await request.json() as { orderId: string; status: string };

    if (!orderId || !status) {
      return NextResponse.json({ error: 'Missing orderId or status' }, { status: 400 });
    }

    // Update order using admin client
    const { data, error } = await adminOperations.updateOrderStatus(orderId, status as any);
    
    if (error) throw error;

    // If accepted/confirmed → call Pikago to import
    const shouldNotifyPikago = status === 'accepted' || status === 'confirmed';
    if (shouldNotifyPikago) {
      const pikagoBase = process.env.PIKAGO_BASE_URL || 'http://localhost:3001';
      const shared = process.env.PIKAGO_SHARED_SECRET;

      if (!shared) {
        console.warn('PIKAGO_SHARED_SECRET not set – skipping Pikago import');
      } else {
        try {
          const res = await fetch(`${pikagoBase}/api/import-order`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-shared-secret': shared,
            },
            body: JSON.stringify({ orderId, source: 'ironxpress' }),
          });

          if (!res.ok) {
            const text = await res.text();
            console.error('Pikago import failed', res.status, text);
          }
        } catch (e) {
          console.error('Error calling Pikago import-order:', e);
        }
      }
    }

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
