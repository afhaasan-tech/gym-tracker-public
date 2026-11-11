import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, getLang } from '../i18n';
import {
  Apple,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Flame,
  Plus,
  Search,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { FOODS } from './data.js';
import './food.css';

const PAGE_SIZE = 40;
const localDate = () => {
  const now = new Date();
  const twoDigits = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;
};
const formatDate = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day));
};
const safeNumber = (value) => Math.max(0, Number(value) || 0);
const formatNumber = (value) => new Intl.NumberFormat(getLang() === 'ar' ? 'ar' : 'en-GB', { maximumFractionDigits: 1 }).format(value);
const emptyForm = { name: '', serving: '', calories: '', protein: '', carbs: '', fat: '' };

function FoodView({
  foods = FOODS,
  meals = [],
  onAddMeal,
  onDeleteMeal,
  customFoods = [],
  onAddCustomFood,
  calorieGoal = 2000,
}) {
  const [currentDate, setCurrentDate] = useState(localDate);
  // null means "today", so it follows the local day rather than freezing at mount time.
  const [selectedDate, setSelectedDate] = useState(null);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('library');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [extraFoods, setExtraFoods] = useState([]);
  const [extraStatus, setExtraStatus] = useState('loading');
  const [customOpen, setCustomOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [customForm, setCustomForm] = useState(emptyForm);
  const noticeTimer = useRef(null);
  // Retain an already-saved custom food if adding its meal fails, to avoid duplicating it on retry.
  const savedCustomFood = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}foods-extra.json`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Food data unavailable');
        return response.json();
      })
      .then((data) => {
        if (!Array.isArray(data)) throw new Error('Invalid food data');
        setExtraFoods(getLang() === 'en' ? data.map((f) => ({ ...f, serving: String(f.serving ?? '').replace(/\s*غ(?![\u0600-\u06FF])/, ' g') })) : data);
        setExtraStatus('ready');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setExtraStatus('error');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let timer;
    const refreshDay = () => {
      setCurrentDate(localDate());
      window.clearTimeout(timer);
      const nextMidnight = new Date();
      nextMidnight.setHours(24, 0, 0, 50);
      timer = window.setTimeout(refreshDay, Math.max(50, nextMidnight.getTime() - Date.now()));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshDay();
    };
    refreshDay();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', refreshDay);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', refreshDay);
    };
  }, []);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const logDate = selectedDate || currentDate;
  const selectedMeals = useMemo(
    () => meals.filter((meal) => meal.date === logDate),
    [meals, logDate],
  );
  const totals = useMemo(() => selectedMeals.reduce((sum, meal) => ({
    calories: sum.calories + safeNumber(meal.calories),
    protein: sum.protein + safeNumber(meal.protein),
    carbs: sum.carbs + safeNumber(meal.carbs),
    fat: sum.fat + safeNumber(meal.fat),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [selectedMeals]);

  const allFoods = useMemo(() => [
    ...foods.map((food) => ({ food, source: 'original' })),
    ...extraFoods.map((food) => ({ food, source: 'usda' })),
    ...customFoods.map((food) => ({ food, source: 'custom' })),
  ], [foods, extraFoods, customFoods]);
  const filteredFoods = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return allFoods.filter(({ food, source }) => (
      (activeTab === 'library' || source === 'custom')
      && (!normalized || `${food.name} ${food.serving}`.toLocaleLowerCase().includes(normalized))
    ));
  }, [allFoods, query, activeTab]);

  const remaining = Math.max(0, safeNumber(calorieGoal) - totals.calories);
  const progress = safeNumber(calorieGoal) ? Math.min(100, (totals.calories / safeNumber(calorieGoal)) * 100) : 0;

  const clearNotice = () => {
    window.clearTimeout(noticeTimer.current);
    setNotice('');
  };
  const addFood = (food) => {
    if (!onAddMeal) return true;
    const freshToday = localDate();
    const targetDate = selectedDate || freshToday;
    setCurrentDate(freshToday);
    if (onAddMeal({ ...food, id: crypto.randomUUID(), date: targetDate }) === false) {
      clearNotice();
      return false;
    }
    clearNotice();
    setNotice(t("تمت إضافة {0} إلى سجل {1}", [food.name, targetDate]));
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2800);
    return true;
  };

  const updateForm = (field, value) => {
    savedCustomFood.current = null;
    setCustomForm((current) => ({ ...current, [field]: value }));
  };
  const submitCustomFood = (event) => {
    event.preventDefault();
    if (!customForm.name.trim() || !customForm.serving.trim()) return;
    let food = savedCustomFood.current;
    if (!food) {
      food = {
        id: crypto.randomUUID(),
        name: customForm.name.trim(),
        serving: customForm.serving.trim(),
        calories: safeNumber(customForm.calories),
        protein: safeNumber(customForm.protein),
        carbs: safeNumber(customForm.carbs),
        fat: safeNumber(customForm.fat),
      };
      if (onAddCustomFood?.(food) === false) {
        clearNotice();
        return;
      }
      savedCustomFood.current = food;
    }
    if (!addFood(food)) return;
    savedCustomFood.current = null;
    setCustomForm(emptyForm);
    setCustomOpen(false);
  };

  const changeQuery = (value) => {
    setQuery(value);
    setVisibleCount(PAGE_SIZE);
  };
  const changeTab = (tab) => {
    setActiveTab(tab);
    setVisibleCount(PAGE_SIZE);
  };
  const changeDate = (value) => {
    const freshToday = localDate();
    setCurrentDate(freshToday);
    setSelectedDate(!value || value === freshToday ? null : value);
  };

  return (
    <main className="food-view" dir={getLang() === 'ar' ? 'rtl' : 'ltr'}>
      <div className="food-shell">
        <header className="food-header">
          <div>
            <div className="food-eyebrow"><Apple size={16} /> {t("تغذية ڤورا")}</div>
            <h1>{t("وقود يومك،")} <span>{t("بهدوء.")}</span></h1>
            <p>{t("سجّل وجباتك وتابع السعرات دون تعقيد أو أرقام مبالغ فيها.")}</p>
          </div>
          <div className="food-date"><CalendarDays size={16} /><span>{selectedDate ? t("التاريخ المختار") : t("اليوم")}</span><strong>{formatDate(logDate)}</strong></div>
        </header>

        <section className="food-summary" aria-label={t("ملخص السعرات للتاريخ المختار")}>
          <div className="food-ring-wrap">
            <div className="food-ring" style={{ '--food-progress': `${progress}%` }}>
              <div className="food-ring-inner"><Flame size={18} /><strong>{formatNumber(totals.calories)}</strong><span>{t("كيلو سعرة")}</span></div>
            </div>
            <span className="food-ring-label">{t("من هدف")} {formatNumber(calorieGoal)}</span>
          </div>
          <div className="food-summary-copy"><span className="food-kicker">{t("تتبّع السعرات للتاريخ المختار")}</span><h2>{remaining > 0 ? t("متبقي {0}", [formatNumber(remaining)]) : t("وصلت إلى هدفك")}</h2><p>{selectedMeals.length ? t("سجّلت {0} {1} في هذا التاريخ", [formatNumber(selectedMeals.length), selectedMeals.length === 1 ? 'عنصر' : 'عناصر']) : t("ابدأ بإضافة أول طعام ليظهر تقدّمك هنا.")}</p></div>
          <div className="food-mini-stats"><div><span>{t("بروتين")}</span><strong>{formatNumber(totals.protein)}<small>{t("غ")}</small></strong></div><div><span>{t("كربوهيدرات")}</span><strong>{formatNumber(totals.carbs)}<small>{t("غ")}</small></strong></div><div><span>{t("دهون")}</span><strong>{formatNumber(totals.fat)}<small>{t("غ")}</small></strong></div></div>
        </section>

        {notice && <div className="food-toast" role="status"><Check size={17} />{notice}</div>}

        <div className="food-layout">
          <section className="food-panel food-picker">
            <div className="food-panel-heading"><div><span className="food-kicker">{t("أضف إلى السجل المختار")}</span><h2>{t("اختَر طعاماً")}</h2></div><button className="food-secondary-button" type="button" onClick={() => setCustomOpen((open) => !open)}>{customOpen ? <X size={17} /> : <Plus size={17} />} {t("طعام مخصص")}</button></div>
            <p className="food-target-note">{t("تُضاف الأطعمة إلى التاريخ المختار في سجل الوجبات. عند اختيار اليوم، ينتقل السجل تلقائياً إلى اليوم المحلي الجديد.")}</p>
            <div className="food-tabs" aria-label={t("تصفية الأغذية")}><button className={activeTab === 'library' ? 'food-tab food-tab-active' : 'food-tab'} onClick={() => changeTab('library')} aria-pressed={activeTab === 'library'} type="button">{t("جميع الأغذية")} <span>{formatNumber(allFoods.length)}</span></button><button className={activeTab === 'custom' ? 'food-tab food-tab-active' : 'food-tab'} onClick={() => changeTab('custom')} aria-pressed={activeTab === 'custom'} type="button">{t("أطعمتي المخصصة")} <span>{formatNumber(customFoods.length)}</span></button></div>
            <div className="food-source-note" role="status">
              {extraStatus === 'loading' && <span>{t("جارٍ تحميل أغذية USDA الإضافية…")}</span>}
              {extraStatus === 'error' && <span>{t("تعذّر تحميل أغذية USDA الإضافية؛ لا تزال المكتبة الأصلية والأطعمة المخصصة متاحة.")}</span>}
              {extraStatus === 'ready' && <span>{t("تضم المكتبة")} {formatNumber(extraFoods.length)} {t("صنفاً إضافياً من")} <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noreferrer">USDA FoodData Central</a> {t("(FNDDS 2021–2023). أسماؤها بالإنجليزية وقيمها تقديرية لكل 100 غ.")}</span>}
            </div>
            {customOpen && <form className="food-custom-form" onSubmit={submitCustomFood}><div className="food-form-title"><Utensils size={17} /><strong>{t("أنشئ طعاماً مخصصاً")}</strong><span>{t("القيم غير السالبة فقط")}</span></div><div className="food-form-grid"><label>{t("الاسم")}<input value={customForm.name} onChange={(e) => updateForm('name', e.target.value)} placeholder={t("مثال: وجبة منزلية")} required /></label><label>{t("الحصة")}<input value={customForm.serving} onChange={(e) => updateForm('serving', e.target.value)} placeholder={t("مثال: طبق واحد")} required /></label><label>{t("السعرات")}<input type="number" min="0" step="any" value={customForm.calories} onChange={(e) => updateForm('calories', e.target.value)} placeholder="0" /></label><label>{t("بروتين (غ)")}<input type="number" min="0" step="any" value={customForm.protein} onChange={(e) => updateForm('protein', e.target.value)} placeholder="0" /></label><label>{t("كربوهيدرات (غ)")}<input type="number" min="0" step="any" value={customForm.carbs} onChange={(e) => updateForm('carbs', e.target.value)} placeholder="0" /></label><label>{t("دهون (غ)")}<input type="number" min="0" step="any" value={customForm.fat} onChange={(e) => updateForm('fat', e.target.value)} placeholder="0" /></label></div><button className="food-primary-button" type="submit"><Check size={17} /> {t("حفظ وإضافة للتاريخ المختار")}</button></form>}
            <label className="food-search"><Search size={18} /><input value={query} onChange={(e) => changeQuery(e.target.value)} placeholder={t("ابحث بالعربية أو الإنجليزية عن طعام أو حصة...")} aria-label={t("ابحث عن طعام أو حصة")} />{query && <button type="button" onClick={() => changeQuery('')} aria-label={t("مسح البحث")}><X size={16} /></button>}</label>
            {filteredFoods.length > 0 && <p className="food-results-count">{t("عرض")} {formatNumber(Math.min(visibleCount, filteredFoods.length))} {t("من")} {formatNumber(filteredFoods.length)} {t("نتيجة")}</p>}
            <div className="food-list">{filteredFoods.slice(0, visibleCount).map(({ food, source }) => <article className="food-item" key={`${source}-${food.id}`}><div className="food-item-icon"><Utensils size={18} /></div><div className="food-item-info"><strong dir="auto" lang={source === 'usda' ? 'en' : undefined}>{food.name}</strong><span>{food.serving} · {formatNumber(food.calories)} {t("سعرة")}{source === 'usda' && <> · <bdi>USDA</bdi></>}</span></div><button className="food-add-button" onClick={() => addFood(food)} type="button" aria-label={t("إضافة {0} إلى التاريخ المختار", [food.name])}><Plus size={18} /></button></article>)}</div>
            {visibleCount < filteredFoods.length && <button className="food-more-button" type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>{t("عرض المزيد (")}{formatNumber(Math.min(PAGE_SIZE, filteredFoods.length - visibleCount))})</button>}
            {filteredFoods.length === 0 && <div className="food-empty food-empty-small"><Search size={25} /><strong>{t("لا توجد نتائج")}</strong><span>{t("جرّب كلمة بحث مختلفة أو أضف طعاماً مخصصاً.")}</span></div>}
          </section>

          <section className="food-panel food-log">
            <div className="food-panel-heading"><div><span className="food-kicker">{t("سجل الوجبات")}</span><h2>{selectedDate ? t("وجبات التاريخ المختار") : t("ما تناولته اليوم")}</h2></div><span className="food-count">{formatNumber(selectedMeals.length)} {t("عناصر")}</span></div>
            <div className="food-date-controls"><label>{t("تاريخ السجل")}<input type="date" value={logDate} max={currentDate} onChange={(event) => changeDate(event.target.value)} dir="ltr" /></label><button className="food-secondary-button" type="button" onClick={() => changeDate('')}>{t("العودة إلى اليوم")}</button></div>
            <div className="food-meal-list">{selectedMeals.map((meal) => <article className="food-meal-row" key={meal.id}><div className="food-meal-mark"><Check size={15} /></div><div className="food-meal-info"><strong dir="auto">{meal.name}</strong><span>{meal.serving}</span></div><strong className="food-meal-calories">{formatNumber(meal.calories)} <small>{t("سعرة")}</small></strong><button className="food-delete-button" type="button" onClick={() => onDeleteMeal?.(meal.id)} aria-label={t("حذف {0} من التاريخ المختار", [meal.name])}><Trash2 size={17} /></button></article>)}</div>
            {selectedMeals.length === 0 && <div className="food-empty"><div className="food-empty-icon"><Utensils size={25} /></div><strong>{t("لا توجد وجبات في هذا التاريخ")}</strong><span>{t("يمكنك إضافة طعام من المكتبة إلى التاريخ المختار.")}</span></div>}
            <div className="food-disclaimer"><CircleAlert size={16} /><span>{t("القيم الغذائية تقديرية؛ قد تختلف حسب الوصفة والحصة. تُقرّب الأرقام للعرض.")}</span></div>
          </section>
        </div>
        <footer className="food-footer"><span><ChevronDown size={15} /> {t("التحليل بالصور غير متاح حالياً")}</span><span>{t("لا يتم رفع الصور إلى تخزين دائم.")}</span></footer>
      </div>
    </main>
  );
}

export default FoodView;
