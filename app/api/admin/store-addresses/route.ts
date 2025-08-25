// app/api/admin/store-addresses/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase as supabaseUser } from '@/lib/supabase'
import {
  getPikagoClient,
  PIKAGO_STORE_ADDRESS_TABLE,
  PG_RELATION_MISSING,
} from '@/lib/supabase-pikago-admin'

async function requireAdminUser(
  req: NextRequest
): Promise<{ ok: true; userId: string } | { ok: false; res: Response }> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { ok: false, res: NextResponse.json({ error: 'No authorization header' }, { status: 401 }) }
  }
  const token = authHeader.slice('Bearer '.length).trim()
  const {
    data: { user },
    error,
  } = await supabaseUser.auth.getUser(token)
  if (error || !user) {
    return { ok: false, res: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }
  const isAdmin = user.user_metadata?.role === 'admin' || user.app_metadata?.role === 'admin'
  if (!isAdmin) {
    return { ok: false, res: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  }
  return { ok: true, userId: user.id }
}

// Try both common table names without changing your DB
const TABLE_CANDIDATES = [PIKAGO_STORE_ADDRESS_TABLE, 'store_address']

/* ---------------- GET ---------------- */
export async function GET(req: NextRequest) {
  try {
    const adminCheck = await requireAdminUser(req)
    if (!adminCheck.ok) return adminCheck.res

    const client = getPikagoClient()

    let lastErr: any = null
    for (const table of TABLE_CANDIDATES) {
      const { data, error } = await client.from(table).select('*').order('created_at', { ascending: false })
      if (!error) return NextResponse.json({ addresses: data ?? [], table })
      lastErr = error
      if (error.code !== PG_RELATION_MISSING) break
    }

    console.error('[store-addresses GET]', lastErr)
    return NextResponse.json(
      { error: lastErr?.message || 'Fetch failed', details: lastErr, tried: TABLE_CANDIDATES },
      { status: 500 }
    )
  } catch (e: any) {
    console.error('[store-addresses GET] fatal:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

/* ---------------- POST ---------------- */
export async function POST(req: NextRequest) {
  try {
    const adminCheck = await requireAdminUser(req)
    if (!adminCheck.ok) return adminCheck.res

    const client = getPikagoClient()
    const payload = await req.json().catch(() => ({} as any))

    // Accept both shapes:
    //  A) PG shape: { name, address: {...}, is_default }
    //  B) IX flat shape: { store_name, contact_person, address_line_1, ... }
    const name: string = String(payload.store_name ?? payload.name ?? '').trim()

    const addressData =
      payload.address ??
      {
        recipient_name: payload.contact_person ?? payload.recipient_name ?? '',
        phone: payload.phone ?? '',
        address_type: payload.address_type ?? 'Store',
        line1: payload.address_line_1 ?? payload.line1 ?? '',
        line2: payload.address_line_2 ?? payload.line2 ?? null,
        landmark: payload.landmark ?? null,
        city: payload.city ?? '',
        state: payload.state ?? '',
        pincode: payload.pincode ?? '',
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        is_default: payload.is_default ?? false,
      }

    const isDefault = !!(payload.is_default ?? addressData.is_default ?? false)

    // If marking default, unset previous defaults (no schema change)
    for (const t of TABLE_CANDIDATES) {
      const probe = await client.from(t).select('id').limit(1)
      if (!probe.error) {
        if (isDefault) {
          await client.from(t).update({ is_default: false }).neq('id', '00000000-0000-0000-0000-000000000000')
        }
        const { data, error } = await client
          .from(t)
          .insert({ name, address: addressData, is_default: isDefault })
          .select()
        if (error) {
          console.error('[store-addresses POST Insert]', error)
          return NextResponse.json({ error: error.message || 'Insert failed', details: error }, { status: 500 })
        }
        const row = Array.isArray(data) ? data[0] : data
        return NextResponse.json({ address: row, table: t })
      }
      if (probe.error.code !== PG_RELATION_MISSING) {
        console.error('[store-addresses POST] table check error', probe.error)
        break
      }
    }

    return NextResponse.json({ error: 'No store address table found', tried: TABLE_CANDIDATES }, { status: 500 })
  } catch (e: any) {
    console.error('[store-addresses POST] fatal:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

/* ---------------- PATCH (NEW: Edit) ---------------- */
export async function PATCH(req: NextRequest) {
  try {
    const adminCheck = await requireAdminUser(req)
    if (!adminCheck.ok) return adminCheck.res

    const client = getPikagoClient()
    const payload = await req.json().catch(() => ({} as any))

    const id: string | undefined = payload.id
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // Accept both shapes again (flat or nested)
    const providedName: string | undefined =
      typeof payload.name === 'string' || typeof payload.store_name === 'string'
        ? String(payload.name ?? payload.store_name).trim()
        : undefined

    // Detect if any address fields were provided
    const hasFlatAddressFields =
      ['address_line_1', 'address_line_2', 'landmark', 'city', 'state', 'pincode', 'phone', 'recipient_name', 'contact_person', 'latitude', 'longitude', 'address_type']
        .some((k) => typeof payload[k] !== 'undefined')

    const addressData =
      typeof payload.address === 'object' && payload.address
        ? payload.address
        : hasFlatAddressFields
        ? {
            recipient_name: payload.contact_person ?? payload.recipient_name,
            phone: payload.phone,
            address_type: payload.address_type,
            line1: payload.address_line_1,
            line2: payload.address_line_2,
            landmark: payload.landmark,
            city: payload.city,
            state: payload.state,
            pincode: payload.pincode,
            latitude: typeof payload.latitude === 'number' ? payload.latitude : payload.latitude ?? null,
            longitude: typeof payload.longitude === 'number' ? payload.longitude : payload.longitude ?? null,
          }
        : undefined

    const providedDefault =
      typeof payload.is_default !== 'undefined'
        ? !!payload.is_default
        : typeof payload.address?.is_default !== 'undefined'
        ? !!payload.address.is_default
        : undefined

    // Try each candidate table
    let lastErr: any = null
    for (const t of TABLE_CANDIDATES) {
      const probe = await client.from(t).select('id').limit(1)
      if (probe.error) {
        lastErr = probe.error
        if (probe.error.code !== PG_RELATION_MISSING) break
        continue
      }

      // Merge address JSON if only partial provided
      let mergedAddress = addressData
      if (addressData) {
        const { data: existingRow } = await client.from(t).select('address').eq('id', id).maybeSingle()
        if (existingRow && existingRow.address && typeof existingRow.address === 'object') {
          mergedAddress = { ...existingRow.address, ...addressData }
        }
      }

      const updatePayload: Record<string, any> = {}
      if (typeof providedName !== 'undefined') updatePayload.name = providedName
      if (typeof providedDefault !== 'undefined') updatePayload.is_default = providedDefault
      if (typeof mergedAddress !== 'undefined') updatePayload.address = mergedAddress

      if (Object.keys(updatePayload).length === 0) {
        return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
      }

      // If setting default true, unset others
      if (providedDefault === true) {
        await client.from(t).update({ is_default: false }).neq('id', id)
      }

      const { data, error } = await client
        .from(t)
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .maybeSingle()

      if (!error) {
        return NextResponse.json({ address: data, table: t })
      }
      lastErr = error
      break
    }

    console.error('[store-addresses PATCH]', lastErr)
    return NextResponse.json(
      { error: lastErr?.message || 'Update failed', details: lastErr, tried: TABLE_CANDIDATES },
      { status: 500 }
    )
  } catch (e: any) {
    console.error('[store-addresses PATCH] fatal:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

/* ---------------- DELETE ---------------- */
export async function DELETE(req: NextRequest) {
  try {
    const adminCheck = await requireAdminUser(req)
    if (!adminCheck.ok) return adminCheck.res

    const client = getPikagoClient()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    let lastErr: any = null
    for (const table of TABLE_CANDIDATES) {
      const { error } = await client.from(table).delete().eq('id', id)
      if (!error) return NextResponse.json({ ok: true, table })
      lastErr = error
      if (error.code !== PG_RELATION_MISSING) break
    }

    console.error('[store-addresses DELETE]', lastErr)
    return NextResponse.json(
      { error: lastErr?.message || 'Delete failed', details: lastErr, tried: TABLE_CANDIDATES },
      { status: 500 }
    )
  } catch (e: any) {
    console.error('[store-addresses DELETE] fatal:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
