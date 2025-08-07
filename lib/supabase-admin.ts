// lib/supabase-admin.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

// Admin client that bypasses RLS
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Type-safe admin operations
export const adminOperations = {
  // Get all orders (bypasses RLS)
  async getAllOrders() {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    return { data, error };
  },

  // Get orders with customer data
  async getOrdersWithCustomers() {
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (ordersError || !orders) {
      return { data: null, error: ordersError };
    }

    // Try to get customer data
    try {
      const userIds = [...new Set(orders.map(o => o.user_id).filter(Boolean))];
      if (userIds.length === 0) {
        return { 
          data: orders.map(order => ({ 
            ...order, 
            full_name: 'Customer', 
            email: 'N/A', 
            phone: 'N/A' 
          })), 
          error: null 
        };
      }

      const { data: customers } = await supabaseAdmin
        .from('ironXpress')
        .select('id, full_name, email, phone')
        .in('id', userIds);

      const ordersWithCustomers = orders.map(order => {
        const customer = customers?.find(c => c.id === order.user_id);
        return {
          ...order,
          full_name: customer?.full_name || 'Unknown Customer',
          email: customer?.email || 'No email',
          phone: customer?.phone || 'No phone'
        };
      });

      return { data: ordersWithCustomers, error: null };
    } catch (customerError) {
      console.warn('Could not fetch customer data:', customerError);
      return { 
        data: orders.map(order => ({ 
          ...order, 
          full_name: 'Customer', 
          email: 'N/A', 
          phone: 'N/A' 
        })), 
        error: null 
      };
    }
  },

  // Update order status
  async updateOrderStatus(orderId: string, status: string) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ 
        order_status: status,
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .select();

    return { data, error };
  },

  // Get order statistics
  async getOrderStats() {
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('order_status, total_amount, status');

    if (error || !orders) {
      return { data: null, error };
    }

    const stats = {
      totalOrders: orders.length,
      pendingOrders: orders.filter(o => 
        o.order_status === 'pending' || 
        o.order_status === 'confirmed' ||
        o.status === 'pending'
      ).length,
      acceptedOrders: orders.filter(o => 
        o.status === 'picked_up' || 
        o.status === 'in_transit' ||
        o.order_status === 'picked_up' ||
        o.order_status === 'in_transit' ||
        o.status === 'delivered' ||
        o.order_status === 'delivered'
      ).length,
      rejectedOrders: orders.filter(o => 
        o.status === 'cancelled' || 
        o.order_status === 'cancelled'
      ).length,
      totalRevenue: orders
        .filter(o => 
          o.status === 'delivered' || 
          o.order_status === 'delivered' ||
          o.status === 'confirmed' ||
          o.order_status === 'confirmed'
        )
        .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0)
    };

    return { data: stats, error: null };
  }
};
