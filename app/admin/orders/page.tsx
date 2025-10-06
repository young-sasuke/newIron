// app/admin/orders/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase, subscribeToOrderStatusUpdates } from "@/lib/supabase";
import { Order, OrderStatus } from "@/lib/admin";
import {
  Check,
  X,
  Clock,
  Eye,
  Filter,
  Search,
  RefreshCw,
  ChevronDown,
  Calendar,
  Package,
  Truck,
} from "lucide-react";
import { toast } from "react-toastify";

type AnyOrder = Order & {
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  address?: string;
  address_json?: any;
  items?: any[] | string;
  item_count?: number; // from API
};

// ---------- Date & display helpers ----------

// Supabase "Created" time = UTC display (matches dashboard)
const fmtDateUTC = (iso?: string | null) => {
  if (!iso) return "Not set";
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);

  let h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  const hh = String(h).padStart(2, "0");
  return `${dd}/${mm}/${yy}, ${hh}:${m} ${ampm}`;
};

// Pickup/Delivery columns: show only date (DD/MM/YY)
const fmtDateOnly = (dateStr?: string | null) => {
  if (!dateStr) return "Not set";
  // Treat as pure YYYY-MM-DD to avoid TZ shifts
  const [y, m, d] = String(dateStr).split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}/${m}/${String(y).slice(-2)}`;
};

const parseMaybeJson = (v: any) => {
  if (!v) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
};

// Try multiple locations for phone including address JSON strings
const getPhone = (o: any) => {
  if (o?.phone) return o.phone;
  if (o?.phone_number) return o.phone_number;
  if (o?.customer_phone) return o.customer_phone;
  if (o?.customer_mobile) return o.customer_mobile;
  if (o?.mobile) return o.mobile;
  if (o?.contact_number) return o.contact_number;
  if (o?.user_phone) return o.user_phone;

  const addr = parseMaybeJson(o?.delivery_address) || o?.delivery_address;
  const det = parseMaybeJson(o?.address_details) || o?.address_details;
  const addrJson = o?.address_json;

  return (
    addr?.phone_number ||
    addr?.phone ||
    det?.phone_number ||
    det?.phone ||
    addrJson?.phone ||
    ""
  );
};

const safeItems = (v: any): any[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<AnyOrder[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<AnyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<AnyOrder | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
    const unsubscribeGeneral = setupRealtimeSubscription();
    const unsubscribeStatus = setupStatusUpdateSubscription();
    return () => {
      unsubscribeGeneral();
      unsubscribeStatus();
    };
  }, []);

  useEffect(() => {
    filterOrders();
  }, [orders, searchTerm, statusFilter]);

  const normalizedOrders = useMemo(
    () =>
      orders.map((o) => {
        const items = safeItems((o as any).items);

        const full_name =
          (o as any).full_name || (o as any).customer_name || "Unknown Customer";

        const email = (o as any).email || (o as any).customer_email || "";

        const phone = getPhone(o as any);

        const delivery_address =
          (typeof (o as any).delivery_address === "string"
            ? (o as any).delivery_address
            : (o as any).delivery_address?.address_line_1 ||
              (o as any).delivery_address?.address) ||
          (o as any).address_details?.address_line_1 ||
          (o as any).address_details?.address ||
          (o as any).address ||
          (o as any).address_json?.line1 ||
          (o as any).address_json?.address_line_1 ||
          "";

        // prefer API item_count; fallback to items length
        const item_count =
          typeof (o as any).item_count === "number"
            ? (o as any).item_count
            : Array.isArray(items)
            ? items.length
            : 0;

        return { ...o, items, full_name, email, phone, delivery_address, item_count };
      }),
    [orders]
  );

  const fetchOrders = async () => {
    try {
      const response = await fetch("/api/admin/orders/", { method: "GET" });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch orders");
      }
      const { orders } = await response.json();
      setOrders(orders || []);
      toast.success(`Loaded ${orders?.length || 0} orders successfully!`);
    } catch (error) {
      console.error("Error fetching orders:", error);
      toast.error(
        `Failed to fetch orders: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setLoading(false);
    }
  };

  const filterOrders = () => {
    let filtered = normalizedOrders;

    if (statusFilter !== "all") {
      filtered = filtered.filter(
        (order) =>
          (order as any).status === statusFilter ||
          (order as any).order_status === statusFilter ||
          (statusFilter === "pending" &&
            (order as any).order_status === "confirmed")
      );
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter((order) => {
        const id = String(order.id || "").toLowerCase();
        const name = String((order as any).full_name || "").toLowerCase();
        const email = String((order as any).email || "").toLowerCase();
        const phone = String(getPhone(order) || "").toLowerCase();
        return (
          id.includes(q) || name.includes(q) || email.includes(q) || phone.includes(q)
        );
      });
    }

    setFilteredOrders(filtered);
  };

  const setupRealtimeSubscription = () => {
    const subscription = supabase
      .channel("orders_page")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => fetchOrders()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  };

  const setupStatusUpdateSubscription = () => {
    return subscribeToOrderStatusUpdates(
      (payload) => {
        if (payload.new?.order_status === "shipped") {
          toast.success(
            `🚛 Order #${String(payload.new.id).substring(0, 8)} is out for delivery!`,
            { position: "top-right", autoClose: 5000 }
          );
        } else if (payload.new?.order_status === "delivered") {
          toast.success(
            `✅ Order #${String(payload.new.id).substring(0, 8)} has been delivered!`,
            { position: "top-right", autoClose: 5000 }
          );
        }
        fetchOrders();
      },
      () =>
        toast.error("Real-time updates connection lost. Please refresh.")
    );
  };

  const updateOrderStatus = async (orderId: string, newStatus: OrderStatus) => {
    setProcessingId(orderId);
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status: newStatus }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update order");
      }
      toast.success(`Order ${newStatus} successfully!`);
      fetchOrders();
    } catch (error) {
      console.error("Error updating order:", error);
      toast.error(`Failed to ${newStatus} order`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReceived = async (orderId: string) => {
    setProcessingId(orderId);
    try {
      await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status: "received" }),
      });
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, status: "work_in_progress" }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update order");
      }
      toast.success("Order received and marked as work in progress!");
      fetchOrders();
    } catch (error) {
      console.error("Error marking order as received:", error);
      toast.error("Failed to mark order as received");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReadyForDelivery = async (orderId: string) => {
    setProcessingId(orderId);
    try {
      const response = await fetch("/api/admin/orders/ready-for-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || "Failed to mark order as ready for delivery"
        );
      }
      toast.success("Order marked as ready for delivery!");
      fetchOrders();
    } catch (error) {
      console.error("Error marking order as ready for delivery:", error);
      toast.error("Failed to mark order as ready for delivery");
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "accepted":
      case "confirmed":
        return "bg-green-100 text-green-800 border-green-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      case "completed":
      case "delivered":
        return "bg-blue-100 text-blue-800 border-blue-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
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
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={16}
            />
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
            <option value="confirmed">Confirmed</option>
            <option value="accepted">Accepted</option>
            <option value="ready_for_delivery">Ready for delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
          </select>
          <ChevronDown
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400"
            size={16}
          />
        </div>
      </div>

      {/* Orders Count */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Filter className="text-blue-600" size={16} />
          <span className="text-blue-800 font-medium">
            Showing {filteredOrders.length} of {normalizedOrders.length} orders
          </span>
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No orders found</p>
            <p className="text-gray-400">
              Orders will appear here when customers place them
            </p>
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
                {filteredOrders.map((order) => {
                  return (
                    <tr key={order.id} className="hover:bg-gray-50">
                      {/* Order ID (full) + item count */}
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm font-medium text-blue-600">
                            #{String(order.id)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {(order as any).item_count ?? 0} item(s)
                          </p>
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {(order as any).full_name || "Unknown Customer"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {(order as any).email || "No email"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {getPhone(order) || "No phone"}
                          </p>
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-4">
                        <p className="text-sm font-semibold text-gray-900">
                          ₹{(order as any).total_amount?.toLocaleString?.() || "0"}
                        </p>
                        {(order as any).discount_amount && (
                          <p className="text-xs text-green-600">
                            -₹{(order as any).discount_amount}
                          </p>
                        )}
                      </td>

                      {/* Payment Method */}
                      <td className="px-4 py-4">
                        <p className="text-sm text-gray-900">
                          {(order as any).payment_method || "N/A"}
                        </p>
                        {(order as any).payment_id && (
                          <p className="text-xs text-gray-500">
                            ID: {String((order as any).payment_id)}
                          </p>
                        )}
                      </td>

                      {/* Payment Status */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            (order as any).payment_status === "paid" ||
                            (order as any).payment_status === "completed"
                              ? "bg-green-100 text-green-800"
                              : (order as any).payment_status === "pending"
                              ? "bg-yellow-100 text-yellow-800"
                              : (order as any).payment_status === "failed"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {(order as any).payment_status || "N/A"}
                        </span>
                      </td>

                      {/* Order Status */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                            (order as any).order_status === "confirmed"
                              ? "bg-green-100 text-green-800 border-green-200"
                              : (order as any).order_status === "pending"
                              ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                              : (order as any).order_status === "cancelled"
                              ? "bg-red-100 text-red-800 border-red-200"
                              : (order as any).order_status === "delivered" ||
                                (order as any).order_status === "completed"
                              ? "bg-blue-100 text-blue-800 border-blue-200"
                              : "bg-gray-100 text-gray-800 border-gray-200"
                          }`}
                        >
                          {(order as any).order_status || "pending"}
                        </span>
                      </td>

                      {/* Pickup Date -> only date + slot line */}
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">
                          {(order as any).pickup_date ? (
                            <>
                              <p>{fmtDateOnly((order as any).pickup_date)}</p>
                              {(order as any).pickup_slot_display_time && (
                                <p className="text-xs text-gray-500">
                                  {(order as any).pickup_slot_display_time}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-gray-400">Not set</p>
                          )}
                        </div>
                      </td>

                      {/* Delivery Date -> only date + slot line */}
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">
                          {(order as any).delivery_date ? (
                            <>
                              <p>{fmtDateOnly((order as any).delivery_date)}</p>
                              {(order as any).delivery_slot_display_time && (
                                <p className="text-xs text-gray-500">
                                  {(order as any).delivery_slot_display_time}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-gray-400">Not set</p>
                          )}
                        </div>
                      </td>

                      {/* Delivery Type */}
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            (order as any).delivery_type === "pickup"
                              ? "bg-blue-100 text-blue-800"
                              : (order as any).delivery_type === "delivery"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {(order as any).delivery_type || "N/A"}
                        </span>
                      </td>

                      {/* Created Date (UTC, matches Supabase) */}
                      <td className="px-4 py-4">
                        <div className="text-sm text-gray-900">
                          <div className="flex items-center gap-1">
                            <Calendar size={12} />
                            <div>
                              <p>{fmtDateUTC((order as any).created_at)}</p>
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

                          {((order as any).order_status === "confirmed" ||
                            (order as any).order_status === "pending") && (
                            <>
                              <button
                                onClick={() =>
                                  updateOrderStatus(String(order.id), "accepted")
                                }
                                disabled={processingId === String(order.id)}
                                className={`flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors ${
                                  processingId === String(order.id)
                                    ? "animate-pulse"
                                    : ""
                                }`}
                                title="Accept Order - Customer will be notified"
                              >
                                {processingId === String(order.id) ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                ) : (
                                  <Check size={14} />
                                )}
                                Accept
                              </button>
                              <button
                                onClick={() =>
                                  updateOrderStatus(
                                    String(order.id),
                                    "cancelled"
                                  )
                                }
                                disabled={processingId === String(order.id)}
                                className={`flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors ${
                                  processingId === String(order.id)
                                    ? "animate-pulse"
                                    : ""
                                }`}
                                title="Reject Order - Customer will be notified"
                              >
                                {processingId === String(order.id) ? (
                                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                ) : (
                                  <X size={14} />
                                )}
                                Reject
                              </button>
                            </>
                          )}

                          {((order as any).order_status === "reached" ||
                            (order as any).order_status ===
                              "delivered_to_store") && (
                            <button
                              onClick={() => handleReceived(String(order.id))}
                              disabled={processingId === String(order.id)}
                              className={`flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors ${
                                processingId === String(order.id)
                                  ? "animate-pulse"
                                  : ""
                              }`}
                              title="Receive Order - Mark as received and start work"
                            >
                              {processingId === String(order.id) ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              ) : (
                                <Package size={14} />
                              )}
                              Received
                            </button>
                          )}

                          {((order as any).order_status ===
                            "work_in_progress" ||
                            (order as any).order_status === "received") && (
                            <button
                              onClick={() =>
                                handleReadyForDelivery(String(order.id))
                              }
                              disabled={processingId === String(order.id)}
                              className={`flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors ${
                                processingId === String(order.id)
                                  ? "animate-pulse"
                                  : ""
                              }`}
                              title="Mark as Ready for Delivery - Send to Pikago dispatch"
                            >
                              {processingId === String(order.id) ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              ) : (
                                <Truck size={14} />
                              )}
                              Ready for Delivery
                            </button>
                          )}

                          {((order as any).order_status === "accepted" ||
                            (order as any).order_status === "picked_up" ||
                            (order as any).order_status === "in_transit") && (
                            <button
                              onClick={() =>
                                updateOrderStatus(String(order.id), "delivered")
                              }
                              disabled={processingId === String(order.id)}
                              className={`flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors ${
                                processingId === String(order.id)
                                  ? "animate-pulse"
                                  : ""
                              }`}
                              title="Mark as Delivered"
                            >
                              {processingId === String(order.id) ? (
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                              ) : (
                                <Check size={14} />
                              )}
                              Deliver
                            </button>
                          )}

                          {((order as any).order_status === "delivered" ||
                            (order as any).order_status === "cancelled") && (
                            <div
                              className={`px-3 py-1 rounded-lg text-sm font-medium ${
                                (order as any).order_status === "delivered"
                                  ? "bg-green-100 text-green-800"
                                  : (order as any).order_status === "cancelled"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {(order as any).order_status === "delivered"
                                ? "✅ Completed"
                                : "❌ Cancelled"}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Order Information
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p>
                      <strong>Order ID:</strong> {String(selectedOrder.id)}
                    </p>
                    <p>
                      <strong>Status:</strong>{" "}
                      <span
                        className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
                          (selectedOrder as any).status ||
                            (selectedOrder as any).order_status ||
                            "pending"
                        )}`}
                      >
                        {(selectedOrder as any).status ||
                          (selectedOrder as any).order_status ||
                          "pending"}
                      </span>
                    </p>
                    <p>
                      <strong>Created:</strong>{" "}
                      {fmtDateUTC((selectedOrder as any).created_at)}
                    </p>
                    <p>
                      <strong>Total Amount:</strong> ₹
                      {(selectedOrder as any).total_amount?.toLocaleString?.() ||
                        "0"}
                    </p>
                    <p>
                      <strong>Items:</strong>{" "}
                      {(selectedOrder as any).item_count ?? 0}
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Customer Information
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p>
                      <strong>Name:</strong>{" "}
                      {(selectedOrder as any).full_name || "Unknown Customer"}
                    </p>
                    <p>
                      <strong>Email:</strong>{" "}
                      {(selectedOrder as any).email || "—"}
                    </p>
                    <p>
                      <strong>Phone:</strong> {getPhone(selectedOrder) || "—"}
                    </p>
                    <p>
                      <strong>Address:</strong>{" "}
                      {(selectedOrder as any).delivery_address || "—"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
