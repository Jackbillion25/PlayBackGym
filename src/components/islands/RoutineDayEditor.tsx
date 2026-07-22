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

type FormValues = {
  name: string
  sets: string
  reps: string
  weight: string
  unit: 'kg' | 'lb'
  bench: string
  pulley: string
  notes: string
}
const emptyForm: FormValues = { name: '', sets: '', reps: '', weight: '', unit: 'kg', bench: '', pulley: '', notes: '' }
function fromExercise(ex: Exercise): FormValues {
  return {
    name: ex.name,
    sets: ex.targetSets != null ? String(ex.targetSets) : '',
    reps: ex.targetReps != null ? String(ex.targetReps) : '',
    weight: ex.targetWeight != null ? String(ex.targetWeight) : '',
    unit: ex.unit,
    bench: ex.bench ?? '',
    pulley: ex.pulley ?? '',
    notes: ex.notes ?? '',
  }
}

// Pantalla dedicada para editar UN día de la rutina: renombrar, agregar,
// editar y borrar ejercicios. Antes solo se podía agregar/borrar — para
// cambiar un objetivo había que borrar y re-crear el ejercicio.
export default function RoutineDayEditor({ initialDay }: { initialDay: Day }) {
  const [day, setDay] = useState(initialDay)
  const [exercises, setExercises] = useState<Exercise[]>(initialDay.exercises)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)

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

  const renameDay = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === day.name) return
    run(async () => {
      await ok(rpc.days[':id'].$patch({ param: { id: day.id }, json: { name: trimmed } }))
      setDay((d) => ({ ...d, name: trimmed }))
    })
  }

  const deleteDay = () =>
    run(async () => {
      if (!confirm(`¿Borrar "${day.name}" y sus ejercicios? El historial se conserva.`)) return
      await ok(rpc.days[':id'].$delete({ param: { id: day.id } }))
      window.location.href = '/app/rutina'
    })

  const removeExercise = (id: string) =>
    run(async () => {
      if (!confirm('¿Borrar este ejercicio?')) return
      await ok(rpc.exercises[':id'].$delete({ param: { id } }))
      setExercises((xs) => xs.filter((x) => x.id !== id))
    })

  const saveExercise = (values: FormValues, editing: Exercise | null) =>
    run(async () => {
      if (!values.name.trim()) return
      const payload = {
        name: values.name.trim(),
        targetSets: numOrNull(values.sets),
        targetReps: numOrNull(values.reps),
        targetWeight: numOrNull(values.weight),
        unit: values.unit,
        bench: values.bench.trim() || null,
        pulley: values.pulley.trim() || null,
        notes: values.notes.trim() || null,
      }
      if (editing) {
        const updated = await ok<Exercise>(
          rpc.exercises[':id'].$patch({ param: { id: editing.id }, json: payload }),
        )
        setExercises((xs) => xs.map((x) => (x.id === editing.id ? updated : x)))
      } else {
        const created = await ok<Exercise>(
          rpc.days[':dayId'].exercises.$post({ param: { dayId: day.id }, json: payload }),
        )
        setExercises((xs) => [...xs, created])
      }
      setEditingId(null)
    })

  return (
    <>
      <div className="card">
        <label className="eyebrow" htmlFor="day-name">
          Nombre del día
        </label>
        <div className="day-title-wrap">
          <input
            id="day-name"
            className="day-title-input"
            defaultValue={day.name}
            onBlur={(e) => renameDay(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            aria-label="Nombre del día"
          />
          <i className="fa-solid fa-pen pen-hint" aria-hidden="true"></i>
        </div>
      </div>

      {err && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="form-error" style={{ margin: 0 }}>{err}</div>
        </div>
      )}

      <div className="card">
        <div className="eyebrow">
          Ejercicios <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>({exercises.length})</span>
        </div>

        {exercises.length ? (
          exercises.map((ex, i) =>
            editingId === ex.id ? (
              <ExerciseForm
                key={ex.id}
                initial={fromExercise(ex)}
                busy={busy}
                submitLabel="Guardar cambios"
                onCancel={() => setEditingId(null)}
                onSubmit={(v) => saveExercise(v, ex)}
                onDelete={() => removeExercise(ex.id)}
              />
            ) : (
              <button
                key={ex.id}
                type="button"
                className="exercise-row exercise-row-tap anim-in"
                style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                onClick={() => setEditingId(ex.id)}
              >
                <ExercisePreview ex={ex} />
              </button>
            ),
          )
        ) : (
          <div className="list-empty">Sin ejercicios todavía — agrega el primero abajo</div>
        )}

        {editingId === 'new' ? (
          <ExerciseForm
            initial={emptyForm}
            busy={busy}
            submitLabel="Agregar ejercicio"
            onCancel={() => setEditingId(null)}
            onSubmit={(v) => saveExercise(v, null)}
          />
        ) : (
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setEditingId('new')}>
            <i className="fa-solid fa-plus"></i> Agregar ejercicio
          </button>
        )}
      </div>

      <a href="/app/rutina" className="btn btn-primary">
        Listo
      </a>
      <button className="btn btn-danger" onClick={deleteDay}>
        <i className="fa-solid fa-trash"></i> Borrar este día
      </button>
    </>
  )
}

function ExercisePreview({ ex }: { ex: Exercise }) {
  const meta: string[] = []
  if (ex.targetSets || ex.targetReps || ex.targetWeight)
    meta.push(`${ex.targetSets ?? '—'} series · ${ex.targetReps ?? '—'} reps · ${ex.targetWeight ?? '—'} ${ex.unit}`)
  if (ex.bench) meta.push(`Banco: ${ex.bench}`)
  if (ex.pulley) meta.push(`Polea: ${ex.pulley}`)
  return (
    <>
      <div className="ex-head">
        <span className="ex-name">{ex.name}</span>
        <i className="fa-solid fa-pen" style={{ color: 'var(--text3)', fontSize: 12 }} aria-hidden="true"></i>
      </div>
      {meta.length > 0 && <div className="ex-meta">{meta.join(' · ')}</div>}
      {ex.notes && (
        <div className="ex-meta" style={{ marginTop: 4, fontStyle: 'italic' }}>
          {ex.notes}
        </div>
      )}
    </>
  )
}

function ExerciseForm({
  initial,
  busy,
  submitLabel,
  onCancel,
  onSubmit,
  onDelete,
}: {
  initial: FormValues
  busy: boolean
  submitLabel: string
  onCancel: () => void
  onSubmit: (v: FormValues) => void
  onDelete?: () => void
}) {
  const [v, setV] = useState<FormValues>(initial)
  const set = <K extends keyof FormValues>(key: K, val: FormValues[K]) => setV((prev) => ({ ...prev, [key]: val }))

  return (
    <div className="card anim-expand" style={{ marginTop: 10, marginBottom: 10, background: 'var(--surface2)' }}>
      <div className="field">
        <label>Ejercicio</label>
        <input value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Press banca inclinado" autoFocus />
      </div>
      <div className="row3">
        <div className="field">
          <label>Series</label>
          <input type="number" min="1" value={v.sets} onChange={(e) => set('sets', e.target.value)} placeholder="4" />
        </div>
        <div className="field">
          <label>Reps</label>
          <input type="number" min="1" value={v.reps} onChange={(e) => set('reps', e.target.value)} placeholder="10" />
        </div>
        <div className="field">
          <label>Peso</label>
          <input type="number" step="0.5" value={v.weight} onChange={(e) => set('weight', e.target.value)} placeholder="40" />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label>Unidad</label>
          <select value={v.unit} onChange={(e) => set('unit', e.target.value as 'kg' | 'lb')}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </div>
        <div className="field">
          <label>
            Banco <span className="opcional">(opcional)</span>
          </label>
          <input value={v.bench} onChange={(e) => set('bench', e.target.value)} placeholder="Ej. nivel 3" />
        </div>
      </div>
      <div className="field">
        <label>
          Polea / agarre <span className="opcional">(opcional)</span>
        </label>
        <input value={v.pulley} onChange={(e) => set('pulley', e.target.value)} placeholder="Ej. polea alta, agarre estrecho" />
      </div>
      <div className="field">
        <label>
          Notas <span className="opcional">(opcional)</span>
        </label>
        <textarea value={v.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Técnica, sensaciones, referencias…" />
      </div>
      <div className="btn-row">
        <button className="btn btn-ghost btn-sm" onClick={onCancel} style={{ flex: 1 }}>
          Cancelar
        </button>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => v.name.trim() && onSubmit(v)}
          disabled={busy || !v.name.trim()}
          style={{ flex: 1 }}
        >
          {submitLabel}
        </button>
      </div>
      {onDelete && (
        <button className="btn btn-danger btn-sm" style={{ marginTop: 10, width: '100%' }} onClick={onDelete}>
          <i className="fa-solid fa-trash"></i> Borrar ejercicio
        </button>
      )}
    </div>
  )
}
