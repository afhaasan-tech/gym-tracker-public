// purchase-status: the member's app asks the SERVER what happened to one of THEIR OWN orders. The server asks the payment provider
// (server-to-server) and applies only a provider-confirmed result; the checkout return page is never treated as proof of anything.
import { type Order, publicOrder, UUID } from './purchases.ts'

export type Deps = {
  trusted(): Promise<boolean>
  getOrder(id: string): Promise<Order | null>
  gate(orderId: string): Promise<boolean>                          // database throttle: at most one provider lookup per order every few seconds
  resolve(o: Order): Promise<string>                               // resolvePurchase(..., 'status', mayExpire = false)
}
export type Res = { status: number; body: Record<string, unknown> }

export async function handleStatus(d: Deps, ctx: { userId: string }, body: unknown): Promise<Res> {
  if (!(await d.trusted())) return { status: 403, body: { error: 'device_not_trusted' } }
  const id = (body && typeof body === 'object' ? (body as Record<string, unknown>).order_id : null)
  if (typeof id !== 'string' || !UUID.test(id)) return { status: 400, body: { error: 'order_id_required' } }
  let o = await d.getOrder(id)
  if (!o || o.user_id !== ctx.userId) return { status: 404, body: { error: 'order_not_found' } }   // someone else's order looks exactly like a missing one

  let verified = false, outcome: string | null = null
  const settled = o.status === 'paid' && o.fulfilled_at
  if (!settled && (o.provider_session_id || o.provider_track_id) && await d.gate(o.id)) {
    // pending -> may have been paid; failed/expired/cancelled -> a late capture is still honoured; paid but not fulfilled -> retried
    outcome = await d.resolve(o)
    verified = outcome !== 'unchanged_provider_unreachable' && outcome !== 'error'
    o = (await d.getOrder(id)) ?? o
  }
  return { status: 200, body: { ...publicOrder(o), verified_with_provider: verified, outcome } }
}
