import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { GROUPS, groupOfMuscleName, groupName } from './muscles'
import { ExerciseCards } from './pages'
import { findAnatomyInfo } from './kw/anatomyInfo.js'
import { t } from './i18n'

const Canvas = lazy(() => import('./kw/AnatomyCanvas.jsx'))
const MODEL_URL = `${import.meta.env.BASE_URL}body.glb`

type Rec = { id: string; name: string; type: string; group: string | null }

/** «اختَر عضلتك»: pick a trainable muscle group on the 3D body, then choose one of its exercises. */
export default function MuscleExplorer({ session, go, initialGroup }: { session: Session | null; go: (to: string) => void; initialGroup: string | null }) {
  const [group, setGroup] = useState<string | null>(initialGroup)
  const [part, setPart] = useState<Rec | null>(null)
  const [action, setAction] = useState<{ type: string; group?: string; nonce: number } | null>(null)
  const nonce = useRef(0)
  const onSelect = useCallback((r: Rec | null) => { setPart(r); if (r?.group) setGroup(r.group) }, [])
  const pick = (id: string) => { setGroup(id); nonce.current += 1; setAction({ type: 'selectGroup', group: id, nonce: nonce.current }) }
  const g = GROUPS.find((x) => x.id === group)
  const arabic = useMemo(() => { if (!part) return ''; for (const c of [part.name, part]) { try { const i = findAnatomyInfo(c) as { ar?: string } | null; if (i?.ar) return i.ar } catch { /* try next shape */ } } return '' }, [part])
  return (
    <main className="screen market muscle-explorer" dir="rtl" lang="ar">
      <div className="page-title"><span className="eyebrow">Muscle Explorer</span><h1>{t("اختَر عضلتك")}</h1>
        <p className="muted">{t("دوّر المجسّم واضغط على العضلة اللي تبي تدرّبها، أو اختر المجموعة من القائمة، وبعدها شوف تمارينها.")}</p></div>
      <div className="me-layout">
        <section className="me-viewer card" aria-label={t("مجسّم العضلات ثلاثي الأبعاد")}>
          <Suspense fallback={<p className="muted empty" role="status">{t("جارٍ تحضير المجسّم…")}</p>}>
            <Canvas modelUrl={MODEL_URL} mode="trainable" groupOf={groupOfMuscleName} onSelect={onSelect} onReady={() => undefined} action={action} />
          </Suspense>
        </section>
        <section className="me-panel">
          <h2>{t("مجموعات العضلات")}</h2>
          <div className="chips wrap" role="group" aria-label={t("مجموعات العضلات")}>
            {GROUPS.map((x) => <button key={x.id} type="button" className={group === x.id ? 'chip chip-btn on' : 'chip chip-btn'} aria-pressed={group === x.id} onClick={() => pick(x.id)}>{groupName(x)}</button>)}
          </div>
          {g ? (
            <div aria-live="polite">
              <h2>{groupName(g)}</h2>
              {part?.group === g.id && <p className="muted small">{t("العضلة المحددة:")} <strong>{arabic || part.name}</strong>{arabic ? <span dir="ltr"> ({part.name})</span> : null}</p>}
              <h3>{t("تمارين هذي المجموعة")}</h3>
              <ExerciseCards group={g.id} session={session} go={go} back={`/muscles?group=${g.id}`} />
            </div>
          ) : <p className="muted">{t("اختر مجموعة أو اضغط على المجسّم.")}</p>}
        </section>
      </div>
    </main>
  )
}
