// middleware.ts — stable & API-safe
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/** Base64URL → UTF-8 JSON (safe in Edge runtime) */
function b64urlDecode(input: string): string {
  try {
    const b64 = input.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    // atob is available in the Edge runtime
    const str = atob(b64 + pad)
    const bytes = new Uint8Array([...str].map((c) => c.charCodeAt(0)))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

function parseJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const json = b64urlDecode(parts[1]!)
    if (!json) return null
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** Build /login?next=/admin/... or /login?error=not_admin */
function toLogin(req: NextRequest, reason: 'no_token' | 'not_admin') {
  const url = new URL('/login', req.url)
  if (reason === 'no_token') {
    // preserve where the user was trying to go
    const next = req.nextUrl.pathname + (req.nextUrl.search || '')
    url.searchParams.set('next', next)
  } else {
    url.searchParams.set('error', 'not_admin')
  }
  return url
}

export default function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname

  // 🚫 Hard bypass for anything that should never be intercepted
  if (
    p.startsWith('/api/') ||       // <-- keeps API routes 100% out of middleware
    p.startsWith('/_next/') ||
    p.startsWith('/static/') ||
    p.startsWith('/images/') ||
    p === '/favicon.ico' ||
    p === '/robots.txt' ||
    p === '/sitemap.xml'
  ) {
    return NextResponse.next()
  }

  // Only guard the admin UI
  if (!p.startsWith('/admin')) {
    return NextResponse.next()
  }

  // Supabase cookie set by auth helpers
  const token = req.cookies.get('sb-access-token')?.value
  if (!token) {
    const res = NextResponse.redirect(toLogin(req, 'no_token'))
    res.headers.set('X-Guard', 'no-token')
    return res
  }

  // Read role from JWT (no network calls in middleware)
  const payload = parseJwtPayload(token)
  const role =
    payload?.app_metadata?.role ??
    payload?.user_metadata?.role ??
    payload?.role

  if (role !== 'admin') {
    const res = NextResponse.redirect(toLogin(req, 'not_admin'))
    res.headers.set('X-Guard', 'not-admin')
    return res
  }

  // Allowed
  const res = NextResponse.next()
  res.headers.set('X-Guard', 'pass')
  return res
}

/**
 * Limit middleware to admin pages ONLY.
 * This ensures middleware never runs on /api/**, so no risk of API redirect loops.
 */
export const config = {
  matcher: ['/admin/:path*'],
}
