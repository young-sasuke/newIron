'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/** The view model your UI renders (flat shape). */
type AddressVM = {
  id?: string
  store_name: string
  address_type?: string
  contact_person: string
  phone: string
  address_line_1: string
  address_line_2?: string | null
  landmark?: string | null
  city: string
  state: string
  pincode: string
  latitude?: number | null
  longitude?: number | null
  is_default?: boolean | null
  created_at?: string
}

const initialForm: AddressVM = {
  store_name: '',
  address_type: 'Store',
  contact_person: '',
  phone: '',
  address_line_1: '',
  address_line_2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  latitude: null,
  longitude: null,
  is_default: false,
}

async function getAdminToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data?.session?.access_token ?? null
}

/** Convert a DB row (either flat or PG JSON shape) into the flat VM the UI expects. */
function toVM(row: any): AddressVM {
  // PG shape: { id, name, address: { line1, line2, ... }, is_default, created_at }
  if (row && typeof row === 'object' && row.address && typeof row.address === 'object') {
    const a = row.address || {}
    return {
      id: row.id,
      store_name: row.name ?? '',
      address_type: a.address_type ?? 'Store',
      contact_person: a.recipient_name ?? a.contact_person ?? '',
      phone: a.phone ?? '',
      address_line_1: a.line1 ?? '',
      address_line_2: a.line2 ?? null,
      landmark: a.landmark ?? null,
      city: a.city ?? '',
      state: a.state ?? '',
      pincode: a.pincode ?? '',
      latitude: a.latitude ?? null,
      longitude: a.longitude ?? null,
      is_default: row.is_default ?? a.is_default ?? false,
      created_at: row.created_at,
    }
  }

  // Flat IX shape (what we used originally)
  return {
    id: row?.id,
    store_name: row?.store_name ?? row?.name ?? '',
    address_type: row?.address_type ?? 'Store',
    contact_person: row?.contact_person ?? row?.recipient_name ?? '',
    phone: row?.phone ?? '',
    address_line_1: row?.address_line_1 ?? row?.line1 ?? '',
    address_line_2: row?.address_line_2 ?? row?.line2 ?? null,
    landmark: row?.landmark ?? null,
    city: row?.city ?? '',
    state: row?.state ?? '',
    pincode: row?.pincode ?? '',
    latitude: row?.latitude ?? null,
    longitude: row?.longitude ?? null,
    is_default: row?.is_default ?? false,
    created_at: row?.created_at,
  }
}

export default function StoreAddressesPage() {
  const [addresses, setAddresses] = useState<AddressVM[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<AddressVM>({ ...initialForm })
  const [editId, setEditId] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
    const token = await getAdminToken()
    if (!token) throw new Error('Not authenticated')
    const res = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(json?.error || `Request failed (${res.status})`)
    }
    return json as T
  }

  async function load() {
    setLoading(true)
    try {
      const { addresses } = await api<{ addresses: any[] }>('/api/admin/store-addresses')
      const mapped = (addresses || []).map(toVM)
      setAddresses(mapped)
    } catch (e: any) {
      console.error('[stores/page] fetch error:', e)
      window.alert(e.message || 'Failed to fetch addresses')
      setAddresses([])
    } finally {
      setLoading(false)
    }
  }

  function updateForm<K extends keyof AddressVM>(key: K, value: AddressVM[K]) {
    setForm((s) => ({ ...s, [key]: value }))
  }

  function validateForm(data: AddressVM) {
    if (!data.store_name.trim()) return 'Store name is required'
    if (!data.address_line_1.trim()) return 'Address Line 1 is required'
    if (!data.city.trim()) return 'City is required'
    if (!data.state.trim()) return 'State is required'
    if (!data.pincode.trim()) return 'Pincode is required'
    if (!data.contact_person.trim()) return 'Contact person is required'
    if (!data.phone.trim()) return 'Phone is required'
    return null
  }

  async function handleAddAddress(e?: React.FormEvent) {
    e?.preventDefault()
    const err = validateForm(form)
    if (err) {
      window.alert(err)
      return
    }

    setSubmitting(true)
    try {
      // send flat shape; API converts it to PG JSON shape internally
      const payload = {
        store_name: form.store_name,
        address_type: form.address_type ?? 'Store',
        contact_person: form.contact_person,
        phone: form.phone,
        address_line_1: form.address_line_1,
        address_line_2: form.address_line_2 || null,
        landmark: form.landmark || null,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        latitude: form.latitude ?? null,
        longitude: form.longitude ?? null,
        is_default: !!form.is_default,
      }

      const { address } = await api<{ address: any }>('/api/admin/store-addresses', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      const inserted = toVM(address)
      setAddresses((prev) => (inserted ? [inserted, ...prev] : prev))
      window.alert('Address added')
      setShowModal(false)
      setForm({ ...initialForm })
    } catch (e: any) {
      console.error('[stores/page] insert error:', e)
      window.alert(e.message || 'Failed to add store address')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveEdit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!editId) return
    const err = validateForm(form)
    if (err) {
      window.alert(err)
      return
    }
    setSubmitting(true)
    try {
      // Send PATCH with flat shape + id (API supports both shapes)
      const payload = {
        id: editId,
        store_name: form.store_name,
        address_type: form.address_type ?? 'Store',
        contact_person: form.contact_person,
        phone: form.phone,
        address_line_1: form.address_line_1,
        address_line_2: form.address_line_2 || null,
        landmark: form.landmark || null,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        latitude: form.latitude ?? null,
        longitude: form.longitude ?? null,
        is_default: !!form.is_default,
      }

      const { address } = await api<{ address: any }>('/api/admin/store-addresses', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })

      const updated = toVM(address)
      setAddresses((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
      window.alert('Address updated')
      setShowModal(false)
      setForm({ ...initialForm })
      setEditId(null)
    } catch (e: any) {
      console.error('[stores/page] update error:', e)
      window.alert(e.message || 'Failed to update store address')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id?: string) {
    if (!id) return
    if (!confirm('Delete this store address?')) return
    try {
      await api(`/api/admin/store-addresses?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      setAddresses((prev) => prev.filter((a) => a.id !== id))
      window.alert('Deleted')
    } catch (e: any) {
      console.error('[stores/page] delete error:', e)
      window.alert(e.message || 'Failed to delete')
    }
  }

  function openAddModal() {
    setForm({ ...initialForm })
    setEditId(null)
    setShowModal(true)
  }

  function openEditModal(row: AddressVM) {
    setForm({ ...row })
    setEditId(row.id ?? null)
    setShowModal(true)
  }

  const rowKey = (a: AddressVM, i: number) => a.id || `${a.store_name}-${a.pincode}-${i}`

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Store Addresses</h1>

      <div className="flex justify-end mb-4">
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
        >
          + Add Store Address
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full text-gray-500">Loading…</div>
        ) : addresses.length === 0 ? (
          <div className="col-span-full p-8 text-center text-gray-500 bg-white rounded shadow">
            No store addresses found — add your first address.
          </div>
        ) : (
          addresses.map((a, i) => (
            <div key={rowKey(a, i)} className="bg-white rounded shadow p-6 relative">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-gray-800">{a.store_name}</div>
                  <div className="text-sm text-gray-500 mt-1">{a.address_type ?? 'Store'}</div>
                </div>

                {a.is_default && (
                  <span className="inline-block bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                    ★ Default
                  </span>
                )}
              </div>

              <button
                className="absolute right-10 top-5 text-gray-500 hover:text-gray-700"
                title="Edit"
                onClick={() => openEditModal(a)}
              >
                ✎
              </button>

              <div className="mt-4 text-sm text-gray-700">
                <div>{a.address_line_1}</div>
                {a.address_line_2 && <div>{a.address_line_2}</div>}
                {a.landmark && <div className="text-xs text-gray-500">Landmark: {a.landmark}</div>}
                <div className="mt-2">
                  {a.city}, {a.state} — <span className="text-xs text-gray-500">{a.pincode}</span>
                </div>
                <div className="mt-3 text-sm text-gray-600">📞 {a.phone}</div>
                <div className="text-xs text-gray-500 mt-1">Contact: {a.contact_person}</div>
              </div>

              <div className="absolute bottom-4 right-4 flex gap-3">
                <button
                  title="Delete"
                  className="text-red-500 hover:text-red-700"
                  onClick={() => handleDelete(a.id)}
                >
                  🗑
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center py-12 px-4 bg-black/40">
          <div className="bg-white rounded-lg w-full max-w-2xl shadow-lg">
            <form onSubmit={editId ? handleSaveEdit : handleAddAddress}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">{editId ? 'Edit Store Address' : 'Add Store Address'}</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false)
                      setForm({ ...initialForm })
                      setEditId(null)
                    }}
                    className="text-gray-500"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">Store Name *</label>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={form.store_name}
                      onChange={(e) => updateForm('store_name', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Address Type</label>
                    <select
                      className="w-full border rounded px-3 py-2"
                      value={form.address_type ?? 'Store'}
                      onChange={(e) => updateForm('address_type', e.target.value)}
                    >
                      <option>Store</option>
                      <option>Warehouse</option>
                      <option>Outlet</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Contact Person *</label>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={form.contact_person}
                      onChange={(e) => updateForm('contact_person', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Phone *</label>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={form.phone}
                      onChange={(e) => updateForm('phone', e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-sm font-medium block mb-1">Address Line 1 *</label>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={form.address_line_1}
                      onChange={(e) => updateForm('address_line_1', e.target.value)}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-sm font-medium block mb-1">Address Line 2</label>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={form.address_line_2 ?? ''}
                      onChange={(e) => updateForm('address_line_2', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">City *</label>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={form.city}
                      onChange={(e) => updateForm('city', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">State *</label>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={form.state}
                      onChange={(e) => updateForm('state', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Pincode *</label>
                    <input
                      className="w-full border rounded px-3 py-2"
                      value={form.pincode}
                      onChange={(e) => updateForm('pincode', e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      className="w-full border rounded px-3 py-2"
                      value={form.latitude ?? ''}
                      onChange={(e) =>
                        updateForm('latitude', e.target.value === '' ? null : Number(e.target.value))
                      }
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      className="w-full border rounded px-3 py-2"
                      value={form.longitude ?? ''}
                      onChange={(e) =>
                        updateForm('longitude', e.target.value === '' ? null : Number(e.target.value))
                      }
                    />
                  </div>

                  <div className="md:col-span-2 flex items-center gap-2 mt-2">
                    <input
                      id="is_default"
                      type="checkbox"
                      checked={!!form.is_default}
                      onChange={(e) => updateForm('is_default', e.target.checked)}
                    />
                    <label htmlFor="is_default" className="text-sm text-gray-700">
                      Mark as default address
                    </label>
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false)
                      setForm({ ...initialForm })
                      setEditId(null)
                    }}
                    className="px-4 py-2 border rounded"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded">
                    {submitting ? (editId ? 'Updating…' : 'Saving…') : editId ? 'Save Changes' : 'Save Address'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
