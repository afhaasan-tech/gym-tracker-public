import React, { useMemo, useState } from 'react';
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
  const [equipment, setEquipment] = useState('الكل');
  const [level, setLevel] = useState('الكل');
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [form, setForm] = useState(() => ({ ...INITIAL_FORM, exerciseId: exercises[0]?.id ?? '' }));
  const [savedMessage, setSavedMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const equipmentOptions = useMemo(
    () => ['الكل', ...new Set(exercises.map((exercise) => exercise.equipment).filter(Boolean))],
    [exercises],
  );
  const levelOptions = useMemo(
    () => ['الكل', ...new Set(exercises.map((exercise) => exercise.level).filter(Boolean))],
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
      setFormError('اختر تمريناً قبل حفظ التسجيل.');
      return;
    }
    if (typeof onSaveLog !== 'function') {
      setFormError('تعذر حفظ التسجيل حالياً.');
      return;
    }

    const sets = clampNumber(form.sets, 100);
    const reps = clampNumber(form.reps, 1000);
    const duration = clampNumber(form.duration, 1440);
    if (!((sets > 0 && reps > 0) || duration > 0)) {
      setFormError('أدخل عدداً موجباً للجولات والتكرارات معاً، أو أدخل مدة موجبة بالدقائق.');
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
    setSavedMessage('تم حفظ تسجيل التمرين.');
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
          <span className="eyebrow"><Sparkles size={15} aria-hidden="true" /> Gym-Tracker KW / الحركة بوعي</span>
          <h1>مكتبة التمارين</h1>
          <p>اختر تمرينك، تعرّف على طريقته، وسجّل تقدمك في جلسة واحدة.</p>
        </div>
        <div className="hero-mark" aria-hidden="true"><Dumbbell size={38} strokeWidth={1.7} /></div>
      </header>

      <section className="exercise-controls" aria-label="البحث والتصفية">
        <label className="search-field">
          <Search size={19} aria-hidden="true" />
          <span className="sr-only">ابحث عن تمرين</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم التمرين أو العضلة" />
        </label>
        <label className="select-field">
          <Filter size={17} aria-hidden="true" />
          <span className="sr-only">فلترة المعدات</span>
          <select value={equipment} onChange={(event) => setEquipment(event.target.value)}>{equipmentOptions.map((item) => <option key={item} value={item}>{item === 'الكل' ? 'كل المعدات' : item}</option>)}</select>
        </label>
        <label className="select-field">
          <span className="sr-only">فلترة المستوى</span>
          <select value={level} onChange={(event) => setLevel(event.target.value)}>{levelOptions.map((item) => <option key={item} value={item}>{item === 'الكل' ? 'كل المستويات' : item}</option>)}</select>
        </label>
      </section>

      <div className="section-heading"><div><span className="section-kicker">اختيارك اليوم</span><h2>تمارين مناسبة لك</h2></div><span className="result-count">{filteredExercises.length} تمرين</span></div>
      {filteredExercises.length ? (
        <section className="exercise-grid" aria-label="قائمة التمارين">
          {filteredExercises.map((exercise) => (
            <article className="exercise-card" key={exercise.id}>
              <div className="card-topline"><span className="level-pill">{exercise.level}</span><span className="card-icon"><Dumbbell size={18} aria-hidden="true" /></span></div>
              <button className="exercise-card-button" type="button" onClick={() => setSelectedExercise(exercise)}>
                <h3>{exercise.name}</h3><p>{exercise.description}</p>
                <div className="card-meta"><span>{exercise.muscle}</span><span><Clock3 size={15} aria-hidden="true" /> {exercise.duration}</span></div>
                <span className="details-link">عرض التفاصيل <ChevronLeft size={16} aria-hidden="true" /></span>
              </button>
            </article>
          ))}
        </section>
      ) : <div className="empty-state">لا توجد تمارين تطابق بحثك. جرّب تغيير الفلاتر.</div>}

      <section className="logging-section">
        <div className="section-heading"><div><span className="section-kicker">تتبع التقدم</span><h2>سجّل تمريناً</h2></div><span className="section-note">الجولات والتكرارات معاً، أو المدة</span></div>
        <form className="log-form" onSubmit={handleSaveLog}>
          <label>التمرين<select required value={form.exerciseId} onChange={(event) => handleExerciseChange(event.target.value)}>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select></label>
          <label>الجولات<input type="number" min="0" max="100" step="1" value={form.sets} onChange={(event) => updateForm('sets', event.target.value)} /></label>
          <label>التكرارات<input type="number" min="0" max="1000" step="1" value={form.reps} placeholder="أدخل تكراراتك" onChange={(event) => updateForm('reps', event.target.value)} /></label>
          <label>الوزن (كغ)<input type="number" min="0" max="1000" step="0.5" value={form.weight} onChange={(event) => updateForm('weight', event.target.value)} /></label>
          <label>المدة (دقيقة)<input type="number" min="0" max="1440" step="1" value={form.duration} onChange={(event) => updateForm('duration', event.target.value)} /></label>
          <button className="primary-button" type="submit" disabled={saving}><CalendarDays size={18} aria-hidden="true" /> {saving ? 'يحفظ…' : 'حفظ التسجيل'}</button>
          {formError && <p className="save-message" role="alert">{formError}</p>}
          {savedMessage && <p className="save-message" role="status">{savedMessage}</p>}
        </form>
      </section>

      <section className="recent-logs"><div className="section-heading"><div><span className="section-kicker">ذاكرتك التدريبية</span><h2>آخر السجلات</h2></div></div>
        {recentLogs.length ? <div className="logs-list">{recentLogs.map((log) => <div className="log-row" key={log.id}><div><strong>{log.name}</strong><span>{log.date}{(Number(log.sets) > 0 || Number(log.reps) > 0) && ` · ${log.sets} جولات × ${log.reps} تكرارات`}{Number(log.duration) > 0 && ` · ${log.duration} دقيقة`}</span></div><span className="log-value">{log.weight ? `${log.weight} كغ` : 'وزن الجسم'}</span></div>)}</div> : <div className="empty-state compact">لم تسجّل أي تمرين بعد. ابدأ من النموذج أعلاه.</div>}
      </section>

      {selectedExercise && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedExercise(null)}>
        <section className="exercise-modal" role="dialog" aria-modal="true" aria-labelledby="exercise-modal-title">
          <button className="modal-close" type="button" aria-label="إغلاق التفاصيل" onClick={() => setSelectedExercise(null)}><X size={20} /></button>
          <span className="level-pill">{selectedExercise.level}</span><h2 id="exercise-modal-title">{selectedExercise.name}</h2><p className="modal-description">{selectedExercise.description}</p>
          <div className="modal-stats"><span><strong>{selectedExercise.muscle}</strong><small>العضلات المستهدفة</small></span><span><strong>{selectedExercise.sets} × {selectedExercise.reps}</strong><small>اقتراح البداية</small></span><span><strong>{selectedExercise.duration}</strong><small>المدة التقريبية</small></span></div>
          <h3>خطوات الأداء</h3><ol className="instructions-list">{selectedExercise.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>
          <a className="youtube-link" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${selectedExercise.name} تمرين`)}`} target="_blank" rel="noreferrer"><PlayCircle size={19} aria-hidden="true" /> بحث خارجي عن فيديو في YouTube <ExternalLink size={15} aria-hidden="true" /></a>
          <small className="external-note">يفتح هذا الرابط نتائج بحث خارجية في نافذة جديدة.</small>
        </section>
      </div>}
    </main>
  );
}
