// lib/address-normalizer.ts (IronXpress)
export type NormalizedAddress = {
  label: string | null
  phone?: string | null
  address_text: string | null
  lat: number | null
  lng: number | null
}

type AnyObj = Record<string, any>

function numOrNull(v: any): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Customer address from an orders row (supports string or JSON columns) */
export function normalizeCustomerAddress(order: AnyObj): NormalizedAddress {
  const deliveryJson =
    order && typeof order.delivery_address === 'object' && order.delivery_address
      ? order.delivery_address
      : null

  const label =
    order?.full_name ||
    order?.customer_name ||
    order?.user_name ||
    null

  const phone =
    order?.phone ||
    order?.customer_phone ||
    deliveryJson?.phone ||
    deliveryJson?.phone_number ||
    null

  const address_text =
    (typeof order?.delivery_address === 'string' && order.delivery_address) ||
    deliveryJson?.address_line_1 ||
    deliveryJson?.address ||
    order?.address ||
    null

  const lat =
    numOrNull(deliveryJson?.latitude ?? deliveryJson?.lat) ??
    numOrNull(order?.customer_lat) ??
    null

  const lng =
    numOrNull(deliveryJson?.longitude ?? deliveryJson?.lng) ??
    numOrNull(order?.customer_lng) ??
    null

  return { label, phone, address_text, lat, lng }
}

/** Store address from a store_addresses row (PG side or IX mirror) */
export function normalizeStoreAddress(storeRow: AnyObj): NormalizedAddress {
  // row may look like: { id, name, address: { line1, city, state, pincode, phone, latitude, longitude, ... } }
  const a = (storeRow?.address && typeof storeRow.address === 'object')
    ? storeRow.address
    : storeRow || {}

  const label =
    storeRow?.name ||
    a?.recipient_name ||
    a?.contact_person ||
    'Store'

  const phone =
    a?.phone ||
    a?.phone_number ||
    null

  const line1 = a?.address_line_1 ?? a?.line1 ?? ''
  const line2 = a?.address_line_2 ?? a?.line2 ?? ''
  const city = a?.city ?? ''
  const state = a?.state ?? ''
  const pin = a?.pincode ?? a?.zip ?? ''
  const address_text = [line1, line2, [city, state, pin].filter(Boolean).join(', ')].filter(Boolean).join(', ').trim() || null

  const lat = numOrNull(a?.latitude ?? a?.lat) ?? null
  const lng = numOrNull(a?.longitude ?? a?.lng) ?? null

  return { label, phone, address_text, lat, lng }
}
