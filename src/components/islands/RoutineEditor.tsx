import { useState } from 'react'
import { rpc } from '../../lib/api-client'

type Exercise = {
  id: string
  name: string
  targetSets: number | null
  targetReps: number | null
  targetWeight: number | null
  unit: 'kg' | 'lb'
  bench: string | null
  pulley: string | null
  notes: string | null
  position: number
}
type Day = { id: string; name: string; position: number; exercises: Exercise[] }

async function ok<T>(p: Promise<{ json: () => Promise<unknown> }>): Promise<T> {
  const res = await p
  const body = (await res.json()) as { success: boolean; data?: T; error?: { message: string } }
  if (!body.success) throw new Error(body.error?.message ?? 'Error')
  return body.data as T
}

const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v))

export default function RoutineEditor({ initialDays }: { initialDays: Day[] }) {
  const [days, setDays] = useState<Day[]>(initialDays)
  const [newDay, setNewDay] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function run(fn: () => Promise<void>) {
    setErr(null)
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const addDay = () =>
    run(async () => {
      if (!newDay.trim()) return
      const day = await ok<Day>(rpc.days.$post({ json: { name: newDay.trim() } }))
      setDays((d) => [...d, { ...day, exercises: [] }])
      setNewDay('')
    })

  const removeDay = (id: string) =>
    run(async () => {
      if (!confirm('¿Borrar este día y sus ejercicios? El historial se conserva.')) return
      await ok(rpc.days[':id'].$delete({ param: { id } }))
      setDays((d) => d.filter((x) => x.id !== id))
    })

  const renameDay = (id: string, name: string) =>
    run(async () => {
      await ok(rpc.days[':id'].$patch({ param: { id }, json: { name } }))
      setDays((d) => d.map((x) => (x.id === id ? { ...x, name } : x)))
    })

  const removeExercise = (dayId: string, exId: string) =>
    run(async () => {
      await ok(rpc.exercises[':id'].$delete({ param: { id: exId } }))
      setDays((d) => d.map((x) => (x.id === dayId ? { ...x, exercises: x.exercises.filter((e) => e.id !== exId) } : x)))
    })

  const addExercise = (dayId: string, ex: Omit<Exercise, 'id' | 'position'>) =>
    run(async () => {
      const created = await ok<Exercise>(
        rpc.days[':dayId'].exercises.$post({
          param: { dayId },
          json: {
            name: ex.name,
            targetSets: ex.targetSets,
            targetReps: ex.targetReps,
            targetWeight: ex.targetWeight,
            unit: ex.unit,
            bench: ex.bench,
            pulley: ex.pulley,
            notes: ex.notes,
          },
        }),
      )
      setDays((d) => d.map((x) => (x.id === dayId ? { ...x, exercises: [...x.exercises, created] } : x)))
    })

  return (
    <>
      <div className="card" style={{ padding: '12px 14px' }}>
        <p className="hint" style={{ margin: 0 }}>
          Series, reps y peso aquí son solo tu <strong>punto de partida</strong>. Los valores reales de cada serie se
          ajustan durante el entreno.
        </p>
      </div>

      {err && <div className="card" style={{ color: 'var(--bad)', fontSize: 13 }}>{err}</div>}

      {days.map((day) => (
        <div className="card" key={day.id}>
          <div className="ex-head" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <input
              defaultValue={day.name}
              className="day-title-input"
              onBlur={(e) => e.target.value.trim() && e.target.value !== day.name && renameDay(day.id, e.target.value.trim())}
              style={{
                fontFamily: 'var(--display)',
                fontSize: 20,
                letterSpacing: 1,
                color: 'var(--accent2)',
                background: 'transparent',
                border: 'none',
                padding: 0,
                boxShadow: 'none',
              }}
            />
            <button className="icon-btn" onClick={() => removeDay(day.id)} aria-label="Borrar día">
              <i className="fa-solid fa-trash"></i>
            </button>
          </div>

          {day.exercises.length ? (
            day.exercises.map((ex) => <ExerciseRow key={ex.id} ex={ex} onRemove={() => removeExercise(day.id, ex.id)} />)
          ) : (
            <div className="list-empty">Sin ejercicios</div>
          )}

          <AddExercise busy={busy} onAdd={(ex) => addExercise(day.id, ex)} />
        </div>
      ))}

      <div className="card">
        <div className="field">
          <input value={newDay} onChange={(e) => setNewDay(e.target.value)} placeholder="Nuevo día, ej. Espalda/Bíceps" />
        </div>
        <button className="btn btn-ghost" onClick={addDay} disabled={busy}>
          <i className="fa-solid fa-plus"></i> Agregar día
        </button>
      </div>

      <a href="/app" className="btn btn-primary">Listo</a>
    </>
  )
}

function ExerciseRow({ ex, onRemove }: { ex: Exercise; onRemove: () => void }) {
  const meta: string[] = []
  if (ex.targetSets || ex.targetReps || ex.targetWeight)
    meta.push(`${ex.targetSets ?? '—'} series · ${ex.targetReps ?? '—'} reps · ${ex.targetWeight ?? '—'} ${ex.unit}`)
  if (ex.bench) meta.push(`Banco: ${ex.bench}`)
  if (ex.pulley) meta.push(`Polea: ${ex.pulley}`)
  return (
    <div className="exercise-row">
      <div className="ex-head">
        <span className="ex-name">{ex.name}</span>
        <button className="icon-btn" onClick={onRemove} aria-label="Borrar ejercicio">
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
      {meta.length > 0 && <div className="ex-meta">{meta.join(' · ')}</div>}
      {ex.notes && <div className="ex-meta" style={{ marginTop: 4, fontStyle: 'italic' }}>{ex.notes}</div>}
    </div>
  )
}

function AddExercise({ busy, onAdd }: { busy: boolean; onAdd: (ex: Omit<Exercise, 'id' | 'position'>) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')
  const [bench, setBench] = useState('')
  const [pulley, setPulley] = useState('')
  const [notes, setNotes] = useState('')

  function submit() {
    if (!name.trim()) return
    onAdd({
      name: name.trim(),
      targetSets: numOrNull(sets),
      targetReps: numOrNull(reps),
      targetWeight: numOrNull(weight),
      unit,
      bench: bench.trim() || null,
      pulley: pulley.trim() || null,
      notes: notes.trim() || null,
    })
    setName(''); setSets(''); setReps(''); setWeight(''); setBench(''); setPulley(''); setNotes(''); setOpen(false)
  }

  if (!open)
    return (
      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setOpen(true)}>
        <i className="fa-solid fa-plus"></i> Agregar ejercicio
      </button>
    )

  return (
    <div style={{ marginTop: 10 }}>
      <div className="field">
        <label>Ejercicio</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Press banca inclinado" autoFocus />
      </div>
      <div className="row3">
        <div className="field"><label>Series</label><input type="number" min="1" value={sets} onChange={(e) => setSets(e.target.value)} placeholder="4" /></div>
        <div className="field"><label>Reps</label><input type="number" min="1" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="10" /></div>
        <div className="field"><label>Peso</label><input type="number" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="40" /></div>
      </div>
      <div className="row2">
        <div className="field">
          <label>Unidad</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value as 'kg' | 'lb')}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </div>
        <div className="field"><label>Banco <span className="opcional">(opcional)</span></label><input value={bench} onChange={(e) => setBench(e.target.value)} placeholder="Ej. nivel 3" /></div>
      </div>
      <div className="field"><label>Polea / agarre <span className="opcional">(opcional)</span></label><input value={pulley} onChange={(e) => setPulley(e.target.value)} placeholder="Ej. polea alta, agarre estrecho" /></div>
      <div className="field"><label>Notas <span className="opcional">(opcional)</span></label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Técnica, sensaciones, referencias…" /></div>
      <div className="btn-row">
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} style={{ flex: 1 }}>Cancelar</button>
        <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy} style={{ flex: 1 }}>Guardar ejercicio</button>
      </div>
    </div>
  )
}
