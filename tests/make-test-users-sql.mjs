// Supabase's built-in e-mail sender is rate-limited and public signup now needs an e-mail code, so automated tests use
// pre-verified throwaway users created directly. Only bcrypt HASHES go into the SQL; plaintext passwords stay in a creds file outside the repo.
// Usage: node tests/make-test-users-sql.mjs <credsOut.json> <sqlOut.sql> [count]
import bcrypt from 'bcryptjs'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
const [credsOut, sqlOut, count = '2'] = process.argv.slice(2)
const run = randomBytes(3).toString('hex')
const users = Array.from({ length: Number(count) }, (_, i) => ({ id: randomUUID(), email: `gymtest-${i}-${run}@example.com`, password: randomBytes(12).toString('hex') + 'Aa!9' }))
const rows = users.map((u) => `('00000000-0000-0000-0000-000000000000','${u.id}','authenticated','authenticated','${u.email}','${bcrypt.hashSync(u.password, 10)}',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','')`).join(',\n')
const sql = `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
values ${rows};
insert into auth.identities (id,user_id,provider_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
select gen_random_uuid(), u.id, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u where u.email like 'gymtest-%-${run}@example.com';`
writeFileSync(credsOut, JSON.stringify(users)); writeFileSync(sqlOut, sql)
console.log('emails:', users.map((u) => u.email).join(', '))
