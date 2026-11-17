import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, serviceClient } from './upayments.ts'
import { lookupPurchase, resolvePurchase } from './purchases.ts'
import { handleStatus } from './core.ts'

// Member -> VORA. Deploy with verify_jwt = true. Body: { order_id }. Returns the member's own order after a server-side provider check.
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
  const r = await handleStatus({
    async trusted() { const { data } = await userClient.rpc('is_trusted_session'); return data === true },
    getOrder: (id) => lookupPurchase(db, id, null),
    async gate(orderId) { const { data } = await db.rpc('purchase_check_gate', { p_order: orderId, p_min_seconds: 5 }); return data === true },
    resolve: (o) => resolvePurchase(db, o, 'status', false),
  }, { userId: u.user.id }, body)
  return json(r.status, r.body)
})
