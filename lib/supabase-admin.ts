// lib/supabase-admin.ts
import { createClient, type PostgrestSingleResponse } from '@supabase/supabase-js';

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  (() => { throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (server only)'); })();

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  (() => { throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL'); })();

/**
 * Server-only Supabase client using the service role.
 * Do NOT import this from client components.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

/** Types that match your public.orders table */
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'accepted'
  | 'rejected'
  | 'delivered'
  | 'cancelled'
  | string;

export interface OrderRow {
  id: string;
  user_id: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  payment_id?: string | null;
  order_status: OrderStatus;
  pickup_date: string;
  pickup_slot_id?: string | null;
  delivery_date: string;
  delivery_slot_id?: string | null;
  delivery_type: string;
  delivery_address: string;
  address_details?: any;
  applied_coupon_code?: string | null;
  discount_amount?: number | null;
  created_at: string;
  updated_at: string;
  status?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  can_be_cancelled?: boolean | null;
  original_pickup_slot_id?: string | null;
  original_delivery_slot_id?: string | null;
  pickup_slot_display_time?: string | null;
  pickup_slot_start_time?: string | null;
  pickup_slot_end_time?: string | null;
  delivery_slot_display_time?: string | null;
  delivery_slot_start_time?: string | null;
  delivery_slot_end_time?: string | null;
  source_order_id?: string | null;
  source_system?: string | null;
}

// Add a type for the joined data
export type OrderWithCustomer = OrderRow & {
  full_name: string;
  email: string;
  phone: string;
};

export interface DashboardStats {
  totalOrders: number;
  pendingOrders: number;
  acceptedOrders: number;
  rejectedOrders: number;
  totalRevenue: number;
}

/**
 * Admin operations that bypass RLS using the service role key.
 * Call these ONLY from server code (API routes, server actions).
 */
export const adminOperations = {
  /** Fetch latest orders */
  async getOrders(limit = 100): Promise<PostgrestSingleResponse<OrderRow[]>> {
    return supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
  },

  // Get orders with customer data (added back from the first code)
  async getOrdersWithCustomers(): Promise<{ data: OrderWithCustomer[] | null; error: any }> {
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (ordersError || !orders) {
      return { data: null, error: ordersError };
    }

    try {
      const userIds = [...new Set(orders.map(o => o.user_id).filter(Boolean))];
      if (userIds.length === 0) {
        return {
          data: orders.map(order => ({
            ...order,
            full_name: 'Customer',
            email: 'N/A',
            phone: 'N/A',
          })),
          error: null,
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
          phone: customer?.phone || 'No phone',
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
          phone: 'N/A',
        })),
        error: null,
      };
    }
  },

  /** Update order_status safely */
  async updateOrderStatus(orderId: string, status: OrderStatus) {
    return supabaseAdmin
      .from('orders')
      .update({ order_status: status })
      .eq('id', orderId)
      .select()
      .single();
  },

  /** Compute dashboard stats by fetching all and counting manually (like the first code) */
  async getOrderStats(): Promise<{ data: DashboardStats | null; error: any }> {
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
        .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0),
    };

    return { data: stats, error: null };
  },
};