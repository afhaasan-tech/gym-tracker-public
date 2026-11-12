// deno test --allow-env tests/edge/upayments.test.ts   (pure logic: signatures, webhook verification, sandbox guard)
import { apiBase, hmacB64, safeEqual, verifyWebhook } from '../../supabase/functions/_shared/upayments.ts'
const eq = (a: unknown, b: unknown, m: string) => { if (a !== b) throw new Error(`${m}: got ${a}, want ${b}`) }

Deno.test('HMAC matches an independent Node crypto vector', async () => {
  // node -e "console.log(require('crypto').createHmac('sha256','sk_test').update('1718365200POSTcharge{\"a\":1}').digest('base64'))"
  eq(await hmacB64('sk_test', '1718365200POSTcharge{"a":1}'), 'gcL45o+vrb+dbiXvYRmn5TdnJuRyd1beWeeGOMrI8nI=', 'vector')
})
Deno.test('safeEqual', () => { eq(safeEqual('abc', 'abc'), true, 'same'); eq(safeEqual('abc', 'abd'), false, 'diff'); eq(safeEqual('abc', 'abcd'), false, 'len') })
Deno.test('webhook verification: valid, tampered, unsigned, stale, wrong url', async () => {
  Deno.env.set('UPAYMENTS_HMAC_SECRET', 'sk_test_unit')
  const url = 'https://x.supabase.co/functions/v1/payment-webhook', raw = '{"result":"CAPTURED","track_id":"t1"}', ts = '1700000000'
  const sig = await hmacB64('sk_test_unit', ts + 'POST' + url + raw)
  const h = (s: string, t: string) => new Headers({ 'x-signature': s, 'x-timestamp': t })
  const now = 1700000100 * 1000
  eq((await verifyWebhook(raw, h(sig, ts), url, now)).ok, true, 'valid')
  eq((await verifyWebhook(raw.replace('CAPTURED', 'CAPTURED '), h(sig, ts), url, now)).reason, 'bad_signature', 'tampered body')
  eq((await verifyWebhook(raw, new Headers(), url, now)).reason, 'missing_signature', 'unsigned')
  eq((await verifyWebhook(raw, h(sig, ts), url, now + 3600_000)).reason, 'stale_timestamp', 'stale (replay)')
  eq((await verifyWebhook(raw, h(sig, ts), url + '?x=1', now)).reason, 'bad_signature', 'different url')
})
Deno.test('sandbox guard refuses any non-sandbox API host', () => {
  Deno.env.set('UPAYMENTS_BASE', 'https://uapi.upayments.com/api/v1/')
  let threw = false; try { apiBase() } catch { threw = true }
  eq(threw, true, 'production host refused')
  Deno.env.delete('UPAYMENTS_BASE'); eq(apiBase().startsWith('https://sandboxapi.upayments.com/'), true, 'default sandbox')
})
