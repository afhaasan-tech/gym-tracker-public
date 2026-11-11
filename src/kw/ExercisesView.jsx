import React, { useMemo, useState } from 'react';
import { t } from '../i18n';
import {
  CalendarDays,
  ChevronLeft,
  Clock3,
  Dumbbell,
  ExternalLink,
  Filter,
  PlayCircle,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { EXERCISES } from './data.js';
import './exercises.css';

const INITIAL_FORM = {
  sets: '',
  reps: '',
  weight: 0,
  duration: '',
};

const clampNumber = (value, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(Math.max(number, 0), max);
};

const today = () => {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};

export default function ExercisesView({ exercises = EXERCISES, logs = [], onSaveLog }) {
  const [query, setQuery] = useState('');
  const [equipment, setEquipment] = useState(t("الكل"));
  const [level, setLevel] = useState(t("الكل"));
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [form, setForm] = useState(() => ({ ...INITIAL_FORM, exerciseId: exercises[0]?.id ?? '' }));
  const [savedMessage, setSavedMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const equipmentOptions = useMemo(
    () => [t("الكل"), ...new Set(exercises.map((exercise) => exercise.equipment).filter(Boolean))],
    [exercises],
  );
  const levelOptions = useMemo(
    () => [t("الكل"), ...new Set(exercises.map((exercise) => exercise.level).filter(Boolean))],
    [exercises],
  );

  const filteredExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ar');
    return exercises.filter((exercise) => {
      const matchesQuery = !normalizedQuery || [exercise.name, exercise.muscle, exercise.description]
        .join(' ')
        .toLocaleLowerCase('ar')
        .includes(normalizedQuery);
      const matchesEquipment = equipment === 'الكل' || exercise.equipment === equipment;
      const matchesLevel = level === 'الكل' || exercise.level === level;
      return matchesQuery && matchesEquipment && matchesLevel;
    });
  }, [equipment, exercises, level, query]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError('');
    setSavedMessage('');
  };

  const handleExerciseChange = (exerciseId) => {
    setForm({ ...INITIAL_FORM, exerciseId });
    setFormError('');
    setSavedMessage('');
  };

  const handleSaveLog = async (event) => {
    event.preventDefault();
    const exercise = exercises.find((item) => item.id === form.exerciseId);
    setSavedMessage('');
    if (!exercise) {
      setFormError(t("اختر تمريناً قبل حفظ التسجيل."));
      return;
    }
    if (typeof onSaveLog !== 'function') {
      setFormError(t("تعذر حفظ التسجيل حالياً."));
      return;
    }

    const sets = clampNumber(form.sets, 100);
    const reps = clampNumber(form.reps, 1000);
    const duration = clampNumber(form.duration, 1440);
    if (!((sets > 0 && reps > 0) || duration > 0)) {
      setFormError(t("أدخل عدداً موجباً للجولات والتكرارات معاً، أو أدخل مدة موجبة بالدقائق."));
      return;
    }
    setFormError('');

    setSaving(true);
    const saved = await onSaveLog({
      id: crypto.randomUUID(),
      date: today(),
      exerciseId: exercise.id,
      name: exercise.name,
      sets,
      reps,
      weight: clampNumber(form.weight, 1000),
      duration,
    });
    setSaving(false);
    if (saved === false) return;
    if (saved && typeof saved === 'object' && saved.error) { setFormError(saved.error); return; }
    setSavedMessage(t("تم حفظ تسجيل التمرين."));
    window.setTimeout(() => setSavedMessage(''), 2800);
  };

  const recentLogs = [...logs]
    .reverse()
    .filter(Boolean)
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')))
    .slice(0, 6);

  return (
    <main className="exercises-view" dir="rtl">
      <header className="exercises-hero">
        <div>
          <span className="eyebrow"><Sparkles size={15} aria-hidden="true" /> {t("ڤورا / الحركة بوعي")}</span>
          <h1>{t("مكتبة التمارين")}</h1>
          <p>{t("اختر تمرينك، تعرّف على طريقته، وسجّل تقدمك في جلسة واحدة.")}</p>
        </div>
        <div className="hero-mark" aria-hidden="true"><Dumbbell size={38} strokeWidth={1.7} /></div>
      </header>

      <section className="exercise-controls" aria-label={t("البحث والتصفية")}>
        <label className="search-field">
          <Search size={19} aria-hidden="true" />
          <span className="sr-only">{t("ابحث عن تمرين")}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("ابحث باسم التمرين أو العضلة")} />
        </label>
        <label className="select-field">
          <Filter size={17} aria-hidden="true" />
          <span className="sr-only">{t("فلترة المعدات")}</span>
          <select value={equipment} onChange={(event) => setEquipment(event.target.value)}>{equipmentOptions.map((item) => <option key={item} value={item}>{item === 'الكل' ? t("كل المعدات") : item}</option>)}</select>
        </label>
        <label className="select-field">
          <span className="sr-only">{t("فلترة المستوى")}</span>
          <select value={level} onChange={(event) => setLevel(event.target.value)}>{levelOptions.map((item) => <option key={item} value={item}>{item === 'الكل' ? t("كل المستويات") : item}</option>)}</select>
        </label>
      </section>

      <div className="section-heading"><div><span className="section-kicker">{t("اختيارك اليوم")}</span><h2>{t("تمارين مناسبة لك")}</h2></div><span className="result-count">{filteredExercises.length} {t("تمرين")}</span></div>
      {filteredExercises.length ? (
        <section className="exercise-grid" aria-label={t("قائمة التمارين")}>
          {filteredExercises.map((exercise) => (
            <article className="exercise-card" key={exercise.id}>
              <div className="card-topline"><span className="level-pill">{exercise.level}</span><span className="card-icon"><Dumbbell size={18} aria-hidden="true" /></span></div>
              <button className="exercise-card-button" type="button" onClick={() => setSelectedExercise(exercise)}>
                <h3>{exercise.name}</h3><p>{exercise.description}</p>
                <div className="card-meta"><span>{exercise.muscle}</span><span><Clock3 size={15} aria-hidden="true" /> {exercise.duration}</span></div>
                <span className="details-link">{t("عرض التفاصيل")} <ChevronLeft size={16} aria-hidden="true" /></span>
              </button>
            </article>
          ))}
        </section>
      ) : <div className="empty-state">{t("لا توجد تمارين تطابق بحثك. جرّب تغيير الفلاتر.")}</div>}

      <section className="logging-section">
        <div className="section-heading"><div><span className="section-kicker">{t("تتبع التقدم")}</span><h2>{t("سجّل تمريناً")}</h2></div><span className="section-note">{t("الجولات والتكرارات معاً، أو المدة")}</span></div>
        <form className="log-form" onSubmit={handleSaveLog}>
          <label>{t("التمرين")}<select required value={form.exerciseId} onChange={(event) => handleExerciseChange(event.target.value)}>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select></label>
          <label>{t("الجولات")}<input type="number" min="0" max="100" step="1" value={form.sets} onChange={(event) => updateForm('sets', event.target.value)} /></label>
          <label>{t("التكرارات")}<input type="number" min="0" max="1000" step="1" value={form.reps} placeholder={t("أدخل تكراراتك")} onChange={(event) => updateForm('reps', event.target.value)} /></label>
          <label>{t("الوزن (كغ)")}<input type="number" min="0" max="1000" step="0.5" value={form.weight} onChange={(event) => updateForm('weight', event.target.value)} /></label>
          <label>{t("المدة (دقيقة)")}<input type="number" min="0" max="1440" step="1" value={form.duration} onChange={(event) => updateForm('duration', event.target.value)} /></label>
          <button className="primary-button" type="submit" disabled={saving}><CalendarDays size={18} aria-hidden="true" /> {saving ? t("يحفظ…") : t("حفظ التسجيل")}</button>
          {formError && <p className="save-message" role="alert">{formError}</p>}
          {savedMessage && <p className="save-message" role="status">{savedMessage}</p>}
        </form>
      </section>

      <section className="recent-logs"><div className="section-heading"><div><span className="section-kicker">{t("ذاكرتك التدريبية")}</span><h2>{t("آخر السجلات")}</h2></div></div>
        {recentLogs.length ? <div className="logs-list">{recentLogs.map((log) => <div className="log-row" key={log.id}><div><strong>{log.name}</strong><span>{log.date}{(Number(log.sets) > 0 || Number(log.reps) > 0) && t(" · {0} جولات × {1} تكرارات", [log.sets, log.reps])}{Number(log.duration) > 0 && t(" · {0} دقيقة", [log.duration])}</span></div><span className="log-value">{log.weight ? t("{0} كغ", [log.weight]) : t("وزن الجسم")}</span></div>)}</div> : <div className="empty-state compact">{t("لم تسجّل أي تمرين بعد. ابدأ من النموذج أعلاه.")}</div>}
      </section>

      {selectedExercise && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedExercise(null)}>
        <section className="exercise-modal" role="dialog" aria-modal="true" aria-labelledby="exercise-modal-title">
          <button className="modal-close" type="button" aria-label={t("إغلاق التفاصيل")} onClick={() => setSelectedExercise(null)}><X size={20} /></button>
          <span className="level-pill">{selectedExercise.level}</span><h2 id="exercise-modal-title">{selectedExercise.name}</h2><p className="modal-description">{selectedExercise.description}</p>
          <div className="modal-stats"><span><strong>{selectedExercise.muscle}</strong><small>{t("العضلات المستهدفة")}</small></span><span><strong>{selectedExercise.sets} × {selectedExercise.reps}</strong><small>{t("اقتراح البداية")}</small></span><span><strong>{selectedExercise.duration}</strong><small>{t("المدة التقريبية")}</small></span></div>
          <h3>{t("خطوات الأداء")}</h3><ol className="instructions-list">{selectedExercise.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>
          <a className="youtube-link" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(t("{0} تمرين", [selectedExercise.name]))}`} target="_blank" rel="noreferrer"><PlayCircle size={19} aria-hidden="true" /> {t("بحث خارجي عن فيديو في YouTube")} <ExternalLink size={15} aria-hidden="true" /></a>
          <small className="external-note">{t("يفتح هذا الرابط نتائج بحث خارجية في نافذة جديدة.")}</small>
        </section>
      </div>}
    </main>
  );
}
