"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Order = {
  id: string;
  user_id: string;
  order_status: string;
  payment_status: string;
  payment_method: string;
  total_amount: number;
  pickup_date: string;
  delivery_date: string;
  created_at: string;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select(
          `
          id,
          user_id,
          order_status,
          payment_status,
          payment_method,
          total_amount,
          pickup_date,
          delivery_date,
          created_at
          `
        )
        .order("created_at", { ascending: false });

      if (!error && data) {
        setOrders(data);
      }
      setLoading(false);
    }
    fetchOrders();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Orders</h1>
      <div className="bg-white rounded-2xl shadow p-6">
        {loading ? (
          <div className="text-center py-12">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No orders found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment Status</TableHead>
                <TableHead>Payment Method</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Pickup Date</TableHead>
                <TableHead>Delivery Date</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono">{order.id}</TableCell>
                  <TableCell className="font-mono text-xs">{order.user_id}</TableCell>
                  <TableCell>
                    <Badge variant={getBadgeVariant(order.order_status)}>
                      {order.order_status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getPaymentBadgeVariant(order.payment_status)}>
                      {order.payment_status}
                    </Badge>
                  </TableCell>
                  <TableCell>{order.payment_method}</TableCell>
                  <TableCell>₹{order.total_amount}</TableCell>
                  <TableCell>
                    {order.pickup_date ? new Date(order.pickup_date).toLocaleDateString("en-IN") : "-"}
                  </TableCell>
                  <TableCell>
                    {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString("en-IN") : "-"}
                  </TableCell>
                  <TableCell>
                    {order.created_at
                      ? new Date(order.created_at).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

// Status badge colors
function getBadgeVariant(status: string) {
  switch (status) {
    case "pending":
    case "confirmed":
      return "default";
    case "processing":
      return "secondary";
    case "completed":
      return "outline";
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
}

// Payment status badge colors
function getPaymentBadgeVariant(status: string) {
  switch (status) {
    case "success":
      return "default";
    case "pending":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}
