// app/admin/orders/page.tsx
"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Order, OrderStatus } from '@/lib/admin';
import { 
  Check, 
  X, 
  Clock, 
  Eye, 
  Filter,
  Search,
  RefreshCw,
  ChevronDown,
  Calendar
} from 'lucide-react';
import { toast } from 'react-toastify';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
    setupRealtimeSubscription();
  }, []);

  useEffect(() => {
    filterOrders();
  }, [orders, searchTerm, statusFilter]);

  const fetchOrders = async () => {
    try {
      // Get user session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      // Call our API route that bypasses RLS
      const response = await fetch('/api/admin/orders', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch orders');
      }

      const { orders } = await response.json();
      
      console.log('Orders loaded:', orders);
      
      setOrders(orders || []);
      
      toast.success(`Loaded ${orders.length} orders successfully!`);
      
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error(`Failed to fetch orders: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filterOrders = () => {
    let filtered = orders;

    // Filter by status (checking both status fields)
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => 
        order.status === statusFilter || 
        order.order_status === statusFilter ||
        (statusFilter === 'pending' && order.order_status === 'confirmed')
      );
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(order => 
        (order.full_name && order.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (order.email && order.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
        order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.phone && order.phone.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    setFilteredOrders(filtered);
  };

  const setupRealtimeSubscription = () => {
    const subscription = supabase
      .channel('orders_page')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          console.log('Orders table changed:', payload);
          if (payload.eventType === 'INSERT') {
            toast.success('🆕 New order received!');
          }
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    setProcessingId(orderId);
    try {
      // Get user session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('No active session');
      }

      // Call our API route that bypasses RLS
      const response = await fetch('/api/admin/orders', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId, status: newStatus })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update order');
      }

      toast.success(`Order ${newStatus} successfully!`);
      fetchOrders();
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error(`Failed to ${newStatus} order`);
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'accepted':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'completed':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders Management</h1>
          <p className="text-gray-600">Manage and process customer orders</p>
        </div>
        <button
          onClick={fetchOrders}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-8 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="completed">Completed</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
        </div>
      </div>

      {/* Orders Count */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Filter className="text-blue-600" size={16} />
          <span className="text-blue-800 font-medium">
            Showing {filteredOrders.length} of {orders.length} orders
          </span>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No orders found</p>
            <p className="text-gray-400">Orders will appear here when customers place them</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Method
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pickup Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Delivery Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Delivery Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created Date
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    {/* Order ID */}
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-blue-600">#{order.id.substring(0, 8)}</p>
                        <p className="text-xs text-gray-500">
                          {Array.isArray(order.items) ? order.items.length : 'N/A'} item(s)
                        </p>
                      </div>
                    </td>
                    
                    {/* Customer */}
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{order.full_name || 'Unknown'}</p>
                        <p className="text-xs text-gray-500">{order.email || 'No email'}</p>
                        <p className="text-xs text-gray-500">{order.phone || 'No phone'}</p>
                      </div>
                    </td>
                    
                    {/* Amount */}
                    <td className="px-4 py-4">
                      <p className="text-sm font-semibold text-gray-900">
                        ₹{order.total_amount?.toLocaleString() || '0'}
                      </p>
                      {order.discount_amount && (
                        <p className="text-xs text-green-600">-₹{order.discount_amount}</p>
                      )}
                    </td>
                    
                    {/* Payment Method */}
                    <td className="px-4 py-4">
                      <p className="text-sm text-gray-900">{order.payment_method || 'N/A'}</p>
                      {order.payment_id && (
                        <p className="text-xs text-gray-500">ID: {order.payment_id.substring(0, 8)}</p>
                      )}
                    </td>
                    
                    {/* Payment Status */}
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        order.payment_status === 'paid' || order.payment_status === 'completed' ? 'bg-green-100 text-green-800' :
                        order.payment_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        order.payment_status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.payment_status || 'N/A'}
                      </span>
                    </td>
                    
                    {/* Order Status */}
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                        order.order_status === 'confirmed' || order.order_status === 'accepted' ? 'bg-green-100 text-green-800 border-green-200' :
                        order.order_status === 'pending' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                        order.order_status === 'cancelled' || order.order_status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' :
                        order.order_status === 'delivered' || order.order_status === 'completed' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                        'bg-gray-100 text-gray-800 border-gray-200'
                      }`}>
                        {order.order_status || 'pending'}
                      </span>
                    </td>
                    
                    {/* Pickup Date */}
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900">
                        {order.pickup_date ? (
                          <>
                            <p>{new Date(order.pickup_date).toLocaleDateString()}</p>
                            {order.pickup_slot_display_time && (
                              <p className="text-xs text-gray-500">{order.pickup_slot_display_time}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-gray-400">Not set</p>
                        )}
                      </div>
                    </td>
                    
                    {/* Delivery Date */}
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900">
                        {order.delivery_date ? (
                          <>
                            <p>{new Date(order.delivery_date).toLocaleDateString()}</p>
                            {order.delivery_slot_display_time && (
                              <p className="text-xs text-gray-500">{order.delivery_slot_display_time}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-gray-400">Not set</p>
                        )}
                      </div>
                    </td>
                    
                    {/* Delivery Type */}
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        order.delivery_type === 'pickup' ? 'bg-blue-100 text-blue-800' :
                        order.delivery_type === 'delivery' ? 'bg-purple-100 text-purple-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {order.delivery_type || 'N/A'}
                      </span>
                    </td>
                    
                    {/* Created Date */}
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          <div>
                            <p>{new Date(order.created_at).toLocaleDateString()}</p>
                            <p className="text-xs text-gray-500">{new Date(order.created_at).toLocaleTimeString()}</p>
                          </div>
                        </div>
                      </div>
                    </td>
                    {/* Actions */}
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                        
                        {/* Show accept/reject buttons for confirmed orders (pending admin action) */}
                        {(order.order_status === 'confirmed' || order.order_status === 'pending') && (
                          <>
                            <button
                              onClick={() => updateOrderStatus(order.id, 'accepted')}
                              disabled={processingId === order.id}
                              className={`flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors ${
                                processingId === order.id ? 'animate-pulse' : ''
                              }`}
                              title="Accept Order - Customer will be notified"
                            >
                              {processingId === order.id ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              ) : (
                                <Check size={14} />
                              )}
                              Accept
                            </button>
                            <button
                              onClick={() => updateOrderStatus(order.id, 'rejected')}
                              disabled={processingId === order.id}
                              className={`flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors ${
                                processingId === order.id ? 'animate-pulse' : ''
                              }`}
                              title="Reject Order - Customer will be notified"
                            >
                              {processingId === order.id ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              ) : (
                                <X size={14} />
                              )}
                              Reject
                            </button>
                          </>
                        )}
                        
                        {/* Show complete button for accepted orders */}
                        {(order.order_status === 'accepted' || order.order_status === 'picked_up' || order.order_status === 'in_transit') && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'delivered')}
                            disabled={processingId === order.id}
                            className={`flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors ${
                              processingId === order.id ? 'animate-pulse' : ''
                            }`}
                            title="Mark as Delivered"
                          >
                            {processingId === order.id ? (
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                            ) : (
                              <Check size={14} />
                            )}
                            Deliver
                          </button>
                        )}
                        
                        {/* Show status for completed/cancelled orders */}
                        {(order.order_status === 'delivered' || order.order_status === 'cancelled' || order.order_status === 'rejected') && (
                          <div className={`px-3 py-1 rounded-lg text-sm font-medium ${
                            order.order_status === 'delivered' ? 'bg-green-100 text-green-800' :
                            order.order_status === 'cancelled' || order.order_status === 'rejected' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {order.order_status === 'delivered' ? '✅ Completed' :
                             order.order_status === 'cancelled' ? '❌ Cancelled' :
                             order.order_status === 'rejected' ? '❌ Rejected' : 'Done'}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Order Details</h2>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Order Information</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p><strong>Order ID:</strong> {selectedOrder.id}</p>
                    <p><strong>Status:</strong> 
                      <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedOrder.status)}`}>
                        {selectedOrder.status}
                      </span>
                    </p>
                    <p><strong>Created:</strong> {formatDate(selectedOrder.created_at)}</p>
                    <p><strong>Total Amount:</strong> ₹{selectedOrder.total_amount?.toLocaleString()}</p>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Customer Information</h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p><strong>Name:</strong> {selectedOrder.full_name}</p>
                    <p><strong>Email:</strong> {selectedOrder.email}</p>
                    <p><strong>Phone:</strong> {selectedOrder.phone}</p>
                    <p><strong>Address:</strong> {selectedOrder.delivery_address}</p>
                  </div>
                </div>
                
                {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Order Items</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      {selectedOrder.items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-b-0">
                          <div>
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                          </div>
                          <p className="font-semibold">₹{(item.price * item.quantity).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {selectedOrder.notes && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Notes</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p>{selectedOrder.notes}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
