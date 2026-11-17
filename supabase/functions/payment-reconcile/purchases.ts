// Purchase orders (VORA Coins packs + one subscription period) on top of the UPayments SANDBOX client.
// The database decides everything about money: the price snapshot (purchase_create) and the exactly-once entitlement (purchase_apply).
// This file only (1) asks the provider what really happened and (2) hands a provider-CONFIRMED result to purchase_apply.
// The canonical copy lives in supabase/functions/_shared/; each function that needs it carries an identical copy (same as upayments.ts).
import { compact, FAIL_RESULTS, fetchStatus, type Verified } from './upayments.ts'

export type Order = {
  id: string; user_id: string; kind: 'coins' | 'subscription'; item_key: string; amount_kwd: number | string; currency: string
  coins: number | null; period_days: number | null; status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired'
  provider_session_id: string | null; provider_track_id: string | null; checkout_url: string | null
  created_at: string; expires_at: string; paid_at: string | null; fulfilled_at: string | null; reused?: boolean
}
/** The only database surface the purchase flow uses: SECURITY DEFINER functions through the service client. */
export type Db = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: any; error: { code?: string; message: string } | null }> }
export type Lookup = (by: { trackId?: string | null; sessionId?: string | null }) => Promise<Verified>

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A provider answer may be applied only if it is about THIS order and is final: CAPTURED, or a terminal failure. */
export function confirmedResult(st: Verified | null, orderId: string): string | null {
  if (!st || !st.found || st.reference !== compact(orderId)) return null
  if (st.result === 'CAPTURED') return 'CAPTURED'
  if (st.terminal && FAIL_RESULTS.includes(st.result)) return st.result
  return null
}

export async function lookupPurchase(db: Db, orderId: string | null, track: string | null): Promise<Order | null> {
  if (orderId) { const r = await db.rpc('purchase_lookup', { p_order: orderId, p_track: null }); if (r.data) return r.data as Order }
  if (track) { const r = await db.rpc('purchase_lookup', { p_order: null, p_track: track }); if (r.data) return r.data as Order }
  return null
}

/** Asks the provider about one order and applies ONLY a provider-confirmed outcome (or, when allowed and due, expires it). */
export async function resolvePurchase(db: Db, o: Order, source: string, mayExpire: boolean, lookup: Lookup = fetchStatus): Promise<string> {
  let st: Verified | null = null
  try { st = (o.provider_track_id || o.provider_session_id) ? await lookup({ trackId: o.provider_track_id, sessionId: o.provider_session_id }) : null }
  catch (e) { console.error('purchase lookup failed', (e as Error).message); return 'unchanged_provider_unreachable' }
  const result = confirmedResult(st, o.id)
  if (result) {
    const r = await db.rpc('purchase_apply', { p_order: o.id, p_result: result, p_amount: st!.amount, p_currency: st!.currency, p_track: st!.trackId, p_response: { result }, p_source: source })
    return r.data?.outcome ?? 'error'
  }
  if (mayExpire && o.status === 'pending') {   // the provider confirms nothing was captured and our own expiry has passed: abandon it
    const r = await db.rpc('purchase_apply', { p_order: o.id, p_result: 'EXPIRED', p_amount: null, p_currency: null, p_track: null, p_response: {}, p_source: source })
    return r.data?.outcome ?? 'error'
  }
  return 'unchanged'
}

/** Webhook for an event whose reference is a purchase order. The body is only a HINT; the signature was already verified by the caller. */
export async function webhookPurchase(db: Db, o: Order, body: Record<string, unknown>, track: string | null, lookup: Lookup = fetchStatus): Promise<{ status: number; body: unknown }> {
  let verified: Verified
  try { verified = await lookup({ trackId: track, sessionId: track ? null : o.provider_session_id }) }
  catch (e) { console.error('provider lookup failed', (e as Error).message); return { status: 502, body: { error: 'verification_unavailable' } } }   // provider retries; nothing is applied
  const log = (result: string, outcome: string, details: unknown) => db.rpc('purchase_log', { p_order: o.id, p_source: 'webhook', p_result: result, p_outcome: outcome, p_details: details })
  if (!verified.found) { await log(String(body.result ?? ''), 'rejected_unverifiable', { track }); return { status: 422, body: { error: 'unverifiable' } } }
  if (verified.reference !== compact(o.id)) { await log(verified.result, 'rejected_reference_mismatch', { got: verified.reference }); return { status: 422, body: { error: 'reference_mismatch' } } }
  const result = confirmedResult(verified, o.id)
  if (!result) { await log(verified.result, 'ignored_non_terminal', {}); return { status: 200, body: { outcome: 'ignored_non_terminal' } } }
  const { data, error } = await db.rpc('purchase_apply', {
    p_order: o.id, p_result: result, p_amount: verified.amount, p_currency: verified.currency,
    p_track: verified.trackId ?? track, p_response: { result, track_id: verified.trackId ?? track }, p_source: 'webhook',
  })
  if (error) { console.error('purchase_apply failed', error.message); return { status: 500, body: { error: 'server_error' } } }
  return { status: 200, body: data }
}

/** Scheduler: overdue open orders (may be expired) and paid orders whose entitlement is still missing (never expired, only retried). */
export async function sweepPurchases(db: Db, lookup: Lookup = fetchStatus): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const { data: list, error } = await db.rpc('purchase_overdue', { p_limit: 15 })
  if (error) { console.error('purchase_overdue failed', error.message); return out }
  for (const o of (list ?? []) as Order[]) {
    const { data: go } = await db.rpc('purchase_check_gate', { p_order: o.id, p_min_seconds: 60 })
    if (go !== true) { out[o.id] = 'skipped_recently_checked'; continue }
    out[o.id] = await resolvePurchase(db, o, 'reconcile', o.status === 'pending', lookup)
  }
  return out
}

// ------------------------------------------------------------------ return URL allowlist (never free-form)
/** Where the hosted checkout sends the member back. Allowed: the VORA web origin(s) over https, or the app's own vora:// scheme.
 *  Returns null when the requested URL is not allowed. The order id is always appended so the app knows which order to ask the server about. */
export function resolveReturnUrl(requested: unknown, orderId: string, webOrigins: string[]): string | null {
  const origins = webOrigins.map((o) => { try { return new URL(o).origin } catch { return '' } }).filter(Boolean)
  if (requested === undefined || requested === null || requested === '') return origins.length ? origins[0] + '/#/purchase/return/' + orderId : null
  if (typeof requested !== 'string' || requested.length > 300 || /[\s\\<>"'`]/.test(requested)) return null
  let u: URL
  try { u = new URL(requested) } catch { return null }
  if (u.username || u.password) return null
  const okWeb = u.protocol === 'https:' && origins.includes(u.origin)
  const okApp = u.protocol === 'vora:' && requested.toLowerCase().startsWith('vora://')
  if (!okWeb && !okApp) return null
  u.searchParams.set('order_id', orderId)
  return u.toString()
}

/** What a member may see about their own order (no provider identifiers, no checkout link). */
export function publicOrder(o: Order) {
  return {
    order_id: o.id, kind: o.kind, item_key: o.item_key, status: o.status, fulfilled: o.fulfilled_at !== null && o.fulfilled_at !== undefined,
    amount_kwd: Number(o.amount_kwd), currency: o.currency, coins: o.coins, period_days: o.period_days, paid_at: o.paid_at ?? null, expires_at: o.expires_at,
  }
}
