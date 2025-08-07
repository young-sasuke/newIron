// lib/admin.ts
import { supabase } from './supabase';

// Check if user has admin role
export async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const { data: user, error } = await supabase.auth.admin.getUserById(userId);
    
    if (error || !user) {
      console.error('Error fetching user:', error);
      return false;
    }

    // Check if user has admin role in user_metadata or app_metadata
    const userMetadata = user.user?.user_metadata || {};
    const appMetadata = user.user?.app_metadata || {};
    
    return userMetadata.role === 'admin' || appMetadata.role === 'admin';
  } catch (error) {
    console.error('Error checking admin role:', error);
    return false;
  }
}

// Check if current authenticated user is admin
export async function checkCurrentUserIsAdmin(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }

    // Check user metadata for role
    const userMetadata = user.user_metadata || {};
    const appMetadata = user.app_metadata || {};
    
    return userMetadata.role === 'admin' || appMetadata.role === 'admin';
  } catch (error) {
    console.error('Error checking current user admin role:', error);
    return false;
  }
}

// Order status types (matching your database)
export type OrderStatus = 'pending' | 'confirmed' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';

// Order interface (matching your existing database structure)
export interface Order {
  id: string;
  user_id: string;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  payment_id?: string;
  order_status: string;
  pickup_date: string;
  pickup_slot_id?: string;
  delivery_date: string;
  delivery_slot_id?: string;
  delivery_type: string;
  delivery_address: string;
  address_details?: any;
  applied_coupon_code?: string;
  discount_amount?: number;
  created_at: string;
  updated_at: string;
  status?: string;
  cancelled_at?: string;
  cancellation_reason?: string;
  can_be_cancelled?: boolean;
  pickup_slot_display_time?: string;
  delivery_slot_display_time?: string;
  // Customer details from join
  full_name?: string;
  email?: string;
  phone?: string;
}

// Cart item interface (for order items)
export interface CartItem {
  id: string;
  product_name: string;
  product_image?: string;
  product_price: number;
  service_type: string;
  service_price: number;
  product_quantity: number;
  total_price: number;
  category?: string;
}
