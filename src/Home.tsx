// Home page lives in its own small module so the first paint does not wait for the exercise/food libraries.
import { useCoaches, useServices } from './catalog'
import { LoadingState, ErrorState, DemoBadge } from './ui'
import { t } from './i18n'
import { UserCheck, Users, Dumbbell, Salad, CalendarCheck, Tag, type LucideIcon } from 'lucide-react'

type Go = (to: string) => void
const Loading = LoadingState
const Err = ({ msg }: { msg: string }) => <ErrorState msg={msg} />
const Demo = DemoBadge

const choices = (): { label: string; to: string; hint: string; Icon: LucideIcon }[] => [
  { label: t('أبي مدرب خاص'), to: '/journey/private', Icon: UserCheck, hint: t('جلسات فردية مع مدرب مستقل') },
  { label: t('أبي تدريب جماعي'), to: '/journey/group', Icon: Users, hint: t('حصص لمجموعات صغيرة') },
  { label: t('أبي أتمرن بروحي'), to: '/self', Icon: Dumbbell, hint: t('تمارين مجانية حسب هدفك') },
  { label: t('أبي نظام غذائي'), to: '/food', Icon: Salad, hint: t('يومية الأكل والمعلومات والخدمات') },
  { label: t('أبي أحجز جلسة'), to: '/journey/book', Icon: CalendarCheck, hint: t('من الرياضة إلى الموعد') },
]
export function HomePage({ go }: { go: Go }) {
  const coaches = useCoaches(), services = useServices()
  return (
    <main className="screen market home">
      <section className="home-hero">
        <span className="eyebrow">{t("ڤورا · من الكويت لك")}</span>
        <h1>{t("مدربك الشخصي… في جيبك")}</h1>
        <p>{t("تمارين وأكل ومتابعة بخطوات بسيطة، بالعربي وعلى كيفك.")}</p>
        <div className="row-actions home-cta">
          <button className="primary" type="button" onClick={() => go('/login')}>{t("ابدأ مجاناً")}</button>
          <button className="outline" type="button" onClick={() => go('/self')}>{t("تصفّح بدون حساب")}</button>
        </div>
      </section>
      <section aria-label={t("كيف تبدأ")}><h2>{t("كيف تبدأ")}</h2>
        <ol className="home-steps">
          <li><b>{t("سوّ حسابك")}</b><span className="muted small">{t("بالإيميل، وياخذ أقل من دقيقة.")}</span></li>
          <li><b>{t("اختر هدفك")}</b><span className="muted small">{t("نزّل وزن، عضل، أو لياقة عامة.")}</span></li>
          <li><b>{t("تمرّن وتابع تقدمك")}</b><span className="muted small">{t("سجّل تمارينك وأكلك وشوف تطورك أسبوع بأسبوع.")}</span></li>
        </ol>
      </section>
      <section aria-label={t("ابدأ من هنا")}><h2>{t("وش تبي اليوم؟")}</h2>
        <div className="choice-grid">{choices().map((c) => <button key={c.to} type="button" className="choice card" onClick={() => go(c.to)}><c.Icon size={22} aria-hidden="true" className="choice-icon" /><strong>{c.label}</strong><span className="muted small">{c.hint}</span></button>)}</div>
      </section>
      <section><div className="section-head"><h2>{t("مدربون معتمدون")}</h2><button className="link" type="button" onClick={() => go('/coaches')}>{t("كل المدربين")}</button></div>
        {coaches.loading ? <Loading /> : coaches.data.length === 0 ? <p className="muted">{t("ما في مدربين معتمدين حالياً.")}</p>
          : <div className="card-grid">{coaches.data.slice(0, 3).map((c) => <button key={c.id} type="button" className="card coach-card" onClick={() => go(`/coaches/${c.id}`)}><strong>{c.display_name}</strong>{c.is_demo && <Demo />}<span className="muted small">{c.bio.slice(0, 90)}</span></button>)}</div>}
        <Err msg={coaches.error} />
      </section>
      <section className="split">
        <div className="card"><h2>{t("تمارين مجانية بروحك")}</h2><p className="muted">{t("اختر عضلتك أو هدفك وشوف التمارين المناسبة. الحفظ في سجلك يحتاج حساب.")}</p><div className="row-actions"><button className="outline" type="button" onClick={() => go('/self')}>{t("أتمرن بروحي")}</button><button className="outline" type="button" onClick={() => go('/muscles')}>{t("اختَر عضلتك")}</button></div></div>
        <div className="card"><h2>{t("الغذاء والتغذية")}</h2><p className="muted">{t("يومية أكل مجانية للأعضاء، ومعلومات عامة، وخدمات تغذية من مزوّدين مؤهلين عند اعتمادهم.")}</p><div className="row-actions"><button className="outline" type="button" onClick={() => go('/food')}>{t("استكشف الغذاء")}</button></div></div>
      </section>
      <section className="card soft row"><div className="row-body"><h2>{t('الباقات والأسعار')}</h2><p className="muted small">{t('تصفّح مجاني، حساب عضو مجاني، وبريميوم قريباً.')}</p></div><button className="outline" type="button" onClick={() => go('/plans')}><Tag size={16} aria-hidden="true" /> {t('شوف الباقات')}</button></section>
      <p className="muted small note">{t("ملاحظة: الحجوزات والأسعار المعروضة تجريبية فقط ولا يتم أي دفع أو تنفيذ فعلي.")} {services.data.length > 0 && t("عدد الخدمات المنشورة حالياً: {0}.", [services.data.length])}</p>
    </main>
  )
}
