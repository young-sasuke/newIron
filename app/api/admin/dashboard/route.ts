// app/api/admin/dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";            // public client (for verifying the user token)
// Import service-role helpers dynamically inside handler

/**
 * Extracts the bearer token and returns the authenticated user.
 * Also enforces that the user is an admin (by role metadata or allowlist).
 */
async function getAdminUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: "Missing or invalid Authorization header", status: 401 as const };
  }

  const token = authHeader.replace("Bearer ", "").trim();

  // Verify token with the public client (server-side usage is OK)
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { error: "Invalid or expired token", status: 401 as const };
  }

  const user = data.user;

  // Admin check: either metadata role === 'admin' OR email in allowlist
  const metaRole =
    (user.user_metadata?.role as string | undefined) ??
    (user.app_metadata?.role as string | undefined);

  const allowlisted =
    (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
      .includes((user.email || "").toLowerCase());

  if (metaRole !== "admin" && !allowlisted) {
    return { error: "Admin access required", status: 403 as const };
  }

  return { user };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAdminUser(req);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Use service-role ops for RLS-bypassing reads
    const { adminOperations } = await import("@/lib/supabase-admin");
    const [statsRes, ordersRes] = await Promise.all([
      adminOperations.getOrderStats(),
      adminOperations.getOrdersWithCustomers(), // returns most recent first; we’ll trim to 5
    ]);

    if (statsRes.error) {
      return NextResponse.json({ error: statsRes.error.message }, { status: 500 });
    }
    if (ordersRes.error) {
      return NextResponse.json({ error: ordersRes.error.message }, { status: 500 });
    }

    const recentOrders = (ordersRes.data || []).slice(0, 5);

    return NextResponse.json({
      success: true,
      stats: statsRes.data,
      recentOrders,
    });
  } catch (err: any) {
    console.error("Dashboard API Error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
