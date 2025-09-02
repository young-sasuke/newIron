// components/RiderActions.tsx - Rider interface for updating order status
'use client';

import { useState } from 'react';
import { updateOrderStatusWithNotification } from '@/lib/supabase';
import { toast } from 'react-toastify';
import { Truck, CheckCircle, Package, MapPin } from 'lucide-react';

interface RiderActionsProps {
  order: {
    id: string;
    order_status: string;
    full_name?: string;
    delivery_address?: string;
  };
  onStatusUpdate?: (orderId: string, newStatus: string) => void;
}

export default function RiderActions({ order, onStatusUpdate }: RiderActionsProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStatusUpdate = async (newStatus: 'shipped' | 'delivered') => {
    setIsUpdating(true);
    
    try {
      console.log(`Updating order ${order.id} to ${newStatus}`);
      
      const result = await updateOrderStatusWithNotification(order.id, newStatus);
      
      if (result.success) {
        toast.success(
          newStatus === 'shipped' 
            ? '🚛 Order marked as shipped!' 
            : '✅ Order delivered successfully!',
          {
            position: 'top-right',
            autoClose: 4000
          }
        );
        
        // Notify parent component about the status update
        if (onStatusUpdate) {
          onStatusUpdate(order.id, newStatus);
        }
      } else {
        throw new Error(result.message || 'Failed to update order status');
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error(
        `Failed to mark order as ${newStatus}. Please try again.`,
        {
          position: 'top-right',
          autoClose: 5000
        }
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const canMarkAsShipped = () => {
    // Order can be marked as shipped when it's ready for delivery or assigned to rider
    const allowedStatuses = ['ready_for_delivery', 'assigned', 'out_for_pickup'];
    return allowedStatuses.includes(order.order_status);
  };

  const canMarkAsDelivered = () => {
    // Order can be marked as delivered when it's shipped
    return order.order_status === 'shipped';
  };

  if (!canMarkAsShipped() && !canMarkAsDelivered()) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-gray-600 text-center">
          No actions available for this order status: {order.order_status}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
      <div className="border-b pb-3">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Package className="text-blue-600" size={20} />
          Order #{order.id.substring(0, 8)}
        </h3>
        {order.full_name && (
          <p className="text-sm text-gray-600">Customer: {order.full_name}</p>
        )}
        {order.delivery_address && (
          <p className="text-sm text-gray-600 flex items-center gap-1">
            <MapPin size={14} />
            {order.delivery_address}
          </p>
        )}
        <p className="text-sm font-medium text-blue-600 mt-1">
          Status: <span className="capitalize">{order.order_status.replace('_', ' ')}</span>
        </p>
      </div>

      <div className="space-y-3">
        {canMarkAsShipped() && (
          <button
            onClick={() => handleStatusUpdate('shipped')}
            disabled={isUpdating}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
              isUpdating ? 'animate-pulse' : ''
            }`}
          >
            {isUpdating ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <Truck size={20} />
            )}
            {isUpdating ? 'Updating...' : 'Mark as Shipped (Picked Up)'}
          </button>
        )}

        {canMarkAsDelivered() && (
          <button
            onClick={() => handleStatusUpdate('delivered')}
            disabled={isUpdating}
            className={`w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
              isUpdating ? 'animate-pulse' : ''
            }`}
          >
            {isUpdating ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <CheckCircle size={20} />
            )}
            {isUpdating ? 'Updating...' : 'Mark as Delivered'}
          </button>
        )}
      </div>

      <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
        <p className="font-medium mb-1">Instructions:</p>
        <ul className="space-y-1">
          {canMarkAsShipped() && (
            <li>• Click "Mark as Shipped" when you pick up the order</li>
          )}
          {canMarkAsDelivered() && (
            <li>• Click "Mark as Delivered" when you complete the delivery</li>
          )}
          <li>• Customers will be notified automatically</li>
        </ul>
      </div>
    </div>
  );
}

// Separate component for bulk rider actions (if needed)
export function BulkRiderActions({ 
  orders, 
  onBulkUpdate 
}: { 
  orders: Array<{ id: string; order_status: string }>;
  onBulkUpdate?: () => void;
}) {
  const [isUpdating, setIsUpdating] = useState(false);

  const shippableOrders = orders.filter(order => 
    ['ready_for_delivery', 'assigned', 'out_for_pickup'].includes(order.order_status)
  );

  const deliverableOrders = orders.filter(order => 
    order.order_status === 'shipped'
  );

  const handleBulkUpdate = async (status: 'shipped' | 'delivered', orderIds: string[]) => {
    if (orderIds.length === 0) return;

    setIsUpdating(true);
    try {
      const promises = orderIds.map(orderId => 
        updateOrderStatusWithNotification(orderId, status)
      );

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.length - successful;

      if (successful > 0) {
        toast.success(
          `${successful} orders marked as ${status}!`,
          { position: 'top-right' }
        );
      }

      if (failed > 0) {
        toast.warning(
          `${failed} orders failed to update`,
          { position: 'top-right' }
        );
      }

      if (onBulkUpdate) onBulkUpdate();
    } catch (error) {
      console.error('Bulk update error:', error);
      toast.error('Failed to update orders');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 space-y-3">
      <h3 className="text-lg font-semibold text-gray-900">Bulk Actions</h3>
      
      {shippableOrders.length > 0 && (
        <button
          onClick={() => handleBulkUpdate('shipped', shippableOrders.map(o => o.id))}
          disabled={isUpdating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
        >
          <Truck size={16} />
          Mark {shippableOrders.length} as Shipped
        </button>
      )}

      {deliverableOrders.length > 0 && (
        <button
          onClick={() => handleBulkUpdate('delivered', deliverableOrders.map(o => o.id))}
          disabled={isUpdating}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          <CheckCircle size={16} />
          Mark {deliverableOrders.length} as Delivered
        </button>
      )}

      {shippableOrders.length === 0 && deliverableOrders.length === 0 && (
        <p className="text-gray-600 text-center">No orders available for bulk actions</p>
      )}
    </div>
  );
}
