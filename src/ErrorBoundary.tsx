import { Component, type ReactNode } from 'react'
import { Brand } from './brand'
import { t } from './i18n'

/** Last-resort screen so a crash never leaves a blank page. Shows no technical details to the user. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="state-screen" role="alert">
        <Brand />
        <h1>{t('صار خطأ غير متوقع')}</h1>
        <p className="muted">{t('بياناتك المحفوظة بخير. حدّث الصفحة وجرّب مرة ثانية.')}</p>
        <button className="primary" type="button" onClick={() => { location.hash = '#/'; location.reload() }}>{t('تحديث الصفحة')}</button>
      </main>
    )
  }
}
