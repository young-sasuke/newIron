// app/api/admin/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminOperations } from '@/lib/supabase-admin';
import { supabase } from '@/lib/supabase';

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

    // Fetch dashboard data using admin client
    const [statsResult, ordersResult] = await Promise.all([
      adminOperations.getOrderStats(),
      adminOperations.getOrdersWithCustomers()
    ]);

    if (statsResult.error) {
      throw new Error(`Stats error: ${statsResult.error.message}`);
    }

    if (ordersResult.error) {
      throw new Error(`Orders error: ${ordersResult.error.message}`);
    }

    const recentOrders = ordersResult.data?.slice(0, 5) || [];

    return NextResponse.json({
      stats: statsResult.data,
      recentOrders,
      success: true
    });

  } catch (error) {
    console.error('Dashboard API Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
