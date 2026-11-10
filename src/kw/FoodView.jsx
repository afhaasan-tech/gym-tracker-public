import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day));
};
const safeNumber = (value) => Math.max(0, Number(value) || 0);
const numberFormatter = new Intl.NumberFormat('ar', { maximumFractionDigits: 1 });
const formatNumber = (value) => numberFormatter.format(value);
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
        setExtraFoods(data);
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
    setNotice(`تمت إضافة ${food.name} إلى سجل ${targetDate}`);
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
    <main className="food-view" dir="rtl">
      <div className="food-shell">
        <header className="food-header">
          <div>
            <div className="food-eyebrow"><Apple size={16} /> تغذية Gym-Tracker KW</div>
            <h1>وقود يومك، <span>بهدوء.</span></h1>
            <p>سجّل وجباتك وتابع السعرات دون تعقيد أو أرقام مبالغ فيها.</p>
          </div>
          <div className="food-date"><CalendarDays size={16} /><span>{selectedDate ? 'التاريخ المختار' : 'اليوم'}</span><strong>{formatDate(logDate)}</strong></div>
        </header>

        <section className="food-summary" aria-label="ملخص السعرات للتاريخ المختار">
          <div className="food-ring-wrap">
            <div className="food-ring" style={{ '--food-progress': `${progress}%` }}>
              <div className="food-ring-inner"><Flame size={18} /><strong>{formatNumber(totals.calories)}</strong><span>كيلو سعرة</span></div>
            </div>
            <span className="food-ring-label">من هدف {formatNumber(calorieGoal)}</span>
          </div>
          <div className="food-summary-copy"><span className="food-kicker">تتبّع السعرات للتاريخ المختار</span><h2>{remaining > 0 ? `متبقي ${formatNumber(remaining)}` : 'وصلت إلى هدفك'}</h2><p>{selectedMeals.length ? `سجّلت ${formatNumber(selectedMeals.length)} ${selectedMeals.length === 1 ? 'عنصر' : 'عناصر'} في هذا التاريخ` : 'ابدأ بإضافة أول طعام ليظهر تقدّمك هنا.'}</p></div>
          <div className="food-mini-stats"><div><span>بروتين</span><strong>{formatNumber(totals.protein)}<small>غ</small></strong></div><div><span>كربوهيدرات</span><strong>{formatNumber(totals.carbs)}<small>غ</small></strong></div><div><span>دهون</span><strong>{formatNumber(totals.fat)}<small>غ</small></strong></div></div>
        </section>

        {notice && <div className="food-toast" role="status"><Check size={17} />{notice}</div>}

        <div className="food-layout">
          <section className="food-panel food-picker">
            <div className="food-panel-heading"><div><span className="food-kicker">أضف إلى السجل المختار</span><h2>اختَر طعاماً</h2></div><button className="food-secondary-button" type="button" onClick={() => setCustomOpen((open) => !open)}>{customOpen ? <X size={17} /> : <Plus size={17} />} طعام مخصص</button></div>
            <p className="food-target-note">تُضاف الأطعمة إلى التاريخ المختار في سجل الوجبات. عند اختيار اليوم، ينتقل السجل تلقائياً إلى اليوم المحلي الجديد.</p>
            <div className="food-tabs" aria-label="تصفية الأغذية"><button className={activeTab === 'library' ? 'food-tab food-tab-active' : 'food-tab'} onClick={() => changeTab('library')} aria-pressed={activeTab === 'library'} type="button">جميع الأغذية <span>{formatNumber(allFoods.length)}</span></button><button className={activeTab === 'custom' ? 'food-tab food-tab-active' : 'food-tab'} onClick={() => changeTab('custom')} aria-pressed={activeTab === 'custom'} type="button">أطعمتي المخصصة <span>{formatNumber(customFoods.length)}</span></button></div>
            <div className="food-source-note" role="status">
              {extraStatus === 'loading' && <span>جارٍ تحميل أغذية USDA الإضافية…</span>}
              {extraStatus === 'error' && <span>تعذّر تحميل أغذية USDA الإضافية؛ لا تزال المكتبة الأصلية والأطعمة المخصصة متاحة.</span>}
              {extraStatus === 'ready' && <span>تضم المكتبة {formatNumber(extraFoods.length)} صنفاً إضافياً من <a href="https://fdc.nal.usda.gov/" target="_blank" rel="noreferrer">USDA FoodData Central</a> (FNDDS 2021–2023). أسماؤها بالإنجليزية وقيمها تقديرية لكل 100 غ.</span>}
            </div>
            {customOpen && <form className="food-custom-form" onSubmit={submitCustomFood}><div className="food-form-title"><Utensils size={17} /><strong>أنشئ طعاماً مخصصاً</strong><span>القيم غير السالبة فقط</span></div><div className="food-form-grid"><label>الاسم<input value={customForm.name} onChange={(e) => updateForm('name', e.target.value)} placeholder="مثال: وجبة منزلية" required /></label><label>الحصة<input value={customForm.serving} onChange={(e) => updateForm('serving', e.target.value)} placeholder="مثال: طبق واحد" required /></label><label>السعرات<input type="number" min="0" step="any" value={customForm.calories} onChange={(e) => updateForm('calories', e.target.value)} placeholder="0" /></label><label>بروتين (غ)<input type="number" min="0" step="any" value={customForm.protein} onChange={(e) => updateForm('protein', e.target.value)} placeholder="0" /></label><label>كربوهيدرات (غ)<input type="number" min="0" step="any" value={customForm.carbs} onChange={(e) => updateForm('carbs', e.target.value)} placeholder="0" /></label><label>دهون (غ)<input type="number" min="0" step="any" value={customForm.fat} onChange={(e) => updateForm('fat', e.target.value)} placeholder="0" /></label></div><button className="food-primary-button" type="submit"><Check size={17} /> حفظ وإضافة للتاريخ المختار</button></form>}
            <label className="food-search"><Search size={18} /><input value={query} onChange={(e) => changeQuery(e.target.value)} placeholder="ابحث بالعربية أو الإنجليزية عن طعام أو حصة..." aria-label="ابحث عن طعام أو حصة" />{query && <button type="button" onClick={() => changeQuery('')} aria-label="مسح البحث"><X size={16} /></button>}</label>
            {filteredFoods.length > 0 && <p className="food-results-count">عرض {formatNumber(Math.min(visibleCount, filteredFoods.length))} من {formatNumber(filteredFoods.length)} نتيجة</p>}
            <div className="food-list">{filteredFoods.slice(0, visibleCount).map(({ food, source }) => <article className="food-item" key={`${source}-${food.id}`}><div className="food-item-icon"><Utensils size={18} /></div><div className="food-item-info"><strong dir="auto" lang={source === 'usda' ? 'en' : undefined}>{food.name}</strong><span>{food.serving} · {formatNumber(food.calories)} سعرة{source === 'usda' && <> · <bdi>USDA</bdi></>}</span></div><button className="food-add-button" onClick={() => addFood(food)} type="button" aria-label={`إضافة ${food.name} إلى التاريخ المختار`}><Plus size={18} /></button></article>)}</div>
            {visibleCount < filteredFoods.length && <button className="food-more-button" type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>عرض المزيد ({formatNumber(Math.min(PAGE_SIZE, filteredFoods.length - visibleCount))})</button>}
            {filteredFoods.length === 0 && <div className="food-empty food-empty-small"><Search size={25} /><strong>لا توجد نتائج</strong><span>جرّب كلمة بحث مختلفة أو أضف طعاماً مخصصاً.</span></div>}
          </section>

          <section className="food-panel food-log">
            <div className="food-panel-heading"><div><span className="food-kicker">سجل الوجبات</span><h2>{selectedDate ? 'وجبات التاريخ المختار' : 'ما تناولته اليوم'}</h2></div><span className="food-count">{formatNumber(selectedMeals.length)} عناصر</span></div>
            <div className="food-date-controls"><label>تاريخ السجل<input type="date" value={logDate} max={currentDate} onChange={(event) => changeDate(event.target.value)} dir="ltr" /></label><button className="food-secondary-button" type="button" onClick={() => changeDate('')}>العودة إلى اليوم</button></div>
            <div className="food-meal-list">{selectedMeals.map((meal) => <article className="food-meal-row" key={meal.id}><div className="food-meal-mark"><Check size={15} /></div><div className="food-meal-info"><strong dir="auto">{meal.name}</strong><span>{meal.serving}</span></div><strong className="food-meal-calories">{formatNumber(meal.calories)} <small>سعرة</small></strong><button className="food-delete-button" type="button" onClick={() => onDeleteMeal?.(meal.id)} aria-label={`حذف ${meal.name} من التاريخ المختار`}><Trash2 size={17} /></button></article>)}</div>
            {selectedMeals.length === 0 && <div className="food-empty"><div className="food-empty-icon"><Utensils size={25} /></div><strong>لا توجد وجبات في هذا التاريخ</strong><span>يمكنك إضافة طعام من المكتبة إلى التاريخ المختار.</span></div>}
            <div className="food-disclaimer"><CircleAlert size={16} /><span>القيم الغذائية تقديرية؛ قد تختلف حسب الوصفة والحصة. تُقرّب الأرقام للعرض.</span></div>
          </section>
        </div>
        <footer className="food-footer"><span><ChevronDown size={15} /> التحليل بالصور غير متاح حالياً</span><span>لا يتم رفع الصور إلى تخزين دائم.</span></footer>
      </div>
    </main>
  );
}

export default FoodView;
