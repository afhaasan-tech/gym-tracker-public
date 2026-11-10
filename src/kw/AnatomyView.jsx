import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Box,
  Check,
  CircleHelp,
  Layers3,
  MousePointer2,
  RotateCcw,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import AnatomyCanvas from './AnatomyCanvas.jsx';
import ElbowMotion from './ElbowMotion.jsx';
import { findAnatomyInfo } from './anatomyInfo.js';
import './anatomy.css';

const MAX_RESULTS = 40;
const LAYERS = [
  { value: 'all', label: 'الكل' },
  { value: 'muscle', label: 'العضلات' },
  { value: 'bone', label: 'العظام' },
];

function safeWebUrl(value, wikipediaOnly = false) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (wikipediaOnly && !/(^|\.)wikipedia\.org$/i.test(url.hostname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

// The information catalogue may match either the model name or the part itself.
function informationFor(part) {
  if (!part) return null;
  for (const candidate of [part.name, part]) {
    if (!candidate) continue;
    try {
      const info = findAnatomyInfo(candidate);
      if (info && typeof info === 'object') return info;
    } catch {
      // A catalogue that accepts one input shape need not accept the other.
    }
  }
  return null;
}

function searchable(value) {
  return String(value ?? '').toLocaleLowerCase('ar').normalize('NFKC').trim();
}

function partTypeLabel(type) {
  const normalized = String(type ?? '').toLowerCase();
  if (normalized.includes('muscle') || normalized.includes('عضل')) return 'عضلة';
  if (normalized.includes('bone') || normalized.includes('عظم')) return 'عظم';
  return 'جزء تشريحي';
}

function ReferenceLink({ href, children }) {
  return <a className="anatomy-reference" href={href} target="_blank" rel="noopener noreferrer">{children}<ArrowUpRight size={14} aria-hidden="true" /></a>;
}

function DetailRow({ title, value, source }) {
  if (!value) return null;
  return (
    <div className="anatomy-detail-row">
      <dt>{title}</dt>
      <dd>{value}</dd>
      <ReferenceLink href={source}>مصدر {title}</ReferenceLink>
    </div>
  );
}

function AnatomyWorkspace({ modelUrl, go }) {
  const [mode, setMode] = useState('all');
  const [action, setAction] = useState(null);
  const [parts, setParts] = useState([]);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [motionOpen, setMotionOpen] = useState(false);
  const nonce = useRef(0);

  const handleReady = useCallback((items) => {
    setParts(Array.isArray(items) ? items : []);
    setReady(Array.isArray(items) && items.length > 0);
  }, []);

  const handleSelect = useCallback((item) => {
    setSelected(item || null);
  }, []);

  const sendAction = (type, id) => {
    nonce.current += 1;
    setAction(id === undefined ? { type, nonce: nonce.current } : { type, id, nonce: nonce.current });
  };

  const choosePart = (part) => {
    const type = partTypeLabel(part.type);
    if ((mode === 'muscle' && type !== 'عضلة') || (mode === 'bone' && type !== 'عظم')) {
      setMode('all');
    }
    setSelected(part);
    sendAction('select', part.id);
  };

  const indexedParts = useMemo(() => parts.map((part) => ({
    part,
    info: informationFor(part),
  })), [parts]);

  const matches = useMemo(() => {
    const term = searchable(query);
    if (!term) return indexedParts;
    return indexedParts.filter(({ part, info }) =>
      [part.name, part.detail, info?.ar, partTypeLabel(part.type)].some((value) => searchable(value).includes(term)),
    );
  }, [indexedParts, query]);
  const visibleParts = matches.slice(0, MAX_RESULTS);
  const selectedInfo = useMemo(() => informationFor(selected), [selected]);
  const contentSource = safeWebUrl(selectedInfo?.sourceUrl);
  const wikipedia = safeWebUrl(selected?.wikiLink, true);
  const hasArabicInfo = Boolean(selectedInfo && contentSource);

  return (
    <main className="anatomy-view" dir="rtl" lang="ar">
      <header className="anatomy-header">
        <div className="anatomy-header-copy">
          <span className="anatomy-kicker"><span aria-hidden="true" /> تعرّف على جسمك</span>
          <h1>التشريح <span>ثلاثي الأبعاد</span></h1>
          <p>اكتشف البنية التشريحية من زوايا مختلفة. اسحب لتدوير النموذج، ثم اختر جزءاً من الجسم أو ابحث عنه في القائمة.</p>
        </div>
        <div className="anatomy-header-badge" aria-hidden="true"><Box size={25} strokeWidth={1.6} /><span>3D<br />ATLAS</span></div>
      </header>

      <section className="anatomy-notice" aria-label="حدود النموذج">
        <CircleHelp size={21} aria-hidden="true" />
        <div><strong>للتعلّم، وليس للاستخدام الطبي</strong><p>النموذج لرجل بالغ وهو تعليمي وغير طبي، ولا يمثّل جميع الاختلافات الفردية. نموذج الأطلس ثابت؛ مواضع المنشأ والمرتكز فيه تُعرض نصياً لبعض العضلات. يعرض مختبر الحركة أدناه مثالاً منفصلاً ومبسّطاً للمرفق، لا حركة واقعية لجميع عضلات الجسم.</p></div>
      </section>

      <div className="anatomy-workspace">
        <section className="anatomy-viewer" aria-labelledby="anatomy-viewer-title">
          <div className="anatomy-viewer-header">
            <div><span className="anatomy-section-kicker">مساحة الاستكشاف</span><h2 id="anatomy-viewer-title">استعرض النموذج</h2></div>
            <div className="anatomy-layer-controls" role="group" aria-label="طبقات النموذج">
              <Layers3 size={17} aria-hidden="true" />
              {LAYERS.map((layer) => <button key={layer.value} type="button" disabled={!modelUrl} className={mode === layer.value ? 'is-active' : ''} aria-pressed={mode === layer.value} onClick={() => setMode(layer.value)}>{layer.label}</button>)}
            </div>
          </div>

          <div className="anatomy-stage">
            <div className="anatomy-stage-caption" aria-hidden="true"><span className="anatomy-status-dot" /> نموذج تفاعلي <span className="anatomy-caption-separator">/</span> {LAYERS.find((layer) => layer.value === mode)?.label}</div>
            {modelUrl && <div className="anatomy-canvas-host">
              <AnatomyCanvas modelUrl={modelUrl} mode={mode} onReady={handleReady} onSelect={handleSelect} action={action} />
            </div>}
            {!modelUrl && <div className="anatomy-loading anatomy-missing" role="status"><Box size={28} aria-hidden="true" /><strong>رابط النموذج غير متاح</strong><span>افتح الإعدادات وأضف رابط الخدمة المنشورة لتنزيل نموذج التشريح.</span>{typeof go === 'function' && <button type="button" onClick={() => go('settings')}>فتح الإعدادات</button>}</div>}
            {modelUrl && <div className="anatomy-stage-help"><MousePointer2 size={16} aria-hidden="true" /> اسحب للتدوير · انقر على جزء لتحديده</div>}
          </div>

          <div className="anatomy-toolbar" aria-label="أدوات عرض النموذج">
            <div className="anatomy-views" role="group" aria-label="اتجاه عرض النموذج">
              <span>زاوية العرض</span>
              <button type="button" disabled={!ready} onClick={() => sendAction('front')}>أمام</button>
              <button type="button" disabled={!ready} onClick={() => sendAction('back')}>خلف</button>
              <button type="button" disabled={!ready} onClick={() => sendAction('left')}>جانب</button>
            </div>
            <div className="anatomy-zoom" role="group" aria-label="التحكم في حجم النموذج وإعادة ضبطه">
              <button type="button" disabled={!ready} aria-label="تكبير النموذج" title="تكبير" onClick={() => sendAction('zoomIn')}><ZoomIn size={18} aria-hidden="true" /></button>
              <button type="button" disabled={!ready} aria-label="تصغير النموذج" title="تصغير" onClick={() => sendAction('zoomOut')}><ZoomOut size={18} aria-hidden="true" /></button>
              <button type="button" disabled={!ready} aria-label="إعادة ضبط العرض" title="إعادة ضبط" onClick={() => sendAction('reset')}><RotateCcw size={18} aria-hidden="true" /><span>إعادة ضبط</span></button>
            </div>
          </div>
        </section>

        <aside className="anatomy-sidebar" aria-label="تفاصيل الأجزاء وقائمة البحث">
          <section className="anatomy-details" aria-labelledby="anatomy-details-title">
            <div className="anatomy-panel-heading"><div><span className="anatomy-section-kicker">نظرة أقرب</span><h2 id="anatomy-details-title">تفاصيل الجزء</h2></div><span className="anatomy-panel-icon"><MousePointer2 size={18} aria-hidden="true" /></span></div>
            <div aria-live="polite" aria-atomic="true">
              {selected ? <div className="anatomy-selection">
                <span className="anatomy-type">{partTypeLabel(selected.type)}</span>
                {hasArabicInfo && selectedInfo.ar && <h3>{selectedInfo.ar}</h3>}
                <div className="anatomy-model-name"><span>الاسم في النموذج</span><strong dir="auto">{selected.name || 'اسم غير متاح'}</strong>{selected.detail && selected.detail !== selected.name && <small dir="auto">{selected.detail}</small>}<small>قد لا يحدد المصدر جهة الجزء.</small></div>
                {mode !== 'all' && selected.type !== mode && <p className="anatomy-unavailable">الجزء المحدد مخفي في الطبقة الحالية. اختر «الكل» لإظهاره.</p>}
                {hasArabicInfo ? <>
                  <p className="anatomy-general-note">المعلومات التالية تصف العضلة عموماً؛ قد تختلف رؤوس العضلة وتفاصيلها التشريحية.</p>
                  {selectedInfo.ar && <ReferenceLink href={contentSource}>مصدر الاسم العربي</ReferenceLink>}
                  <dl className="anatomy-detail-list">
                    <DetailRow title="المنشأ" value={selectedInfo.origin} source={contentSource} />
                    <DetailRow title="المرتكز" value={selectedInfo.insertion} source={contentSource} />
                    <DetailRow title="الوظيفة" value={selectedInfo.action} source={contentSource} />
                  </dl>
                </> : <p className="anatomy-unavailable">لا يتوفر شرح عربي موثّق لهذا الجزء حالياً.</p>}
                {wikipedia && <ReferenceLink href={wikipedia}>المزيد في ويكيبيديا</ReferenceLink>}
              </div> : <div className="anatomy-empty-detail"><span className="anatomy-empty-icon"><MousePointer2 size={22} aria-hidden="true" /></span><h3>اختر جزءاً لتبدأ</h3><p>اضغط على النموذج أو اختر جزءاً من القائمة لتظهر معلوماته هنا.</p></div>}
            </div>
          </section>

          <section className="anatomy-parts" aria-labelledby="anatomy-parts-title">
            <div className="anatomy-panel-heading"><div><span className="anatomy-section-kicker">استكشف بالاسم</span><h2 id="anatomy-parts-title">دليل الأجزاء</h2></div><span className="anatomy-parts-count">{ready ? `${parts.length} جزء` : '—'}</span></div>
            <label className="anatomy-search"><Search size={18} aria-hidden="true" /><span className="anatomy-sr-only">ابحث عن جزء تشريحي</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالعربية أو الإنجليزية" /></label>
            <p className="anatomy-list-hint" aria-live="polite">{!modelUrl ? 'أضف رابط الخدمة لتظهر أجزاء النموذج.' : !ready ? 'ستظهر الأجزاء بعد تحميل النموذج.' : matches.length > MAX_RESULTS ? `تظهر أول ${MAX_RESULTS} من ${matches.length} نتيجة. ابحث لتضييق القائمة.` : `${matches.length} نتيجة`}</p>
            {ready && visibleParts.length > 0 && <ul className="anatomy-parts-list" aria-label="نتائج البحث في أجزاء النموذج">{visibleParts.map(({ part, info }) => {
              const active = selected?.id === part.id;
              const translatedName = safeWebUrl(info?.sourceUrl) && info?.ar;
              return <li key={part.id}><button type="button" className={`anatomy-part-button${active ? ' is-selected' : ''}`} aria-pressed={active} onClick={() => choosePart(part)}><span className="anatomy-part-copy"><strong dir="auto">{translatedName || part.name || 'اسم غير متاح'}</strong>{(translatedName || part.detail) && <small dir="auto">{[translatedName ? part.name : null, part.detail && part.detail !== part.name ? part.detail : null].filter(Boolean).join(' · ')}</small>}</span>{active ? <Check size={17} aria-hidden="true" /> : <span className="anatomy-part-arrow" aria-hidden="true">←</span>}</button></li>;
            })}</ul>}
            {ready && !visibleParts.length && <p className="anatomy-no-results">{query.trim() ? 'لا توجد أجزاء تطابق بحثك. جرّب اسماً آخر.' : 'لا توجد أجزاء متاحة في النموذج.'}</p>}
          </section>
        </aside>
      </div>

      <section className="anatomy-motion-entry" aria-label="مختبر حركة المرفق">
        <div><span className="anatomy-section-kicker">الحركة عن قرب</span><h2>مثال تفاعلي: ثني المرفق</h2><p>شاهد مسارات عضلية في نموذج هندسي مبسّط من OpenSim؛ منفصل عن أطلس الجسم الثابت.</p></div>
        <button type="button" className="anatomy-motion-toggle" aria-expanded={motionOpen} onClick={() => setMotionOpen((open) => !open)}>{motionOpen ? 'إغلاق مختبر الحركة' : 'افتح مختبر الحركة'}</button>
        {motionOpen && <ElbowMotion />}
      </section>

      <footer className="anatomy-sources" aria-label="مصادر النموذج والتراخيص">
        <div><span className="anatomy-section-kicker">بكل شفافية</span><h2>النموذج والمصادر</h2><p>المعلومات المترجمة انتقائية ويظهر مصدرها مع كل تفصيل متاح.</p></div>
        <div className="anatomy-source-links">
          <p>النموذج عبر <ReferenceLink href="https://github.com/hpfrei/body-anatomy-3d-viewer">body-anatomy-3d-viewer</ReferenceLink>؛ أُعيد تبسيط نموذج Z-Anatomy وضغطه في هذا المصدر.</p>
          <p>الأصل التشريحي: <ReferenceLink href="https://github.com/Z-Anatomy/Models-of-human-anatomy">Z-Anatomy</ReferenceLink>، بترخيص <ReferenceLink href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</ReferenceLink>.</p>
          <p>الأصل المنسوب أيضاً إلى <ReferenceLink href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/desc.html">BodyParts3D – DBCLS</ReferenceLink>، بترخيص <ReferenceLink href="https://creativecommons.org/licenses/by-sa/2.1/jp/">CC BY-SA 2.1 Japan</ReferenceLink>.</p>
          <p>نصوص منتقاة مقتبسة ومترجمة بتصرف من <ReferenceLink href="https://med.libretexts.org/Bookshelves/Anatomy_and_Physiology/Human_Anatomy_(OERI)">Human Anatomy (OERI) عبر LibreTexts</ReferenceLink>، إعداد Whitney Menefee وJulie Jenks وChiara Mazzasette وKim-Leiloni Nguyen، بترخيص <ReferenceLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</ReferenceLink>.</p>
          <p>قد تتضمن بيانات النموذج نصوصاً من ويكيبيديا بترخيص <ReferenceLink href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</ReferenceLink>، وتظهر روابطها مع الأجزاء حيث تتوفر.</p>
          <p>يُقدَّم النموذج (نحو 8 ميغابايت) من ملفات التطبيق نفسه عند فتح هذه الصفحة، ولا تُرسل أي بيانات من استخدامك إلى جهة خارجية.</p>
        </div>
      </footer>
    </main>
  );
}

export default function AnatomyView({ modelUrl, go }) {
  return <AnatomyWorkspace key={modelUrl || 'no-model'} modelUrl={modelUrl} go={go} />;
}
