// app/api/admin/orders/[[...rest]]/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  getPikagoClient,
  PIKAGO_STORE_ADDRESS_TABLE,
  PG_RELATION_MISSING,
} from "@/lib/supabase-pikago-admin";
import { notifyOrderStatusChange } from "@/lib/notification-hooks";

/* ---------- optional HEAD (prevents odd redirects on some hosts) ---------- */
export async function HEAD(
  _req: NextRequest,
  { params }: { params: Promise<{ rest?: string[] }> }
) {
  const { rest } = await params;
  if (rest?.length) return new Response(null, { status: 404 });
  return new Response(null, { status: 204 });
}

/* ---------- helpers ---------- */
function toIST(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  // Convert to IST (UTC+5:30)
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString();
}

function parseMaybeJSON<T = any>(val: any): T | null {
  if (!val) return null;
  if (typeof val === "object") return val as T;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  }
  return null;
}

/* ---------- AUTH (disabled for local admin) ---------- */
async function requireAdminUser(_req: NextRequest) {
  return { ok: true as const, userId: "anon-admin" };
}

/* ---------- INTERNAL AUTH HELPERS ---------- */
function isInternalSharedSecret(req: NextRequest): boolean {
  const xs = req.headers.get("x-shared-secret")?.trim();
  const secret =
    process.env.PIKAGO_SHARED_SECRET || process.env.INTERNAL_API_SECRET;
  return !!xs && !!secret && xs === secret;
}

function isInternalBearer(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const expected = process.env.INTERNAL_API_SECRET || "";
  return !!token && !!expected && token === expected;
}

/* ---------- FETCH DEFAULT STORE ADDRESS ---------- */
async function fetchDefaultStoreAddressFromPikago() {
  try {
    const client = getPikagoClient();
    const candidates = [PIKAGO_STORE_ADDRESS_TABLE, "store_address"];

    // prefer explicit default
    for (const t of candidates) {
      const { data, error } = await client
        .from(t)
        .select("*")
        .eq("is_default", true)
        .limit(1);
      if (!error && Array.isArray(data) && data.length)
        return { table: t, row: data[0] };
      if (error && error.code !== PG_RELATION_MISSING) return null;
    }
    // fallback: first one
    for (const t of candidates) {
      const { data, error } = await client
        .from(t)
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1);
      if (!error && Array.isArray(data) && data.length)
        return { table: t, row: data[0] };
      if (error && error.code !== PG_RELATION_MISSING) return null;
    }
  } catch {
    /* noop */
  }
  return null;
}

/* ---------- GET: fetch all orders ---------- */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ rest?: string[] }> }
) {
  try {
    const { rest } = await params;
    if (rest?.length)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { supabaseAdmin, adminOperations } = await import(
      "@/lib/supabase-admin"
    );
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.toLowerCase() || null;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.max(1, parseInt(limitParam)) : null;

    // A) Internal call
    if (isInternalSharedSecret(request)) {
      let q = supabaseAdmin
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (status) q = q.eq("order_status", status);
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;

      const shaped = await attachItemCounts(
        supabaseAdmin,
        (data ?? []).map((o: any) => normalizeOrderShape(o))
      );
      return NextResponse.json(
        { orders: shaped, count: shaped.length },
        { headers: { "X-API": "orders-internal" } }
      );
    }

    // B) Admin panel
    const adminCheck = await requireAdminUser(request);
    if (!adminCheck.ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let ordersData: any[] = [];
    if (limit) {
      const { data, error } = await adminOperations.getOrders(limit);
      if (error) throw error;
      ordersData = data ?? [];
    } else {
      const { data, error } = await adminOperations.getOrdersWithCustomers();
      if (error) throw error;
      ordersData = data ?? [];
    }

    const userIds = Array.from(
      new Set(ordersData.map((o: any) => o.user_id).filter(Boolean))
    );
    let profileMap: Record<string, any> = {};
    if (userIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from("user_profiles")
        .select("user_id, first_name, last_name, email, phone_number")
        .in("user_id", userIds);
      if (profiles)
        profileMap = Object.fromEntries(
          profiles.map((p: any) => [p.user_id, p])
        );
    }

    const shaped = ordersData.map((o: any) =>
      normalizeOrderShape(o, profileMap[o.user_id])
    );
    const withCount = await attachItemCounts(supabaseAdmin, shaped);
    const filtered = status
      ? withCount.filter(
          (o: any) => (o.order_status || "").toLowerCase() === status
        )
      : withCount;

    return NextResponse.json(
      { orders: filtered, count: filtered.length },
      { headers: { "X-API": "orders-ok" } }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/* ---------- COUNT ITEMS PER ORDER ---------- */
async function attachItemCounts(supabaseAdmin: any, orders: any[]) {
  const ids = orders.map((o) => o.id).filter(Boolean);
  if (!ids.length) return orders;

  try {
    const { data, error } = await supabaseAdmin
      .from("order_items")
      .select("order_id, quantity")
      .in("order_id", ids);

    if (error || !Array.isArray(data)) return orders;

    const map = new Map<string, number>();
    for (const row of data) {
      const key = String(row.order_id);
      const qty = Number(row.quantity ?? 1) || 1;
      map.set(key, (map.get(key) || 0) + qty);
    }

    return orders.map((o) => ({
      ...o,
      item_count: map.get(String(o.id)) ?? 0,
    }));
  } catch {
    return orders;
  }
}

/* ---------- NORMALIZE ORDERS ---------- */
function normalizeOrderShape(raw: any, profile?: any) {
  const prof = profile || {};

  // Parse nested JSON if stored as string
  const deliveryAddrJson = parseMaybeJSON<any>(raw.delivery_address);
  const addressDetailsJson = parseMaybeJSON<any>(raw.address_details);

  const full_name =
    raw.full_name ||
    raw.customer_name ||
    `${(prof.first_name || "").trim()} ${(prof.last_name || "").trim()}`.trim() ||
    "Unknown Customer";

  const email = raw.email || raw.customer_email || prof.email || null;

  // Phone from several places (including parsed JSON)
  const phone =
    raw.phone ||
    raw.phone_number ||
    raw.customer_phone ||
    raw.customer_mobile ||
    raw.mobile ||
    raw.contact_number ||
    raw.user_phone ||
    deliveryAddrJson?.phone_number ||
    deliveryAddrJson?.phone ||
    addressDetailsJson?.phone_number ||
    addressDetailsJson?.phone ||
    prof.phone_number ||
    null;

  // Simple printable address
  const addressLine =
    typeof raw.delivery_address === "string"
      ? raw.delivery_address
      : deliveryAddrJson?.address_line_1 ||
        deliveryAddrJson?.address ||
        addressDetailsJson?.address_line_1 ||
        addressDetailsJson?.address ||
        raw.address ||
        null;

  // Items: ensure array
  let items = raw.items;
  if (typeof items === "string") {
    items = parseMaybeJSON(items) || [];
  }
  if (!Array.isArray(items)) items = [];

  return {
    ...raw,
    // keep original created_at (UTC)
    created_at: raw.created_at,
    // also provide IST if any consumer needs it
    created_at_ist: toIST(raw.created_at),
    full_name,
    email,
    phone,
    delivery_address: addressLine,
    items,
  };
}

/* ---------- PATCH: update order status + NOTIFY PIKAGO (restored) ---------- */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ rest?: string[] }> }
) {
  try {
    const { rest } = await params;
    if (rest?.length)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { supabaseAdmin, adminOperations } = await import(
      "@/lib/supabase-admin"
    );

    // Internal s2s fast-path (kept)
    if (isInternalBearer(request) || isInternalSharedSecret(request)) {
      const body = await request.json().catch(() => ({}));
      const id: string = String(
        body?.id ?? body?.orderId ?? body?.order_id ?? ""
      ).trim();
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const incomingStatus = (body?.order_status ?? body?.status) as
        | string
        | undefined;
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (incomingStatus) patch.order_status = String(incomingStatus);

      const { data, error } = await supabaseAdmin
        .from("orders")
        .update(patch)
        .eq("id", id)
        .select("id, order_status, user_id")
        .maybeSingle();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data) return NextResponse.json({ error: `Order ${id} not found` }, { status: 404 });

      return NextResponse.json({ ok: true, updated: data });
    }

    // Admin panel action
    const adminCheck = await requireAdminUser(request);
    if (!adminCheck.ok)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await request.json()) as {
      orderId?: string;
      status?: string;
      id?: string;
      order_status?: string;
    };
    const orderId = String(body?.orderId ?? body?.id ?? "").trim();
    const status = String(body?.status ?? body?.order_status ?? "").trim();
    if (!orderId || !status) {
      return NextResponse.json({ error: "Missing orderId or status" }, { status: 400 });
    }

    // Previous status (for hooks)
    const { data: currentOrder } = await supabaseAdmin
      .from("orders")
      .select("order_status")
      .eq("id", orderId)
      .single();
    const previousStatus = currentOrder?.order_status;

    // Update in IX
    const { data, error } = await adminOperations.updateOrderStatus(
      orderId,
      status as any
    );
    if (error) throw error;

    // Notify hooks
    if (previousStatus !== status) {
      notifyOrderStatusChange(orderId, status, previousStatus).catch(() => {});
    }

    // ✅ RESTORED: If accepted/confirmed -> notify Pikago with pickup address
    const shouldNotifyPikago =
      status.toLowerCase() === "accepted" || status.toLowerCase() === "confirmed";
    if (shouldNotifyPikago) {
      const pikagoBase = process.env.PIKAGO_BASE_URL || "http://localhost:3001";
      const shared = process.env.PIKAGO_SHARED_SECRET;
      if (shared) {
        try {
          const addr = await fetchDefaultStoreAddressFromPikago();
          const payload: any = { orderId, source: "ironxpress" };
          if (addr?.row) {
            const addressObj = (addr.row as any).address || {};
            payload.store_address_id = (addr.row as any).id;
            payload.store_address = {
              id: (addr.row as any).id,
              name: (addr.row as any).name,
              address: {
                ...addressObj,
                latitude: addressObj.latitude || addressObj.lat || null,
                longitude: addressObj.longitude || addressObj.lng || null,
              },
              is_default: !!(
                (addr.row as any).is_default ??
                (addr.row as any).address?.is_default
              ),
            };
          }
          await fetch(`${pikagoBase}/api/import-order`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-shared-secret": shared,
            },
            body: JSON.stringify(payload),
          });
        } catch {
          // swallow: don't block admin UX if Pikago is down
        }
      }
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
