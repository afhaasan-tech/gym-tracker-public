import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './Root.tsx'
import ErrorBoundary from './ErrorBoundary'
import { getLang, loadEn } from './i18n'

if (getLang() === 'en') await loadEn().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
)
