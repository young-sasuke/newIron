import type { NextRequest } from 'next/server';

export function allowInternal(req: NextRequest) {
  const secret = process.env.PIKAGO_SHARED_SECRET || process.env.INTERNAL_API_SECRET;
  if (!secret) return { ok: false as const, reason: 'Missing server secret' };

  const auth = req.headers.get('authorization');           // "Bearer <token>"
  const xs = req.headers.get('x-shared-secret');           // "<token>"
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;

  if (xs && xs === secret) return { ok: true as const };
  if (token && token === secret) return { ok: true as const };

  return { ok: false as const, reason: 'Unauthorized' };
}
