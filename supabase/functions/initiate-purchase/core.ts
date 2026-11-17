// initiate-purchase: pure flow, no network and no database of its own (everything arrives through Deps, so it is unit-testable).
// The member sends ONLY { kind, item_key, idempotency_key, return_url? }. Amount, currency, coins and period are never read from the request:
// purchase_create copies them from the server-side catalogue, and the hosted checkout is created with that snapshot.
import { type Order, resolveReturnUrl } from './purchases.ts'

export type Ctx = { userId: string; emailVerified: boolean; lang: 'ar' | 'en' }
export type Deps = {
  trusted(): Promise<boolean>                                     // is_trusted_session() evaluated by the database with the caller's own JWT
  createOrder(userId: string, kind: string, item: string, idem: string): Promise<{ order?: Order; code?: string }>
  getOrder(id: string): Promise<Order | null>
  createCharge(p: { attemptId: string; amountKwd: number; description: string; language: 'ar' | 'en'; returnUrl: string; cancelUrl: string; notificationUrl: string; expiryMinutes: number }): Promise<{ link: string; sessionId: string | null }>
  setCheckout(orderId: string, sessionId: string | null, url: string): Promise<void>
  failCreation(orderId: string, reason: string): Promise<void>
  sleep(ms: number): Promise<void>
  webOrigins: string[]                                            // allowlisted web origins for the return page (first = default)
  notificationUrl: string
}
export type Res = { status: number; body: Record<string, unknown> }

const KEY = /^[a-z][a-z0-9_]{2,30}$/
const IDEM = /^[A-Za-z0-9._:-]{8,80}$/
const ERR: Record<string, [number, string]> = {
  PU001: [401, 'login_required'], PU002: [422, 'item_not_available'], PU003: [403, 'email_not_verified'],
  PU004: [409, 'idempotency_key_reused'], PU005: [429, 'too_many_open_orders'], '22023': [400, 'invalid_request'],
}

export async function handleInitiate(d: Deps, ctx: Ctx, body: unknown): Promise<Res> {
  if (!ctx.emailVerified) return { status: 403, body: { error: 'email_not_verified' } }
  if (!(await d.trusted())) return { status: 403, body: { error: 'device_not_trusted' } }

  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const kind = b.kind, item = b.item_key, idem = b.idempotency_key
  if (kind !== 'coins' && kind !== 'subscription') return { status: 400, body: { error: 'invalid_kind' } }
  if (typeof item !== 'string' || !KEY.test(item)) return { status: 400, body: { error: 'invalid_item_key' } }
  if (typeof idem !== 'string' || !IDEM.test(idem)) return { status: 400, body: { error: 'invalid_idempotency_key' } }
  // validated BEFORE an order exists; the real URL (with the order id) is built below from the same allowlist
  if (resolveReturnUrl(b.return_url, '00000000-0000-4000-8000-000000000000', d.webOrigins) === null) return { status: 400, body: { error: 'return_url_not_allowed' } }

  const c = await d.createOrder(ctx.userId, kind, item, idem)
  if (!c.order) {
    const m = ERR[c.code ?? '']
    return m ? { status: m[0], body: { error: m[1] } } : { status: 500, body: { error: 'server_error' } }
  }
  const o = c.order
  const ok = (url: string, reused: boolean): Res => ({ status: 200, body: { order_id: o.id, checkout_url: url, kind: o.kind, item_key: o.item_key, amount_kwd: Number(o.amount_kwd), currency: o.currency, reused } })

  if (o.reused) {
    // same idempotency key again (retry / double click / second tab): the same order and the same hosted checkout, never a second one
    if (o.status === 'paid') return { status: 409, body: { error: 'already_paid', order_id: o.id, status: o.status } }
    if (o.status !== 'pending' || Date.parse(o.expires_at) <= Date.now()) return { status: 409, body: { error: 'order_closed', order_id: o.id, status: o.status === 'pending' ? 'expired' : o.status } }
    let url = o.checkout_url
    for (let i = 0; i < 16 && !url; i++) {
      await d.sleep(500)
      const cur = await d.getOrder(o.id)
      url = cur?.checkout_url ?? null
      if (cur && cur.status !== 'pending') return { status: 409, body: { error: 'order_closed', order_id: o.id, status: cur.status } }
    }
    return url ? ok(url, true) : { status: 409, body: { error: 'checkout_in_progress', order_id: o.id } }
  }

  try {
    const back = resolveReturnUrl(b.return_url, o.id, d.webOrigins)!
    const what = o.kind === 'coins' ? `VORA Coins ${o.coins ?? ''} (${o.item_key})` : `VORA subscription ${o.item_key} (${o.period_days ?? 30} days)`
    const ch = await d.createCharge({
      attemptId: o.id, amountKwd: Number(o.amount_kwd), description: what, language: ctx.lang,
      returnUrl: back, cancelUrl: back, notificationUrl: d.notificationUrl, expiryMinutes: 15,
    })
    await d.setCheckout(o.id, ch.sessionId, ch.link)
    return ok(ch.link, false)
  } catch (e) {
    console.error('purchase checkout creation failed', (e as Error).message)
    try { await d.failCreation(o.id, (e as Error).message) } catch { /* the reconciler expires it */ }
    return { status: 502, body: { error: 'gateway_unavailable', order_id: o.id } }
  }
}
