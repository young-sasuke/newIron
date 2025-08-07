"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ShoppingCart, DollarSign, Users, Package } from "lucide-react";

const statsConfig = [
  { label: "Orders", icon: <ShoppingCart className="text-blue-500 w-7 h-7" /> },
  { label: "Revenue", icon: <DollarSign className="text-green-500 w-7 h-7" /> },
  { label: "Users", icon: <Users className="text-purple-500 w-7 h-7" /> },
  { label: "Products", icon: <Package className="text-yellow-500 w-7 h-7" /> },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState([0, 0, 0, 0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      // Fetch total orders
      const { count: orderCount } = await supabase.from("orders").select("*", { count: "exact", head: true });
      // Fetch total revenue (sum of order amounts)
      const { data: revenueData } = await supabase
        .from("orders")
        .select("total_amount", { head: false });
      const totalRevenue = revenueData
        ? revenueData.reduce((sum: number, row: any) => sum + (row.total_amount || 0), 0)
        : 0;
      // Fetch total users
      const { count: userCount } = await supabase.from("user_profiles").select("*", { count: "exact", head: true });
      // Fetch total products
      const { count: productCount } = await supabase.from("products").select("*", { count: "exact", head: true });

      setStats([
        orderCount || 0,
        totalRevenue || 0,
        userCount || 0,
        productCount || 0,
      ]);
      setLoading(false);
    }
    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <h1 className="text-2xl font-bold mb-8">Admin Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        {statsConfig.map((stat, i) => (
          <div
            key={stat.label}
            className="bg-white rounded-2xl shadow p-6 flex flex-col items-center justify-center"
          >
            <div>{stat.icon}</div>
            <div className="text-sm text-gray-500 mt-2">{stat.label}</div>
            <div className="text-xl font-bold mt-1">
              {loading ? "..." : stat.label === "Revenue" ? `₹${stats[i]}` : stats[i]}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow p-6">
        Welcome to your live IronXpress admin dashboard! 🚀
      </div>
    </div>
  );
}
