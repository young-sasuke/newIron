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
      const { data, error } = await adminOperations.getAllOrders();
      if (error) throw error;
      orders = data?.slice(0, parseInt(limit)) || [];
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
    const { orderId, status } = await request.json();

    if (!orderId || !status) {
      return NextResponse.json({ error: 'Missing orderId or status' }, { status: 400 });
    }

    // Update order using admin client
    const { data, error } = await adminOperations.updateOrderStatus(orderId, status);
    
    if (error) throw error;

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
