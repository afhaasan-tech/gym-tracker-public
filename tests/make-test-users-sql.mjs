// Supabase's built-in email sender is rate-limited, so for automated tests we seed two confirmed
// throwaway users directly. Only bcrypt HASHES go into the SQL; plaintext passwords stay in a file outside the repo.
import bcrypt from 'bcryptjs'
import { randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
const [credsOut, sqlOut] = process.argv.slice(2)
const run = randomBytes(3).toString('hex')
const users = ['a', 'b'].map((n) => ({ id: randomUUID(), email: `gymtest-${n}-${run}@example.com`, password: randomBytes(12).toString('hex') }))
const sql = users.map((u) => {
  const hash = bcrypt.hashSync(u.password, 10)
  return `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','${u.id}','authenticated','authenticated','${u.email}','${hash}',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
insert into auth.identities (id,user_id,provider_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
values (gen_random_uuid(),'${u.id}','${u.id}','{"sub":"${u.id}","email":"${u.email}","email_verified":true}','email',now(),now(),now());`
}).join('\n')
writeFileSync(credsOut, JSON.stringify(users)); writeFileSync(sqlOut, sql)
console.log('emails:', users.map((u) => u.email).join(', '))
