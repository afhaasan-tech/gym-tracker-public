// Mail abstraction for the 6-digit device code.
//   MAIL_MODE=brevo  + BREVO_API_KEY + MAIL_FROM  -> Brevo transactional e-mail (sender verified by e-mail address; no domain needed)
//   MAIL_MODE=live   + RESEND_API_KEY + MAIL_FROM -> Resend
//   unset            -> 'mock': writes to public.dev_mock_outbox, a table that exists ONLY in staging (fails closed elsewhere).
// MAIL_FROM is "Name <address>" or a bare address. Keys live only in Supabase Edge Function secrets.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*(.*?)\s*<\s*([^>\s]+@[^>\s]+)\s*>\s*$/)
  return m ? { name: m[1] || 'VORA', email: m[2] } : { name: 'VORA', email: from.trim() }
}

export async function sendMail(db: SupabaseClient, to: string, subject: string, text: string): Promise<void> {
  const mode = Deno.env.get('MAIL_MODE')
  const from = Deno.env.get('MAIL_FROM') ?? ''
  if (mode === 'brevo') {
    const key = Deno.env.get('BREVO_API_KEY')
    if (!key || !from) throw new Error('mailer not configured')
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ sender: parseFrom(from), to: [{ email: to }], subject, textContent: text }),
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) throw new Error('mail provider error ' + r.status)
    return
  }
  if (mode === 'live') {
    const key = Deno.env.get('RESEND_API_KEY')
    if (!key || !from) throw new Error('mailer not configured')
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, text }), signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('mail provider error ' + r.status)
    return
  }
  const { error } = await db.from('dev_mock_outbox').insert({ to_email: to, subject, body: text })
  if (error) throw new Error('mock mailbox unavailable')
}
