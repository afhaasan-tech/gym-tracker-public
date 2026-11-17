// Existing VORA workout log (table `workouts`, RLS: own rows only) — same data the web app uses.
import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import { Button, Card, ErrorText, Field, Loading, T } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { fs } from '../lib/theme'

type Workout = { id: string; exercise: string; sets: number; reps: number; weight: number; created_at: string }

export function WorkoutLog() {
  const { L } = useI18n()
  const [rows, setRows] = useState<Workout[] | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const [exercise, setExercise] = useState(''), [sets, setSets] = useState(''), [reps, setReps] = useState(''), [weight, setWeight] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('workouts').select('id,exercise,sets,reps,weight,created_at').order('created_at', { ascending: false }).limit(100)
    if (error) setErr(L('تعذر تحميل التمارين.', 'Could not load workouts.')); else setRows(data as Workout[])
  }, [L])
  useEffect(() => { void load() }, [load])
  const nS = Number(sets), nR = Number(reps), nW = weight === '' ? 0 : Number(weight)
  const valid = exercise.trim().length > 0 && Number.isInteger(nS) && nS > 0 && Number.isInteger(nR) && nR > 0 && Number.isFinite(nW) && nW >= 0
  async function addWorkout() {
    setBusy(true); setErr('')
    const { error } = await supabase.from('workouts').insert({ exercise: exercise.trim().slice(0, 100), sets: nS, reps: nR, weight: nW })
    setBusy(false)
    if (error) { setErr(L('تعذر الحفظ.', 'Could not save.')); return }
    setExercise(''); setSets(''); setReps(''); setWeight(''); void load()
  }
  async function remove(id: string) {
    const { error } = await supabase.from('workouts').delete().eq('id', id)
    if (error) setErr(L('تعذر الحذف.', 'Could not delete.')); else void load()
  }
  return (
    <View style={{ gap: 12 }}>
      <Card>
        <Field testID="w-exercise" label={L('التمرين', 'Exercise')} value={exercise} onChangeText={setExercise} maxLength={100} placeholder={L('مثال: بنش برس', 'e.g. Bench press')} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Field testID="w-sets" label={L('مجموعات', 'Sets')} value={sets} onChangeText={(v) => setSets(v.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field testID="w-reps" label={L('تكرارات', 'Reps')} value={reps} onChangeText={(v) => setReps(v.replace(/\D/g, ''))} keyboardType="number-pad" /></View>
          <View style={{ flex: 1 }}><Field testID="w-weight" label={L('الوزن (كجم)', 'Weight (kg)')} value={weight} onChangeText={(v) => setWeight(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" /></View>
        </View>
        <Button testID="w-add" busy={busy} disabled={!valid} label={L('أضف للسجل', 'Add to log')} onPress={addWorkout} />
        {err ? <ErrorText>{err}</ErrorText> : null}
      </Card>
      {rows === null ? <Loading /> : rows.length === 0 ? <T muted>{L('ما سجلت تمارين للحين.', 'No workouts logged yet.')}</T> : rows.map((w) => (
        <Card key={w.id} testID="log-row" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T bold>{w.exercise}</T>
            <T muted size={fs.sm}>{w.sets} × {w.reps}{Number(w.weight) > 0 ? ` · ${Number(w.weight)} kg` : ''} · {new Date(w.created_at).toLocaleDateString('en-GB')}</T>
          </View>
          <Button variant="link" label={L('حذف', 'Delete')} onPress={() => remove(w.id)} />
        </Card>
      ))}
    </View>
  )
}
