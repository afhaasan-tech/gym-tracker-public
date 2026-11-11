import { t } from './i18n'
import { PRICING, LIMITS } from './plans'
import { Page } from './ui'
import { kwd } from './catalog'

type Go = (to: string) => void
type Row = { text: string; on?: boolean }

function Plan({ name, sub, price, badge, rows, action, feature }: { name: string; sub: string; price: string; badge?: string; rows: Row[]; action?: { label: string; onClick?: () => void; disabled?: boolean }; feature?: boolean }) {
  return (
    <section className={feature ? 'card plan feature' : 'card plan'} aria-label={name}>
      <div><h2>{name}</h2><p className="muted small">{sub}</p></div>
      {badge && <span className="chip chip-warn">{badge}</span>}
      <p className="price">{price}</p>
      <ul>{rows.map((r) => <li key={r.text} className={r.on === false ? 'no' : undefined}>{r.text}</li>)}</ul>
      {action && <button type="button" className={action.disabled ? 'outline soon' : 'primary'} disabled={action.disabled} onClick={action.onClick}>{action.label}</button>}
    </section>
  )
}

/** Free / Premium / Coach services model. Display only: nothing here can charge, subscribe or mark a user as paid. */
export default function PlansPage({ go, signedIn }: { go: Go; signedIn: boolean }) {
  const soon = t('متاح بعد الإطلاق')
  return (
    <Page title={t('الباقات والأسعار')} kicker={t('نموذج مجاني / بريميوم / خدمات المدربين')}>
      <p className="card soft muted small" role="note">{t('الأسعار المعروضة فرضيات عمل مبدئية للتخطيط وليست أسعار سوق مثبتة. لا يتم تحصيل أي مبلغ ولا أي اشتراك حالياً.')}</p>
      <div className="plan-grid">
        <Plan name={t('تصفّح مجاني')} sub={t('للزوار بدون حساب')} price={t('مجاني')} rows={[
          { text: t('استكشاف الرياضات والفئات') }, { text: t('تصفّح المدربين المعتمدين') }, { text: t('الخدمات المنشورة وأسعارها الإرشادية') },
          { text: t('معاينة محدودة للتمارين ({0})', [LIMITS.exercises.visitor]) }, { text: t('معاينة محدودة لـ«اختَر عضلتك»') }, { text: t('مقارنة الخيارات قبل التسجيل') }]} />
        <Plan name={t('حساب عضو مجاني')} sub={t('لحفظ بياناتك وتجربة المنصة')} price={t('مجاني')} rows={[
          { text: t('تسجيل التمارين وسجل التقدم الأساسي') }, { text: t('يومية الأكل الأساسية') },
          { text: t('مجموعة تعريفية من التمارين الذاتية ({0})', [LIMITS.exercises.member]) }, { text: t('كل مجموعات العضلات بتمارين تعريفية') },
          { text: t('حجز جلسات المدربين (تجريبي حالياً)') }, { text: t('البرامج المتقدمة والمجموعة الكاملة'), on: false }]}
          action={signedIn ? undefined : { label: t('سوّي حساب مجاني'), onClick: () => go('/login?next=%2Fplans') }} />
        <Plan feature name={t('حيل بريميوم')} sub={t('للتدريب الذاتي المتقدم')} badge={soon}
          price={t('{0} د.ك / شهر', [PRICING.premiumMonthlyKwd.toFixed(3)])} rows={[
            { text: t('برامج تدريب منظمة متقدمة') }, { text: t('مجموعة التمارين الذاتية الكاملة') }, { text: t('مزايا متابعة التقدم المحسّنة') },
            { text: t('موارد وخطط تعليمية مميزة') }, { text: t('مزايا إضافية للمنصة') }, { text: t('أو {0} د.ك سنوياً (فرضية مبدئية)', [PRICING.premiumYearlyKwd.toFixed(3)]) }]}
          action={{ label: soon, disabled: true }} />
        <Plan name={t('خدمات المدربين المستقلين')} sub={t('تُدفع لكل خدمة، والسعر يحدده المدرب ويعتمده المالك')} badge={soon} price={t('حسب الخدمة')} rows={[
          { text: t('تدريب خاص وتدريب جماعي') }, { text: t('أونلاين وحضوري') }, { text: t('باقات تدريب لرياضات محددة') }, { text: t('برامج واستشارات من المدرب') },
          { text: t('خاص: {0}–{1} د.ك للجلسة (إرشادي)', [PRICING.coachPrivateKwd[0], PRICING.coachPrivateKwd[1]]) },
          { text: t('جماعي: {0}–{1} د.ك للجلسة (إرشادي)', [PRICING.coachGroupKwd[0], PRICING.coachGroupKwd[1]]) },
          { text: t('عمولة المنصة قابلة للضبط وتُطبَّق على المدفوعات الموثّقة فقط') }]}
          action={{ label: t('تصفّح الخدمات'), onClick: () => go('/journey/book') }} />
        <Plan name={t('الغذاء والتغذية')} sub={t('اليومية مجانية، والخدمات المتخصصة لاحقاً')} badge={soon} price={t('اليومية مجانية')} rows={[
          { text: t('يومية الأكل الأساسية مجانية دائماً') }, { text: t('مجموعات وصفات مختارة (لاحقاً)') }, { text: t('موارد عامة لتخطيط الوجبات (لاحقاً)') },
          { text: t('برامج مخصصة من مزوّدين مؤهلين فقط (لاحقاً)') }, { text: t('استشارات تغذية معتمدة (لاحقاً)') }]}
          action={{ label: t('استكشف الغذاء'), onClick: () => go('/food') }} />
      </div>
      <section className="card soft"><h2>{t('قواعد أمان وشفافية')}</h2>
        <ul className="list small muted">
          <li>{t('لا حميات مقيّدة ولا أهداف نزول وزن تلقائية ولا توصيات غذائية علاجية.')}</li>
          <li>{t('تمارينك وأكلك وحجوزاتك المحفوظة تبقى متاحة لك دائماً ولا تتأثر بحدود الباقات.')}</li>
          <li>{t('الحجوزات الحالية تجريبية: لا دفع ولا تنفيذ فعلي، وحالة الدفع يحددها الخادم فقط.')}</li>
          <li>{t('سعر أي خدمة اليوم للعرض فقط: {0}', [kwd(PRICING.coachPrivateKwd[0])])}</li>
        </ul></section>
    </Page>
  )
}
