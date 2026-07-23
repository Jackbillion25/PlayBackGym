import { useState } from 'react'
import { rpc } from '../../lib/api-client'

type ExerciseSetTarget = { targetReps: number | null; targetWeight: number | null }
type Exercise = {
  id: string
  name: string
  unit: 'kg' | 'lb'
  bench: string | null
  pulley: string | null
  notes: string | null
  position: number
  sets: ExerciseSetTarget[]
}
type Day = { id: string; name: string; position: number; exercises: Exercise[] }

async function ok<T>(p: Promise<{ json: () => Promise<unknown> }>): Promise<T> {
  const res = await p
  const body = (await res.json()) as { success: boolean; data?: T; error?: { message: string } }
  if (!body.success) throw new Error(body.error?.message ?? 'Error')
  return body.data as T
}

const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v))

const REPS_STEP = 1
const WEIGHT_STEP_SMALL = 0.5
const WEIGHT_STEP_BIG = 1

type SetForm = { reps: string; weight: string }
type FormValues = {
  name: string
  sets: SetForm[]
  unit: 'kg' | 'lb'
  bench: string
  pulley: string
  notes: string
}
const emptyForm: FormValues = { name: '', sets: [{ reps: '', weight: '' }], unit: 'kg', bench: '', pulley: '', notes: '' }
function fromExercise(ex: Exercise): FormValues {
  return {
    name: ex.name,
    sets: ex.sets.length
      ? ex.sets.map((s) => ({
          reps: s.targetReps != null ? String(s.targetReps) : '',
          weight: s.targetWeight != null ? String(s.targetWeight) : '',
        }))
      : [{ reps: '', weight: '' }],
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
        sets: values.sets.map((s) => ({ targetReps: numOrNull(s.reps), targetWeight: numOrNull(s.weight) })),
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

// Serie por serie con el mismo objetivo (el caso común) se resume compacto;
// si varían, se listan una por una para no ocultar la diferencia.
function setsSummary(sets: ExerciseSetTarget[], unit: 'kg' | 'lb'): string {
  const n = sets.length
  const first = sets[0]
  const uniform = sets.every((s) => s.targetReps === first.targetReps && s.targetWeight === first.targetWeight)
  if (uniform) {
    if (first.targetReps == null && first.targetWeight == null) return `${n} serie${n === 1 ? '' : 's'}`
    return `${n} serie${n === 1 ? '' : 's'} · ${first.targetReps ?? '—'} reps · ${first.targetWeight ?? '—'} ${unit}`
  }
  return `${sets.map((s) => `${s.targetReps ?? '—'}×${s.targetWeight ?? '—'}`).join(', ')} ${unit}`
}

function ExercisePreview({ ex }: { ex: Exercise }) {
  const meta: string[] = []
  if (ex.sets.length) meta.push(setsSummary(ex.sets, ex.unit))
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

  const updateSet = (si: number, patch: Partial<SetForm>) =>
    setV((prev) => ({ ...prev, sets: prev.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) }))

  const step = (si: number, field: 'reps' | 'weight', delta: number) =>
    setV((prev) => ({
      ...prev,
      sets: prev.sets.map((s, j) => {
        if (j !== si) return s
        const cur = Number(s[field]) || 0
        let next = cur + delta
        if (next < 0) next = 0
        const val = Number.isInteger(next) ? String(next) : String(Math.round(next * 10) / 10)
        return { ...s, [field]: val }
      }),
    }))

  const addSet = () =>
    setV((prev) => {
      const last = prev.sets[prev.sets.length - 1] ?? { reps: '', weight: '' }
      return { ...prev, sets: [...prev.sets, { ...last }] }
    })

  const removeSet = (si: number) =>
    setV((prev) => {
      const sets = prev.sets.filter((_, j) => j !== si)
      return { ...prev, sets: sets.length ? sets : [{ reps: '', weight: '' }] }
    })

  return (
    <div className="card anim-expand" style={{ marginTop: 10, marginBottom: 10, background: 'var(--surface2)' }}>
      <div className="field">
        <label>Ejercicio</label>
        <input value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Ej. Press banca inclinado" autoFocus />
      </div>
      <div className="field">
        <label>Unidad</label>
        <select value={v.unit} onChange={(e) => set('unit', e.target.value as 'kg' | 'lb')}>
          <option value="kg">kg</option>
          <option value="lb">lb</option>
        </select>
      </div>

      {v.sets.map((s, si) => (
        <div className="set-card" key={si}>
          <div className="set-card-head">
            <span className="set-idx">Serie {si + 1}</span>
            {v.sets.length > 1 && (
              <button className="icon-btn" onClick={() => removeSet(si)} aria-label="quitar serie">
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>
          <div className="set-field">
            <span className="set-field-label">
              Repeticiones <span className="opcional">(opcional)</span>
            </span>
            <div className="stepper">
              <button onClick={() => step(si, 'reps', -REPS_STEP)} aria-label="menos reps">−</button>
              <input
                type="number"
                inputMode="numeric"
                value={s.reps}
                onChange={(e) => updateSet(si, { reps: e.target.value })}
                placeholder="reps"
              />
              <button onClick={() => step(si, 'reps', REPS_STEP)} aria-label="más reps">+</button>
            </div>
          </div>
          <div className="set-field">
            <span className="set-field-label">
              Peso ({v.unit}) <span className="opcional">(opcional)</span>
            </span>
            <div className="stepper stepper-weight">
              <button className="step-lg" onClick={() => step(si, 'weight', -WEIGHT_STEP_BIG)} aria-label="menos 1">−</button>
              <button className="step-sm" onClick={() => step(si, 'weight', -WEIGHT_STEP_SMALL)} aria-label="menos 0.5">−</button>
              <input
                type="number"
                inputMode="decimal"
                step="0.5"
                value={s.weight}
                onChange={(e) => updateSet(si, { weight: e.target.value })}
                placeholder="peso"
              />
              <button className="step-sm" onClick={() => step(si, 'weight', WEIGHT_STEP_SMALL)} aria-label="más 0.5">+</button>
              <button className="step-lg" onClick={() => step(si, 'weight', WEIGHT_STEP_BIG)} aria-label="más 1">+</button>
            </div>
          </div>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={addSet} style={{ margin: '6px 0 12px' }}>
        <i className="fa-solid fa-plus"></i> Agregar serie
      </button>

      <div className="field">
        <label>
          Banco <span className="opcional">(opcional)</span>
        </label>
        <input value={v.bench} onChange={(e) => set('bench', e.target.value)} placeholder="Ej. nivel 3" />
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
