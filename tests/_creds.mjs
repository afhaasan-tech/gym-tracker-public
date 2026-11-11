// Pre-verified throwaway test accounts. Public signup now requires an e-mail code, which automated tests cannot read,
// so live browser tests log in with accounts created beforehand (tests/make-test-users-sql.mjs <creds.json> <sql> <count>).
import { readFileSync } from 'node:fs'
const list = process.env.TEST_CREDS ? JSON.parse(readFileSync(process.env.TEST_CREDS, 'utf8')) : []
export const cred = (i) => { const c = list[i]; if (!c) throw new Error('Set TEST_CREDS to a creds JSON with at least ' + (i + 1) + ' accounts'); return { email: c.email, password: c.password } }
