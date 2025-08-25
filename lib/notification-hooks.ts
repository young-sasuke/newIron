// lib/notification-hooks.ts - IronXpress Notification System
import { createClient } from '@supabase/supabase-js';

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

export interface NotificationData {
  orderId: string;
  userId: string;
  status: string;
  previousStatus?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  orderDetails?: any;
}

// Status change messages for customers
const STATUS_MESSAGES = {
  'confirmed': {
    title: 'Order Confirmed',
    message: 'Your order has been confirmed and is being prepared.',
    type: 'info'
  },
  'accepted': {
    title: 'Order Accepted',
    message: 'Great news! Your order has been accepted and will be processed soon.',
    type: 'success'
  },
  'assigned': {
    title: 'Rider Assigned',
    message: 'A delivery partner has been assigned to your order and will collect it soon.',
    type: 'info'
  },
  'received': {
    title: 'Order Received',
    message: 'Your order has been received at our facility and work has begun.',
    type: 'info'
  },
  'work_in_progress': {
    title: 'Work in Progress',
    message: 'Your order is currently being processed. We\'ll notify you when it\'s ready.',
    type: 'info'
  },
  'ready_for_delivery': {
    title: 'Ready for Delivery',
    message: 'Your order is ready! A delivery partner will be assigned shortly.',
    type: 'success'
  },
  'shipped': {
    title: 'Out for Delivery',
    message: 'Your order is on its way! Track your delivery partner in real-time.',
    type: 'success'
  },
  'delivered': {
    title: 'Order Delivered',
    message: 'Your order has been successfully delivered. Thank you for choosing IronXpress!',
    type: 'success'
  },
  'cancelled': {
    title: 'Order Cancelled',
    message: 'Your order has been cancelled. If this was unexpected, please contact support.',
    type: 'warning'
  }
};

/**
 * Main notification hook - called after order status updates
 */
export async function triggerOrderStatusNotification(data: NotificationData): Promise<boolean> {
  try {
    console.log(`[Notifications] 🔔 Triggering notification for order ${data.orderId}: ${data.status}`);

    // Check if this status change should trigger a notification
    if (!STATUS_MESSAGES[data.status as keyof typeof STATUS_MESSAGES]) {
      console.log(`[Notifications] ℹ️ No notification configured for status: ${data.status}`);
      return true; // Not an error, just no notification needed
    }

    // Get order details if not provided
    let orderDetails = data.orderDetails;
    if (!orderDetails) {
      orderDetails = await fetchOrderDetails(data.orderId);
      if (!orderDetails) {
        console.error(`[Notifications] ❌ Could not fetch order details for ${data.orderId}`);
        return false;
      }
    }

    // Extract customer contact info
    const customerEmail = data.customerEmail || orderDetails.email;
    const customerPhone = data.customerPhone || orderDetails.phone;
    const customerName = data.customerName || orderDetails.full_name || 'Customer';

    if (!customerEmail && !customerPhone) {
      console.warn(`[Notifications] ⚠️ No contact info for order ${data.orderId}`);
      return false;
    }

    // Create notification record
    await createNotificationRecord({
      ...data,
      customerEmail,
      customerPhone,
      customerName,
      orderDetails
    });

    // Send notifications via available channels
    const results = await Promise.allSettled([
      sendEmailNotification({ ...data, customerEmail, customerName, orderDetails }),
      sendSMSNotification({ ...data, customerPhone, customerName, orderDetails }),
      sendInAppNotification({ ...data, customerName, orderDetails })
    ]);

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    console.log(`[Notifications] ✅ Sent ${successCount}/3 notification types for order ${data.orderId}`);

    return successCount > 0; // Success if at least one notification was sent

  } catch (error) {
    console.error(`[Notifications] ❌ Error triggering notification for order ${data.orderId}:`, error);
    return false;
  }
}

/**
 * Fetch order details from database
 */
async function fetchOrderDetails(orderId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error) {
      console.error('[Notifications] Failed to fetch order details:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('[Notifications] Exception fetching order details:', error);
    return null;
  }
}

/**
 * Create a notification record for tracking
 */
async function createNotificationRecord(data: NotificationData) {
  const statusConfig = STATUS_MESSAGES[data.status as keyof typeof STATUS_MESSAGES];
  
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .insert({
        order_id: data.orderId,
        user_id: data.userId,
        type: 'order_status',
        title: statusConfig.title,
        message: statusConfig.message,
        status: data.status,
        metadata: {
          previous_status: data.previousStatus,
          notification_type: statusConfig.type,
          customer_email: data.customerEmail,
          customer_phone: data.customerPhone,
        },
        created_at: new Date().toISOString(),
        read: false,
        sent: false
      });

    if (error) {
      console.error('[Notifications] Failed to create notification record:', error);
    } else {
      console.log(`[Notifications] ✅ Created notification record for order ${data.orderId}`);
    }
  } catch (error) {
    console.error('[Notifications] Exception creating notification record:', error);
  }
}

/**
 * Send email notification (placeholder - integrate with your email service)
 */
async function sendEmailNotification(data: NotificationData & { customerEmail?: string; customerName: string; orderDetails: any }) {
  if (!data.customerEmail) return;

  const statusConfig = STATUS_MESSAGES[data.status as keyof typeof STATUS_MESSAGES];
  
  console.log(`[Notifications] 📧 Would send email to ${data.customerEmail}: ${statusConfig.title}`);
  
  // TODO: Integrate with your email service (SendGrid, SES, etc.)
  // Example:
  /*
  const emailData = {
    to: data.customerEmail,
    subject: `${statusConfig.title} - Order #${data.orderId.substring(0, 8)}`,
    html: generateEmailTemplate(data, statusConfig),
  };
  
  await emailService.send(emailData);
  */
}

/**
 * Send SMS notification (placeholder - integrate with your SMS service)
 */
async function sendSMSNotification(data: NotificationData & { customerPhone?: string; customerName: string; orderDetails: any }) {
  if (!data.customerPhone) return;

  const statusConfig = STATUS_MESSAGES[data.status as keyof typeof STATUS_MESSAGES];
  
  console.log(`[Notifications] 📱 Would send SMS to ${data.customerPhone}: ${statusConfig.message}`);
  
  // TODO: Integrate with your SMS service (Twilio, AWS SNS, etc.)
  // Example:
  /*
  const smsData = {
    to: data.customerPhone,
    message: `IronXpress: ${statusConfig.message} Order #${data.orderId.substring(0, 8)}`,
  };
  
  await smsService.send(smsData);
  */
}

/**
 * Send in-app notification
 */
async function sendInAppNotification(data: NotificationData & { customerName: string; orderDetails: any }) {
  const statusConfig = STATUS_MESSAGES[data.status as keyof typeof STATUS_MESSAGES];
  
  console.log(`[Notifications] 🔔 Sending in-app notification for order ${data.orderId}`);
  
  // Update the notification record as sent
  try {
    await supabaseAdmin
      .from('notifications')
      .update({ 
        sent: true, 
        sent_at: new Date().toISOString() 
      })
      .eq('order_id', data.orderId)
      .eq('status', data.status);
      
    // TODO: Send real-time notification via Supabase realtime or WebSocket
    // This would push to any connected apps/web interfaces for the user
    
  } catch (error) {
    console.error('[Notifications] Failed to update notification record:', error);
  }
}

/**
 * Helper to generate email templates (placeholder)
 */
function generateEmailTemplate(data: NotificationData, statusConfig: any): string {
  return `
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f8f9fa; padding: 20px; text-align: center;">
          <h1 style="color: #1a202c;">IronXpress</h1>
        </div>
        <div style="padding: 20px;">
          <h2 style="color: #2d3748;">${statusConfig.title}</h2>
          <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
            Hi ${data.customerName},
          </p>
          <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
            ${statusConfig.message}
          </p>
          <div style="background: #edf2f7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <strong>Order ID:</strong> #${data.orderId.substring(0, 8)}<br>
            <strong>Status:</strong> ${statusConfig.title}
          </div>
          <p style="color: #4a5568; font-size: 14px;">
            Thank you for choosing IronXpress!
          </p>
        </div>
      </body>
    </html>
  `;
}

/**
 * Utility function to easily trigger notifications from API routes
 */
export async function notifyOrderStatusChange(
  orderId: string, 
  newStatus: string, 
  previousStatus?: string,
  additionalData?: Partial<NotificationData>
) {
  // Fetch order to get user info
  const orderDetails = await fetchOrderDetails(orderId);
  if (!orderDetails) {
    console.error(`[Notifications] Cannot notify - order ${orderId} not found`);
    return false;
  }

  const userId = orderDetails.user_id || additionalData?.userId;
  if (!userId) {
    console.error(`[Notifications] Cannot notify - no user ID for order ${orderId}`);
    return false;
  }

  return await triggerOrderStatusNotification({
    orderId,
    userId,
    status: newStatus,
    previousStatus,
    orderDetails,
    ...additionalData
  });
}
