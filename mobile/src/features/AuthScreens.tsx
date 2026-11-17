// Sign in / sign up / e-mail verification and the trusted-device gate. Same flows and server calls as the VORA web app.
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { Button, Card, ErrorText, Field, H1, Screen, T, s } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { c, fs } from '../lib/theme'

function authMessage(L: (ar: string, en: string) => string, e: { message?: string; code?: string; status?: number }): string {
  const code = e.code ?? '', m = (e.message ?? '').toLowerCase()
  if (code === 'invalid_credentials' || m.includes('invalid login')) return L('الإيميل أو الرقم السري مب صحيح.', 'Wrong email or password.')
  if (code === 'user_already_exists' || m.includes('already registered')) return L('هذا الإيميل مسجّل من قبل.', 'This email is already registered.')
  if (code === 'weak_password' || m.includes('password should')) return L('الرقم السري ضعيف. استخدم 8 خانات على الأقل.', 'Weak password. Use at least 8 characters.')
  if (e.status === 429 || m.includes('rate limit')) return L('طلبات واجد. انتظر شوي.', 'Too many requests. Please wait.')
  if (m.includes('network') || m.includes('fetch')) return L('ما قدرنا نتصل. شيّك على الإنترنت.', 'Could not connect. Check your internet.')
  return L('صار خطأ. جرّب مرة ثانية.', 'Something went wrong. Try again.')
}

export function LangToggle() {
  const { lang, setLang } = useI18n()
  return <Button variant="link" testID="lang-toggle" label={lang === 'ar' ? 'English' : 'العربية'} onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} />
}

export function AuthScreen() {
  const { L } = useI18n()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  async function submit() {
    setBusy(true); setMsg('')
    const e = email.trim().toLowerCase()
    const { error } = mode === 'in' ? await supabase.auth.signInWithPassword({ email: e, password }) : await supabase.auth.signUp({ email: e, password })
    setBusy(false)
    if (error) setMsg(authMessage(L, error))
  }
  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[s.pad, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: 4 }}>
            <T bold size={fs.xxl} style={{ color: c.accent, textAlign: 'center' }}>VORA | ڤورا</T>
            <T muted style={{ textAlign: 'center' }}>{L('مدربك الشخصي… في جيبك', 'Your personal coach… in your pocket')}</T>
          </View>
          <Card>
            <H1>{mode === 'in' ? L('تسجيل الدخول', 'Sign in') : L('حساب جديد', 'Create account')}</H1>
            <Field testID="email" label={L('الإيميل', 'Email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" style={{ textAlign: 'left' }} />
            <Field testID="password" label={L('الرقم السري', 'Password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'in' ? 'current-password' : 'new-password'} style={{ textAlign: 'left' }} />
            {msg ? <ErrorText>{msg}</ErrorText> : null}
            <Button testID="auth-submit" busy={busy} disabled={!email.trim() || password.length < 6} label={mode === 'in' ? L('دخول', 'Sign in') : L('سوّ حساب', 'Sign up')} onPress={submit} />
            <Button variant="link" label={mode === 'in' ? L('جديد؟ سوّ حساب', 'New here? Create an account') : L('عندي حساب', 'I already have an account')} onPress={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg('') }} />
          </Card>
          <LangToggle />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function CodeForm({ title, body, onSend, onVerify, sentInitially, footer }: { title: string; body: string; onSend: () => Promise<string | null>; onVerify: (code: string) => Promise<boolean>; sentInitially?: boolean; footer?: React.ReactNode }) {
  const { L } = useI18n()
  const [sent, setSent] = useState(Boolean(sentInitially)), [code, setCode] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  async function send() {
    setBusy(true); setMsg('')
    const err = await onSend()
    setBusy(false)
    if (err) setMsg(err === 'too_many_requests' ? L('طلبات كثيرة، انتظر قليلاً.', 'Too many requests. Please wait.') : L('تعذر إرسال الرمز.', 'Could not send the code.'))
    else setSent(true)
  }
  async function verify() {
    setBusy(true); setMsg('')
    const ok = await onVerify(code)
    setBusy(false)
    if (!ok) setMsg(L('الرمز غير صحيح أو منتهي.', 'Invalid or expired code.'))
  }
  return (
    <Screen>
      <ScrollView contentContainerStyle={[s.pad, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
        <Card style={{ alignItems: 'stretch' }}>
          <H1>{title}</H1>
          <T muted>{body}</T>
          {!sent ? <Button testID="send-code" busy={busy} label={L('أرسل الرمز', 'Send code')} onPress={send} /> : (
            <>
              <Field testID="otp" label={L('الرمز', 'Code')} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" style={{ textAlign: 'center', fontSize: 26, letterSpacing: 8 }} />
              <Button testID="verify-code" busy={busy} disabled={code.length !== 6} label={L('تأكيد', 'Verify')} onPress={verify} />
              <Button variant="link" disabled={busy} label={L('إعادة الإرسال', 'Resend')} onPress={send} />
            </>
          )}
          {msg ? <ErrorText>{msg}</ErrorText> : null}
        </Card>
        {footer}
      </ScrollView>
    </Screen>
  )
}

/** E-mail not confirmed yet: the 6-digit sign-up code (Supabase Auth). */
export function VerifyEmailScreen({ email }: { email: string }) {
  const { L } = useI18n()
  const { signOut } = useSession()
  return (
    <CodeForm sentInitially title={L('تأكيد الإيميل', 'Confirm your email')}
      body={L(`أرسلنا رمز من 6 أرقام إلى ${email}.`, `We sent a 6-digit code to ${email}.`)}
      onSend={async () => { const { error } = await supabase.auth.resend({ type: 'signup', email }); return error ? 'failed' : null }}
      onVerify={async (code) => { const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' }); return !error }}
      footer={<Button variant="link" label={L('خروج', 'Sign out')} onPress={signOut} />} />
  )
}

/** Trusted-device gate: no private screen renders until the server says this device is trusted. */
export function DeviceGateScreen() {
  const { L, lang } = useI18n()
  const { sendCode, verifyCode, signOut } = useSession()
  return (
    <CodeForm title={L('تأكيد هذا الجهاز', 'Verify this device')}
      body={L('لحماية حسابك، نرسل رمزاً من 6 أرقام إلى بريدك. حسابك يشتغل على جهازين موثوقين كحد أقصى، والجهاز الثالث يستبدل الأقدم.', 'To protect your account we email you a 6-digit code. Your account works on up to two trusted devices; a third replaces the oldest.')}
      onSend={() => sendCode(lang)} onVerify={verifyCode}
      footer={<Button variant="link" label={L('خروج', 'Sign out')} onPress={signOut} />} />
  )
}
