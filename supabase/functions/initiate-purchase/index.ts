import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { appUrl, corsHeaders, createCharge, json, notificationUrl, serviceClient } from './upayments.ts'
import { lookupPurchase, type Order } from './purchases.ts'
import { handleInitiate } from './core.ts'

// Member -> VORA. Deploy with verify_jwt = true. Body: { kind: 'coins'|'subscription', item_key, idempotency_key, return_url? }.
// Returns { order_id, checkout_url, ... }. The return page is NEVER proof of payment: the app asks purchase-status afterwards.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(401, { error: 'login_required' })
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const { data: u, error: uerr } = await userClient.auth.getUser()
  if (uerr || !u?.user) return json(401, { error: 'login_required' })

  const body = await req.json().catch(() => null)
  const db = serviceClient()
  const extra = (Deno.env.get('PURCHASE_RETURN_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const r = await handleInitiate({
    async trusted() { const { data } = await userClient.rpc('is_trusted_session'); return data === true },
    async createOrder(userId, kind, item, idem) {
      const { data, error } = await db.rpc('purchase_create', { p_user: userId, p_kind: kind, p_item: item, p_idem: idem })
      if (error) { if (!/^(PU00[1-5]|22023)$/.test(error.code ?? '')) console.error('purchase_create failed', error.code, error.message); return { code: error.code ?? 'error' } }
      return { order: data as Order }
    },
    getOrder: (id) => lookupPurchase(db, id, null),
    createCharge,
    async setCheckout(orderId, sessionId, url) {
      const { error } = await db.rpc('purchase_set_checkout', { p_order: orderId, p_session: sessionId, p_url: url })
      if (error) throw new Error('could not record checkout: ' + error.message)
    },
    async failCreation(orderId, reason) { await db.rpc('purchase_fail_creation', { p_order: orderId, p_reason: reason }) },
    sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
    webOrigins: [appUrl(), ...extra],
    notificationUrl: notificationUrl(),
  }, { userId: u.user.id, emailVerified: Boolean(u.user.email_confirmed_at), lang: req.headers.get('x-lang') === 'en' ? 'en' : 'ar' }, body)
  return json(r.status, r.body)
})
