// deno test --allow-env --allow-read tests/edge/purchases.test.ts   (pure logic: no network, no database; deps are mocked)
import { compact, type Verified } from '../../supabase/functions/_shared/upayments.ts'
import { confirmedResult, type Db, type Order, publicOrder, resolvePurchase, resolveReturnUrl, sweepPurchases, webhookPurchase } from '../../supabase/functions/_shared/purchases.ts'
import { type Deps as IDeps, handleInitiate } from '../../supabase/functions/initiate-purchase/core.ts'
import { type Deps as SDeps, handleStatus } from '../../supabase/functions/purchase-status/core.ts'

const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`) }
const U = '11111111-1111-4111-8111-111111111111', OTHER = '99999999-9999-4999-8999-999999999999', OID = '33333333-3333-4333-8333-333333333333'
const WEB = ['https://app.vora.test']
const order = (o: Partial<Order> = {}): Order => ({
  id: OID, user_id: U, kind: 'coins', item_key: 'coins_500', amount_kwd: 0.5, currency: 'KWD', coins: 500, period_days: null, status: 'pending',
  provider_session_id: 'sess-1', provider_track_id: null, checkout_url: null, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  paid_at: null, fulfilled_at: null, ...o,
})
const verified = (v: Partial<Verified> = {}): Verified => ({ found: true, terminal: true, result: 'CAPTURED', amount: 0.5, currency: 'KWD', reference: compact(OID), trackId: 'trk-1', raw: {}, ...v })
function mockDb(answers: Record<string, unknown> = {}) {
  const calls: { fn: string; args: any }[] = []
  const db: Db = { rpc: (fn, args) => { calls.push({ fn, args }); return Promise.resolve({ data: fn in answers ? answers[fn] : { outcome: 'applied', status: 'paid', fulfilled: true }, error: null }) } }
  return { db, calls }
}

// ------------------------------------------------------------------ return URL allowlist
Deno.test('return URL: default is the web app return page with the order id', () => {
  eq(resolveReturnUrl(undefined, OID, WEB), 'https://app.vora.test/#/purchase/return/' + OID, 'default')
  eq(resolveReturnUrl('', OID, WEB), 'https://app.vora.test/#/purchase/return/' + OID, 'empty string = default')
})
Deno.test('return URL: the allowlisted web origin and the vora:// scheme are accepted, order id is appended', () => {
  eq(resolveReturnUrl('https://app.vora.test/wallet', OID, WEB), 'https://app.vora.test/wallet?order_id=' + OID, 'web')
  eq(resolveReturnUrl('vora://purchase/return', OID, WEB), 'vora://purchase/return?order_id=' + OID, 'app scheme')
  eq(resolveReturnUrl('vora://purchase/return?order_id=someone-elses', OID, WEB), 'vora://purchase/return?order_id=' + OID, 'a client-supplied order_id is overwritten')
  eq(resolveReturnUrl('https://preview.vora.test/x', OID, [...WEB, 'https://preview.vora.test']), 'https://preview.vora.test/x?order_id=' + OID, 'extra configured origin')
})
Deno.test('return URL: everything else is refused (never free-form)', () => {
  const bad: unknown[] = [
    'https://evil.test/steal', 'http://app.vora.test/wallet', 'https://app.vora.test.evil.test/', 'https://app.vora.test@evil.test/', 'https://user:pw@app.vora.test/',
    'https://evil.test/?next=https://app.vora.test', '//evil.test', '/relative/path', 'javascript:alert(1)', 'data:text/html,x', 'exp://127.0.0.1:8081', 'intent://x', 'vora:evil',
    'voraX://purchase', 'https://app.vora.test:8443/', 'https://app.vora.test/ a', 'https://app.vora.test/"><script>', 'vora://x/' + 'a'.repeat(400), 42, {}, ['https://app.vora.test'], true,
  ]
  for (const b of bad) eq(resolveReturnUrl(b, OID, WEB), null, 'refused: ' + String(b).slice(0, 50))
  eq(resolveReturnUrl(undefined, OID, []), null, 'no configured origin and no URL => nothing')
})

// ------------------------------------------------------------------ provider answers
Deno.test('confirmedResult: only a final answer about THIS order counts', () => {
  eq(confirmedResult(verified(), OID), 'CAPTURED', 'captured')
  eq(confirmedResult(verified({ result: 'CANCELED' }), OID), 'CANCELED', 'terminal failure')
  eq(confirmedResult(verified({ result: 'NOT CAPTURED', terminal: false }), OID), null, 'unpaid checkout is not a decline')
  eq(confirmedResult(verified({ result: 'PENDING' }), OID), null, 'pending')
  eq(confirmedResult(verified({ reference: compact(OTHER) }), OID), null, 'another order')
  eq(confirmedResult(verified({ found: false }), OID), null, 'not found')
  eq(confirmedResult(null, OID), null, 'no answer')
})
Deno.test('resolvePurchase: applies the PROVIDER amount/currency, never the order snapshot or a client value', async () => {
  const { db, calls } = mockDb()
  const out = await resolvePurchase(db, order(), 'status', false, () => Promise.resolve(verified({ amount: 0.123, currency: 'USD' })))
  eq(out, 'applied', 'outcome is what the database says')
  eq(calls.length, 1, 'one rpc'); eq(calls[0].fn, 'purchase_apply', 'purchase_apply')
  eq(calls[0].args, { p_order: OID, p_result: 'CAPTURED', p_amount: 0.123, p_currency: 'USD', p_track: 'trk-1', p_response: { result: 'CAPTURED' }, p_source: 'status' }, 'args come from the provider lookup')
})
Deno.test('resolvePurchase: nothing confirmed => nothing applied; expiry only for an open order and only when allowed', async () => {
  const pending = () => Promise.resolve(verified({ result: 'NOT CAPTURED', terminal: false, trackId: null }))
  let m = mockDb(); eq(await resolvePurchase(m.db, order(), 'status', false, pending), 'unchanged', 'member status check never expires'); eq(m.calls.length, 0, 'no rpc')
  m = mockDb({ purchase_apply: { outcome: 'applied', status: 'expired' } }); eq(await resolvePurchase(m.db, order(), 'reconcile', true, pending), 'applied', 'sweep expires'); eq(m.calls[0].args.p_result, 'EXPIRED', 'EXPIRED pseudo-result')
  m = mockDb(); eq(await resolvePurchase(m.db, order({ status: 'paid', paid_at: 'x' }), 'reconcile', true, pending), 'unchanged', 'a paid order is never expired'); eq(m.calls.length, 0, 'no rpc')
  m = mockDb(); eq(await resolvePurchase(m.db, order(), 'reconcile', true, () => Promise.resolve(verified({ reference: compact(OTHER) }))), 'applied', 'a capture of ANOTHER order is not applied as a capture'); eq(m.calls[0].args.p_result, 'EXPIRED', 'only the expiry')
  m = mockDb(); eq(await resolvePurchase(m.db, order(), 'reconcile', true, () => Promise.reject(new Error('timeout'))), 'unchanged_provider_unreachable', 'provider down'); eq(m.calls.length, 0, 'provider down => nothing applied, nothing expired')
})
Deno.test('webhookPurchase: the body is only a hint; the verified lookup decides', async () => {
  const body = { result: 'CAPTURED', amount: '0.001', requested_order_id: compact(OID) }
  let m = mockDb(); let r = await webhookPurchase(m.db, order(), body, 'trk-1', () => Promise.resolve(verified({ found: false })))
  eq(r.status, 422, 'unverifiable'); eq(m.calls.map((c) => c.fn), ['purchase_log'], 'only logged')
  m = mockDb(); r = await webhookPurchase(m.db, order(), body, 'trk-1', () => Promise.resolve(verified({ reference: compact(OTHER) })))
  eq(r.status, 422, 'reference mismatch'); eq(m.calls.map((c) => c.fn), ['purchase_log'], 'only logged')
  m = mockDb(); r = await webhookPurchase(m.db, order(), body, null, () => Promise.resolve(verified({ result: 'NOT CAPTURED', terminal: false })))
  eq(r, { status: 200, body: { outcome: 'ignored_non_terminal' } }, 'body says CAPTURED, provider says pending => ignored'); eq(m.calls.map((c) => c.fn), ['purchase_log'], 'not applied')
  m = mockDb(); r = await webhookPurchase(m.db, order(), body, 'trk-1', () => Promise.reject(new Error('down')))
  eq(r.status, 502, 'provider down => retry later'); eq(m.calls.length, 0, 'nothing applied')
  m = mockDb(); r = await webhookPurchase(m.db, order(), body, 'trk-1', () => Promise.resolve(verified()))
  eq(r.status, 200, 'applied'); eq(m.calls.map((c) => c.fn), ['purchase_apply'], 'apply')
  eq([m.calls[0].args.p_amount, m.calls[0].args.p_currency, m.calls[0].args.p_source, m.calls[0].args.p_order], [0.5, 'KWD', 'webhook', OID], 'amount from the lookup (0.5), not from the body (0.001)')
})
Deno.test('sweepPurchases: throttled per order; paid-but-unfulfilled orders are retried, never expired', async () => {
  const unful = order({ id: OTHER, status: 'paid', paid_at: 'x' })
  const calls: { fn: string; args: any }[] = []
  const db: Db = { rpc: (fn, args) => { calls.push({ fn, args }); return Promise.resolve({ data: fn === 'purchase_overdue' ? [order(), unful] : fn === 'purchase_check_gate' ? args!.p_order === OID : { outcome: 'x' }, error: null }) } }
  const out = await sweepPurchases(db, () => Promise.resolve(verified({ result: 'NOT CAPTURED', terminal: false })))
  eq(out[OID], 'x', 'open overdue order handled'); eq(out[OTHER], 'skipped_recently_checked', 'gate closed => skipped')
  eq(calls.filter((c) => c.fn === 'purchase_apply').map((c) => c.args.p_result), ['EXPIRED'], 'only the open order is expired')
})

// ------------------------------------------------------------------ initiate-purchase
function mkInit(o: { trusted?: boolean; order?: Order; code?: string; chargeFails?: boolean; later?: (Order | null)[] } = {}) {
  const log = { created: [] as unknown[], charges: [] as any[], checkouts: [] as unknown[], failed: [] as unknown[], sleeps: 0 }
  const later = [...(o.later ?? [])]
  const d: IDeps = {
    trusted: () => Promise.resolve(o.trusted ?? true),
    createOrder: (u, k, i, idem) => { log.created.push([u, k, i, idem]); return Promise.resolve(o.code ? { code: o.code } : { order: o.order ?? order({ reused: false }) }) },
    getOrder: () => Promise.resolve(later.length ? later.shift()! : null),
    createCharge: (p) => { log.charges.push(p); return o.chargeFails ? Promise.reject(new Error('gateway rejected the checkout request (HTTP 500)')) : Promise.resolve({ link: 'https://sandbox.upayments.com/pay?session_id=s1', sessionId: 's1' }) },
    setCheckout: (id, s, url) => { log.checkouts.push([id, s, url]); return Promise.resolve() },
    failCreation: (id, r) => { log.failed.push([id, r]); return Promise.resolve() },
    sleep: () => { log.sleeps++; return Promise.resolve() },
    webOrigins: WEB, notificationUrl: 'https://x.supabase.co/functions/v1/payment-webhook',
  }
  return { d, log, ctx: { userId: U, emailVerified: true, lang: 'en' as const } }
}
const good = { kind: 'coins', item_key: 'coins_500', idempotency_key: 'app-key-00000001' }
Deno.test('initiate: untrusted session, unverified e-mail and bad input never reach the database', async () => {
  let m = mkInit({ trusted: false }); eq(await handleInitiate(m.d, m.ctx, good), { status: 403, body: { error: 'device_not_trusted' } }, 'untrusted'); eq(m.log.created.length, 0, 'no order')
  m = mkInit(); eq((await handleInitiate(m.d, { ...m.ctx, emailVerified: false }, good)).body.error, 'email_not_verified', 'unverified')
  for (const [b, e] of [[null, 'invalid_kind'], [{ ...good, kind: 'gift' }, 'invalid_kind'], [{ ...good, item_key: 'Coins 500; drop' }, 'invalid_item_key'], [{ ...good, item_key: 7 }, 'invalid_item_key'],
    [{ ...good, idempotency_key: 'short' }, 'invalid_idempotency_key'], [{ ...good, idempotency_key: 'has spaces in it !!' }, 'invalid_idempotency_key'], [{ kind: 'coins', item_key: 'coins_500' }, 'invalid_idempotency_key'],
    [{ ...good, return_url: 'https://evil.test/x' }, 'return_url_not_allowed'], [{ ...good, return_url: 'javascript:alert(1)' }, 'return_url_not_allowed']] as [unknown, string][]) {
    m = mkInit(); const r = await handleInitiate(m.d, m.ctx, b); eq([r.status, r.body.error], [400, e], 'rejected: ' + e); eq(m.log.created.length + m.log.charges.length, 0, 'nothing created for ' + e)
  }
})
Deno.test('initiate: the amount is the database snapshot; client-sent amount/coins/user are ignored; reference = order id', async () => {
  const m = mkInit({ order: order({ amount_kwd: '0.500', reused: false }) })
  const r = await handleInitiate(m.d, m.ctx, { ...good, amount_kwd: 0.001, amount: 0.001, coins: 999999, price: 0, user_id: OTHER, currency: 'USD', status: 'paid' })
  eq(r, { status: 200, body: { order_id: OID, checkout_url: 'https://sandbox.upayments.com/pay?session_id=s1', kind: 'coins', item_key: 'coins_500', amount_kwd: 0.5, currency: 'KWD', reused: false } }, 'response')
  eq(m.log.created, [[U, 'coins', 'coins_500', 'app-key-00000001']], 'purchase_create gets ONLY user (from the JWT), kind, item, key')
  eq(m.log.charges.length, 1, 'one hosted checkout')
  eq([m.log.charges[0].attemptId, m.log.charges[0].amountKwd, m.log.charges[0].notificationUrl, m.log.charges[0].expiryMinutes], [OID, 0.5, 'https://x.supabase.co/functions/v1/payment-webhook', 15], 'charge = order id + snapshot amount')
  eq([m.log.charges[0].returnUrl, m.log.charges[0].cancelUrl], Array(2).fill('https://app.vora.test/#/purchase/return/' + OID), 'default return page')
  eq(m.log.checkouts, [[OID, 's1', 'https://sandbox.upayments.com/pay?session_id=s1']], 'checkout recorded')
})
Deno.test('initiate: subscription order + app deep link return URL', async () => {
  const m = mkInit({ order: order({ kind: 'subscription', item_key: 'pro', amount_kwd: 14, coins: null, period_days: 30, reused: false }) })
  const r = await handleInitiate(m.d, m.ctx, { kind: 'subscription', item_key: 'pro', idempotency_key: 'app-key-00000002', return_url: 'vora://purchase/return' })
  eq([r.status, r.body.amount_kwd, r.body.kind], [200, 14, 'subscription'], 'ok')
  eq(m.log.charges[0].returnUrl, 'vora://purchase/return?order_id=' + OID, 'deep link with the order id')
  eq(m.log.charges[0].amountKwd, 14, 'plan price from the database')
})
Deno.test('initiate: database refusals map to stable errors and never create a checkout', async () => {
  for (const [code, status, error] of [['PU002', 422, 'item_not_available'], ['PU003', 403, 'email_not_verified'], ['PU004', 409, 'idempotency_key_reused'], ['PU005', 429, 'too_many_open_orders'], ['22023', 400, 'invalid_request'], ['XX000', 500, 'server_error']] as [string, number, string][]) {
    const m = mkInit({ code }); const r = await handleInitiate(m.d, m.ctx, good); eq([r.status, r.body.error], [status, error], code); eq(m.log.charges.length, 0, 'no checkout for ' + code)
  }
})
Deno.test('initiate: a repeated idempotency key returns the same checkout and never creates a second one', async () => {
  let m = mkInit({ order: order({ reused: true, checkout_url: 'https://sandbox.upayments.com/pay?session_id=first' }) })
  let r = await handleInitiate(m.d, m.ctx, good)
  eq([r.status, r.body.checkout_url, r.body.reused], [200, 'https://sandbox.upayments.com/pay?session_id=first', true], 'same link'); eq(m.log.charges.length, 0, 'no second checkout')
  // the first request is still creating the checkout: wait for it instead of creating another
  m = mkInit({ order: order({ reused: true }), later: [order(), order({ checkout_url: 'https://sandbox.upayments.com/pay?session_id=late' })] })
  r = await handleInitiate(m.d, m.ctx, good); eq([r.status, r.body.checkout_url, m.log.sleeps, m.log.charges.length], [200, 'https://sandbox.upayments.com/pay?session_id=late', 2, 0], 'waited for the first request')
  m = mkInit({ order: order({ reused: true }) }); r = await handleInitiate(m.d, m.ctx, good); eq([r.status, r.body.error, m.log.charges.length], [409, 'checkout_in_progress', 0], 'still not ready')
  m = mkInit({ order: order({ reused: true, status: 'paid', paid_at: 'x' }) }); r = await handleInitiate(m.d, m.ctx, good); eq([r.status, r.body.error, m.log.charges.length], [409, 'already_paid', 0], 'paid order: no new checkout')
  m = mkInit({ order: order({ reused: true, status: 'failed' }) }); r = await handleInitiate(m.d, m.ctx, good); eq([r.status, r.body.error, r.body.status], [409, 'order_closed', 'failed'], 'failed order')
  m = mkInit({ order: order({ reused: true, checkout_url: 'https://sandbox.upayments.com/pay?x', expires_at: new Date(Date.now() - 1000).toISOString() }) }); r = await handleInitiate(m.d, m.ctx, good)
  eq([r.status, r.body.error, r.body.status], [409, 'order_closed', 'expired'], 'past its expiry: the old link is not handed out again')
})
Deno.test('initiate: gateway failure closes the order, leaks nothing, grants nothing', async () => {
  const m = mkInit({ chargeFails: true }); const r = await handleInitiate(m.d, m.ctx, good)
  eq(r, { status: 502, body: { error: 'gateway_unavailable', order_id: OID } }, 'safe 502'); eq(m.log.failed.length, 1, 'order closed'); eq(m.log.checkouts.length, 0, 'no checkout recorded')
})

// ------------------------------------------------------------------ purchase-status
function mkStatus(o: { trusted?: boolean; orders?: (Order | null)[]; gate?: boolean; outcome?: string } = {}) {
  const log = { resolved: 0, gates: 0 }; const orders = [...(o.orders ?? [order()])]
  const d: SDeps = {
    trusted: () => Promise.resolve(o.trusted ?? true),
    getOrder: () => Promise.resolve(orders.length > 1 ? orders.shift()! : orders[0]),
    gate: () => { log.gates++; return Promise.resolve(o.gate ?? true) },
    resolve: () => { log.resolved++; return Promise.resolve(o.outcome ?? 'applied') },
  }
  return { d, log }
}
Deno.test('status: trusted session + own order only; another member\'s order looks missing and is never looked up at the provider', async () => {
  let m = mkStatus({ trusted: false }); eq((await handleStatus(m.d, { userId: U }, { order_id: OID })).status, 403, 'untrusted')
  m = mkStatus(); eq((await handleStatus(m.d, { userId: U }, { order_id: 'nope' })).body.error, 'order_id_required', 'bad id')
  m = mkStatus(); eq((await handleStatus(m.d, { userId: U }, null)).status, 400, 'no body')
  m = mkStatus({ orders: [order({ user_id: OTHER })] }); const r = await handleStatus(m.d, { userId: U }, { order_id: OID })
  eq(r, { status: 404, body: { error: 'order_not_found' } }, 'not mine => 404'); eq(m.log.resolved + m.log.gates, 0, 'no provider lookup')
  m = mkStatus({ orders: [null] }); eq((await handleStatus(m.d, { userId: U }, { order_id: OID })).status, 404, 'unknown')
})
Deno.test('status: a pending order is verified with the provider; the answer is the re-read database row', async () => {
  const m = mkStatus({ orders: [order(), order({ status: 'paid', paid_at: '2026-11-20T10:00:00Z', fulfilled_at: '2026-11-20T10:00:00Z', provider_track_id: 'trk-secret', checkout_url: 'https://sandbox.upayments.com/pay?secret' })] })
  const r = await handleStatus(m.d, { userId: U }, { order_id: OID })
  eq([r.status, r.body.status, r.body.fulfilled, r.body.verified_with_provider, r.body.outcome, r.body.coins, r.body.amount_kwd], [200, 'paid', true, true, 'applied', 500, 0.5], 'paid after verification')
  eq(m.log.resolved, 1, 'one provider lookup')
  const s = JSON.stringify(r.body); if (/trk-secret|sandbox\.upayments|sess-1|user_id/.test(s)) throw new Error('provider identifiers / internals leaked: ' + s)
})
Deno.test('status: no provider call when settled, throttled, or there is nothing to look up; a client-sent status changes nothing', async () => {
  let m = mkStatus({ orders: [order({ status: 'paid', paid_at: 'x', fulfilled_at: 'x' })] }); let r = await handleStatus(m.d, { userId: U }, { order_id: OID })
  eq([r.body.status, r.body.verified_with_provider, m.log.resolved], ['paid', false, 0], 'settled')
  m = mkStatus({ gate: false }); r = await handleStatus(m.d, { userId: U }, { order_id: OID, status: 'paid', result: 'CAPTURED' }); eq([r.body.status, r.body.fulfilled, m.log.resolved], ['pending', false, 0], 'throttled; claims in the body are ignored')
  m = mkStatus({ orders: [order({ provider_session_id: null })] }); r = await handleStatus(m.d, { userId: U }, { order_id: OID }); eq([r.body.status, m.log.gates], ['pending', 0], 'no checkout yet')
  m = mkStatus({ outcome: 'unchanged_provider_unreachable' }); r = await handleStatus(m.d, { userId: U }, { order_id: OID }); eq([r.body.status, r.body.verified_with_provider], ['pending', false], 'provider down: still pending, not verified')
  m = mkStatus({ orders: [order({ status: 'paid', paid_at: 'x' }), order({ status: 'paid', paid_at: 'x', fulfilled_at: 'y' })], outcome: 'fulfilled_on_retry' }); r = await handleStatus(m.d, { userId: U }, { order_id: OID })
  eq([r.body.fulfilled, r.body.outcome, m.log.resolved], [true, 'fulfilled_on_retry', 1], 'paid but unfulfilled is retried')
  eq(publicOrder(order()).fulfilled, false, 'publicOrder')
})

// ------------------------------------------------------------------ wiring
const read = (p: string) => Deno.readTextFile(new URL('../../supabase/functions/' + p, import.meta.url))
Deno.test('every function carries an identical copy of the shared helpers', async () => {
  const up = await read('_shared/upayments.ts'), pu = await read('_shared/purchases.ts')
  for (const f of ['initiate-payment', 'payment-webhook', 'payment-reconcile', 'initiate-purchase', 'purchase-status']) eq(await read(f + '/upayments.ts') === up, true, f + '/upayments.ts')
  for (const f of ['payment-webhook', 'payment-reconcile', 'initiate-purchase', 'purchase-status']) eq(await read(f + '/purchases.ts') === pu, true, f + '/purchases.ts')
})
Deno.test('webhook: the signature is verified over the raw body BEFORE any purchase routing; bookings are tried first', async () => {
  const src = await read('payment-webhook/index.ts')
  const iRaw = src.indexOf('await req.text()'), iSig = src.indexOf('verifyWebhook(raw, req.headers, notificationUrl())'), iAttempt = src.indexOf("from('payment_attempts')"), iPurchase = src.indexOf('lookupPurchase(')
  if (!(iRaw > 0 && iSig > iRaw && iAttempt > iSig && iPurchase > iAttempt)) throw new Error('unexpected order: ' + [iRaw, iSig, iAttempt, iPurchase].join(','))
  if (src.indexOf("if (!v.ok)") > iPurchase) throw new Error('purchase routing happens before the signature result is checked')
})
Deno.test('member-facing purchase functions never read an amount from the request and never use a non-sandbox host', async () => {
  for (const f of ['initiate-purchase/core.ts', 'initiate-purchase/index.ts', 'purchase-status/core.ts', 'purchase-status/index.ts']) {
    const src = await read(f)
    if (/\bb(ody)?\??\.(amount|amount_kwd|price|price_kwd|coins|currency|status|user_id)\b/.test(src)) throw new Error(f + ' reads a money field from the request body')
    if (/uapi\.upayments\.com|https:\/\/api\.upayments\.com/.test(src)) throw new Error(f + ' names a production payment host')
  }
})
