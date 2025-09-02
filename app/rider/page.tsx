// app/rider/page.tsx - Rider Dashboard for Order Management
'use client';

import { useEffect, useState } from 'react';
import { supabase, subscribeToOrderStatusUpdates } from '@/lib/supabase';
import { Order } from '@/lib/admin';
import RiderActions, { BulkRiderActions } from '@/components/RiderActions';
import { 
  MapPin, 
  Clock, 
  Truck,
  CheckCircle, 
  RefreshCw,
  Filter,
  Search,
  Package
} from 'lucide-react';
import { toast } from 'react-toastify';

export default function RiderPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('assigned');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    fetchOrders();
    const unsubscribe = subscribeToOrderStatusUpdates(
      (payload) => {
        console.log('Rider: Order status updated:', payload);
        
        // Show notifications for orders that affect this rider
        if (payload.new?.order_status === 'assigned') {
          toast.info(
            `📦 New order assigned: #${payload.new.id?.substring(0, 8)}`,
            { position: 'top-right', autoClose: 5000 }
          );
        }
        
        fetchOrders(); // Refresh orders
      },
      (error) => {
        console.error('Rider subscription error:', error);
        toast.error('Real-time updates connection lost. Please refresh.');
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    filterOrders();
  }, [orders, searchTerm, statusFilter]);

  const fetchOrders = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Please log in to continue');
        return;
      }

      // Fetch orders that are relevant to riders
      const response = await fetch('/api/admin/orders', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }

      const { orders } = await response.json();
      
      // Filter for rider-relevant statuses
      const riderOrders = orders.filter((order: Order) => 
        ['ready_for_delivery', 'assigned', 'out_for_pickup', 'shipped'].includes(order.order_status)
      );
      
      setOrders(riderOrders || []);
      
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  };

  const filterOrders = () => {
    let filtered = orders;

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => order.order_status === statusFilter);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(order => 
        (order.full_name && order.full_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (order.delivery_address && order.delivery_address.toLowerCase().includes(searchTerm.toLowerCase())) ||
        order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.phone && order.phone.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    setFilteredOrders(filtered);
  };

  const handleStatusUpdate = (orderId: string, newStatus: string) => {
    // Update the order in our local state immediately for better UX
    setOrders(prev => prev.map(order => 
      order.id === orderId 
        ? { ...order, order_status: newStatus }
        : order
    ));

    // Also refresh from server to ensure consistency
    setTimeout(fetchOrders, 1000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready_for_delivery':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'assigned':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'out_for_pickup':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'shipped':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'delivered':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatAddress = (address: string) => {
    if (!address) return 'No address';
    return address.length > 60 ? address.substring(0, 60) + '...' : address;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Truck className="text-blue-600" size={32} />
                Rider Dashboard
              </h1>
              <p className="text-gray-600 mt-2">Manage your deliveries and update order status</p>
            </div>
            <button
              onClick={fetchOrders}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { 
              label: 'Ready for Pickup', 
              count: orders.filter(o => ['ready_for_delivery', 'assigned'].includes(o.order_status)).length,
              color: 'bg-blue-500',
              icon: <Package size={20} />
            },
            { 
              label: 'Out for Pickup', 
              count: orders.filter(o => o.order_status === 'out_for_pickup').length,
              color: 'bg-orange-500',
              icon: <Truck size={20} />
            },
            { 
              label: 'In Transit', 
              count: orders.filter(o => o.order_status === 'shipped').length,
              color: 'bg-yellow-500',
              icon: <MapPin size={20} />
            },
            { 
              label: 'Completed Today', 
              count: orders.filter(o => o.order_status === 'delivered').length,
              color: 'bg-green-500',
              icon: <CheckCircle size={20} />
            }
          ].map((stat, index) => (
            <div key={index} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                  <p className="text-3xl font-bold text-gray-900">{stat.count}</p>
                </div>
                <div className={`p-3 rounded-lg text-white ${stat.color}`}>
                  {stat.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Search by customer, address, or order ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <div className="min-w-[200px]">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Orders</option>
                <option value="assigned">Assigned to Me</option>
                <option value="ready_for_delivery">Ready for Pickup</option>
                <option value="out_for_pickup">Out for Pickup</option>
                <option value="shipped">In Transit</option>
              </select>
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {filteredOrders.length > 0 && (
          <BulkRiderActions 
            orders={filteredOrders}
            onBulkUpdate={fetchOrders}
          />
        )}

        {/* Orders Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOrders.length === 0 ? (
            <div className="col-span-full bg-white rounded-lg shadow-md p-12 text-center">
              <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">No orders found</p>
              <p className="text-gray-400">
                {statusFilter === 'all' 
                  ? 'All your assigned orders will appear here'
                  : `No ${statusFilter.replace('_', ' ')} orders available`
                }
              </p>
            </div>
          ) : (
            filteredOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-lg shadow-md p-6 space-y-4">
                <div className="border-b pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      #{order.id.substring(0, 8)}
                    </h3>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.order_status)}`}>
                      {order.order_status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-900">
                      Customer: {order.full_name || 'Unknown'}
                    </p>
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <MapPin size={14} />
                      {formatAddress(order.delivery_address || '')}
                    </p>
                    {order.phone && (
                      <p className="text-sm text-gray-600">
                        📱 {order.phone}
                      </p>
                    )}
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <Clock size={14} />
                      Created: {new Date(order.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <RiderActions 
                  order={order}
                  onStatusUpdate={handleStatusUpdate}
                />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="bg-white rounded-lg shadow-md p-4 text-center text-gray-600">
          <p className="text-sm">
            Showing {filteredOrders.length} of {orders.length} assigned orders
          </p>
        </div>
      </div>
    </div>
  );
}
