// Phase 1: create two throwaway test accounts. Credentials are written to a file OUTSIDE the repo.
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
const out = process.argv[2]
const sb = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
const run = randomBytes(3).toString('hex')
const users = ['a', 'b'].map((n) => ({ email: `${(process.env.TEST_EMAIL_BASE || 'your.name@gmail.com').replace('@', `+gymtest${n}${run}@`)}`, password: randomBytes(12).toString('hex') + 'Aa!9' }))
for (const u of users) {
  const { error } = await sb().auth.signUp(u)
  console.log(u.email, error ? 'ERROR ' + error.message : 'signed up')
}
writeFileSync(out, JSON.stringify(users))
