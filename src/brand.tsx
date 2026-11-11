import { getLang } from './i18n'

/** VORA / ڤورا — brand chosen by the owner (provisional until trademark clearance). Mark: two dhow sails (turquoise + gold) over a hull, a nod to Kuwait's sea heritage. */
export function Mark({ size = 36 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 64 64" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="vora-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#12435A" /><stop offset="1" stopColor="#081827" /></linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#vora-bg)" />
      <path d="M30 12v31H11z" fill="#22D3B6" />
      <path d="M34 21v22h19z" fill="#F2B84B" />
      <path d="M9 47h46l-6 7H15z" fill="#EAF2F8" />
    </svg>
  )
}

export function Brand({ size = 34 }: { size?: number }) {
  const ar = getLang() === 'ar'
  return (
    <span className="brand-lockup" aria-label={ar ? 'ڤورا' : 'VORA'}>
      <Mark size={size} />
      <span className={ar ? 'wordmark wordmark-ar' : 'wordmark wordmark-en'} aria-hidden="true">{ar ? 'ڤورا' : 'VORA'}</span>
    </span>
  )
}
