import { useEffect, useRef, useState } from 'react'
import { rpc } from '../../lib/api-client'
import { fmtClock } from '../../lib/format'
import SessionFeedback, { type FeedbackData } from './SessionFeedback'

type PrefillSet = { reps: number | null; weight: number | null }
type PrefillExercise = {
  exerciseId: string
  name: string
  unit: 'kg' | 'lb'
  bench: string
  pulley: string
  extraWeight: string
  notes: string
  sets: PrefillSet[]
}
type Prefill = { day: { id: string; name: string }; exercises: PrefillExercise[] }

type SetV = { reps: string; weight: string }
type ExState = {
  exerciseId: string
  name: string
  unit: 'kg' | 'lb'
  bench: string
  pulley: string
  extraWeight: string
  notes: string
  completed: boolean
  sets: SetV[]
}

const REPS_STEP = 1
const WEIGHT_STEP = 2.5
const REST_PRESETS = [60, 90, 120, 180]

function draftKey(dayId: string) {
  return `bitacora_draft_${dayId}`
}
// Timestamp (ms) en que arrancó la sesión — persiste para recalcular el tiempo
// transcurrido al instante tras recargar (no se reinicia hasta finalizar).
function startedKey(dayId: string) {
  return `bitacora_started_${dayId}`
}
// Timestamp (ms) en que termina el descanso en curso — persiste para reanudar.
function restKey(dayId: string) {
  return `bitacora_rest_${dayId}`
}

function fromPrefill(pf: Prefill): ExState[] {
  return pf.exercises.map((e) => ({
    exerciseId: e.exerciseId,
    name: e.name,
    unit: e.unit,
    bench: e.bench ?? '',
    pulley: e.pulley ?? '',
    extraWeight: e.extraWeight ?? '',
    notes: e.notes ?? '',
    completed: false,
    sets: (e.sets.length ? e.sets : [{ reps: null, weight: null }]).map((s) => ({
      reps: s.reps == null ? '' : String(s.reps),
      weight: s.weight == null ? '' : String(s.weight),
    })),
  }))
}

const toNum = (v: string): number | null => (v.trim() === '' ? null : Number(v))

export default function TrainingSession({ prefill, userPhone }: { prefill: Prefill; userPhone?: string | null }) {
  const dayId = prefill.day.id
  const [exs, setExs] = useState<ExState[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(draftKey(dayId))
        if (raw) {
          const saved = JSON.parse(raw) as ExState[]
          if (Array.isArray(saved) && saved.length) return saved
        }
      } catch {}
    }
    return fromPrefill(prefill)
  })
  // Momento de inicio persistido (ms). Se lee o se fija una sola vez.
  const [startedAt] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(startedKey(dayId))
        if (raw) return Number(raw)
        const now = Date.now()
        localStorage.setItem(startedKey(dayId), String(now))
        return now
      } catch {}
    }
    return Date.now()
  })
  const [feedback, setFeedback] = useState<FeedbackData | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Persistir draft en cada cambio (offline-tolerante)
  useEffect(() => {
    try {
      localStorage.setItem(draftKey(dayId), JSON.stringify(exs))
    } catch {}
  }, [exs, dayId])

  const update = (i: number, patch: Partial<ExState>) =>
    setExs((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))

  const updateSet = (ei: number, si: number, patch: Partial<SetV>) =>
    setExs((prev) =>
      prev.map((e, idx) =>
        idx === ei ? { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : e,
      ),
    )

  const step = (ei: number, si: number, field: 'reps' | 'weight', delta: number) =>
    setExs((prev) =>
      prev.map((e, idx) => {
        if (idx !== ei) return e
        return {
          ...e,
          sets: e.sets.map((s, j) => {
            if (j !== si) return s
            const cur = Number(s[field]) || 0
            let next = cur + delta
            if (next < 0) next = 0
            const val = Number.isInteger(next) ? String(next) : String(Math.round(next * 10) / 10)
            return { ...s, [field]: val }
          }),
        }
      }),
    )

  const addSet = (ei: number) =>
    setExs((prev) =>
      prev.map((e, idx) => {
        if (idx !== ei) return e
        const last = e.sets[e.sets.length - 1] ?? { reps: '', weight: '' }
        return { ...e, sets: [...e.sets, { ...last }] }
      }),
    )

  const removeSet = (ei: number, si: number) =>
    setExs((prev) =>
      prev.map((e, idx) => {
        if (idx !== ei) return e
        const sets = e.sets.filter((_, j) => j !== si)
        return { ...e, sets: sets.length ? sets : [{ reps: '', weight: '' }] }
      }),
    )

  async function finish() {
    setErr(null)
    setSaving(true)
    try {
      const entries = exs.map((e) => ({
        exerciseId: e.exerciseId,
        completed: e.completed,
        bench: e.bench,
        pulley: e.pulley,
        extraWeight: e.extraWeight,
        notes: e.notes,
        sets: e.sets.map((s) => ({ reps: toNum(s.reps), weight: toNum(s.weight) })),
      }))
      const res = await rpc.sessions.$post({ json: { dayId, entries } })
      const body = (await res.json()) as
        | { success: true; data: FeedbackData }
        | { success: false; error: { message: string } }
      if (!body.success) throw new Error(body.error.message)
      try {
        localStorage.removeItem(draftKey(dayId))
        localStorage.removeItem(startedKey(dayId))
        localStorage.removeItem(restKey(dayId))
      } catch {}
      setFeedback({ ...body.data, dayName: prefill.day.name })
      window.scrollTo(0, 0)
    } catch (e) {
      setErr('No se pudo guardar (¿sin conexión?). Tu registro sigue aquí — reintenta.')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    if (confirm('¿Salir del entreno? Tu borrador se guarda para continuar después.')) {
      window.location.href = '/app'
    }
  }

  if (feedback) {
    return (
      <main className="app-main" style={{ paddingTop: 16 }}>
        <SessionFeedback data={feedback} phone={userPhone} />
      </main>
    )
  }

  const completedCount = exs.filter((e) => e.completed).length

  return (
    <>
      <TrainHeader dayName={prefill.day.name} completed={completedCount} total={exs.length} startedAt={startedAt} />
      <main className="app-main" style={{ paddingTop: 8 }}>
        <RestTimer dayId={dayId} />

        <div className="card" style={{ padding: '12px 14px' }}>
          <p className="hint" style={{ margin: 0 }}>
            Registra <strong>cada serie por separado</strong>. Si cambias el peso a mitad de rutina, toca
            "+ Agregar serie" en vez de duplicar el ejercicio.
          </p>
        </div>

        {exs.map((e, ei) => (
          <div className={`ex-train-card ${e.completed ? 'done' : ''}`} key={e.exerciseId}>
            <div className="ex-train-head">
              <button
                className={`checkbox ${e.completed ? 'checked' : ''}`}
                onClick={() => update(ei, { completed: !e.completed })}
                aria-label="Marcar completado"
              >
                {e.completed && <i className="fa-solid fa-check"></i>}
              </button>
              <div className="ex-train-title">{e.name}</div>
            </div>

            {e.sets.map((s, si) => (
              <div className="set-row" key={si}>
                <span className="set-idx">S{si + 1}</span>
                <div className="set-field">
                  <span className="set-field-label">Repeticiones</span>
                  <div className="stepper">
                    <button onClick={() => step(ei, si, 'reps', -REPS_STEP)} aria-label="menos reps">−</button>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={s.reps}
                      onChange={(ev) => updateSet(ei, si, { reps: ev.target.value })}
                      placeholder="reps"
                    />
                    <button onClick={() => step(ei, si, 'reps', REPS_STEP)} aria-label="más reps">+</button>
                  </div>
                </div>
                <div className="set-field">
                  <span className="set-field-label">Peso ({e.unit})</span>
                  <div className="stepper">
                    <button onClick={() => step(ei, si, 'weight', -WEIGHT_STEP)} aria-label="menos peso">−</button>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={s.weight}
                      onChange={(ev) => updateSet(ei, si, { weight: ev.target.value })}
                      placeholder="peso"
                    />
                    <button onClick={() => step(ei, si, 'weight', WEIGHT_STEP)} aria-label="más peso">+</button>
                  </div>
                </div>
                {si > 0 ? (
                  <button className="icon-btn" onClick={() => removeSet(ei, si)} aria-label="quitar serie">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                ) : (
                  <span className="set-spacer"></span>
                )}
              </div>
            ))}

            <button className="btn btn-ghost btn-sm" onClick={() => addSet(ei)} style={{ margin: '6px 0 12px' }}>
              <i className="fa-solid fa-plus"></i> Agregar serie
            </button>

            <div className="ex-fields2">
              <div className="field">
                <label>Banco <span className="opcional">(opcional)</span></label>
                <input value={e.bench} onChange={(ev) => update(ei, { bench: ev.target.value })} />
              </div>
              <div className="field">
                <label>Polea <span className="opcional">(opcional)</span></label>
                <input value={e.pulley} onChange={(ev) => update(ei, { pulley: ev.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Peso extra <span className="opcional">(opcional · disco, banda o peso externo)</span></label>
              <input
                value={e.extraWeight}
                onChange={(ev) => update(ei, { extraWeight: ev.target.value })}
                placeholder="Ej. disco de 5 kg, banda…"
              />
            </div>
            <div className="field">
              <label>Notas <span className="opcional">(opcional)</span></label>
              <textarea value={e.notes} onChange={(ev) => update(ei, { notes: ev.target.value })} placeholder="Técnica, sensaciones, referencias…" />
            </div>
          </div>
        ))}

        {err && <div style={{ color: 'var(--bad)', fontSize: 13 }}>{err}</div>}

        <button className="btn btn-primary" onClick={finish} disabled={saving}>
          {saving ? 'Guardando…' : 'Finalizar sesión'}
        </button>
        <button className="btn btn-ghost" onClick={cancel}>Cancelar</button>
      </main>
    </>
  )
}

// ---- Cronómetro sticky (tiempo total de sesión, basado en timestamp) --------
function TrainHeader({
  dayName,
  completed,
  total,
  startedAt,
}: {
  dayName: string
  completed: number
  total: number
  startedAt: number
}) {
  // Se recalcula desde el timestamp de inicio: sobrevive recargas sin reiniciarse.
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  return (
    <div className="train-header">
      <div className="brand">
        {dayName}
        <small>{completed}/{total} completados</small>
      </div>
      <div className="clock" title="Tiempo de sesión">
        <span className="clock-time">{fmtClock(seconds)}</span>
        <span className="clock-label"><i className="fa-solid fa-stopwatch"></i> sesión</span>
      </div>
    </div>
  )
}

// ---- Timer de descanso configurable ----------------------------------------
function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
  } catch {}
  try {
    navigator.vibrate?.([200, 100, 200])
  } catch {}
}

function RestTimer({ dayId }: { dayId: string }) {
  const [duration, setDuration] = useState(90)
  const [remaining, setRemaining] = useState(0)
  const [running, setRunning] = useState(false)
  const [custom, setCustom] = useState('')
  const endRef = useRef<number>(0)

  // Reanudar un descanso en curso tras recargar: el fin está guardado como
  // timestamp (ms), así el tiempo restante se recalcula al instante.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(restKey(dayId))
      if (raw) {
        const endsAt = Number(raw)
        const left = Math.round((endsAt - Date.now()) / 1000)
        if (left > 0) {
          endRef.current = endsAt
          setRemaining(left)
          setRunning(true)
        } else {
          localStorage.removeItem(restKey(dayId))
        }
      }
    } catch {}
  }, [dayId])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const left = Math.round((endRef.current - Date.now()) / 1000)
      if (left <= 0) {
        setRemaining(0)
        setRunning(false)
        try {
          localStorage.removeItem(restKey(dayId))
        } catch {}
        beep()
        clearInterval(id)
      } else {
        setRemaining(left)
      }
    }, 250)
    return () => clearInterval(id)
  }, [running, dayId])

  const persistEnd = (endsAt: number | null) => {
    try {
      if (endsAt) localStorage.setItem(restKey(dayId), String(endsAt))
      else localStorage.removeItem(restKey(dayId))
    } catch {}
  }
  const start = (secs: number) => {
    setDuration(secs)
    setRemaining(secs)
    const endsAt = Date.now() + secs * 1000
    endRef.current = endsAt
    persistEnd(endsAt)
    setRunning(true)
  }
  const toggle = () => {
    if (running) {
      setRunning(false)
      persistEnd(null) // pausa: no reanudar solo tras recargar
    } else {
      start(remaining > 0 ? remaining : duration)
    }
  }
  const reset = () => {
    setRunning(false)
    setRemaining(0)
    persistEnd(null)
  }

  return (
    <div className="rest-bar">
      <div className={`rest-time ${running ? 'running' : ''}`}>{fmtClock(remaining || duration)}</div>
      <div className="rest-presets">
        {REST_PRESETS.map((p) => (
          <button key={p} className={`rest-preset ${duration === p ? 'on' : ''}`} onClick={() => start(p)}>
            {p >= 60 ? `${p / 60}min` : `${p}s`}
          </button>
        ))}
        <input
          type="number"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && Number(custom) > 0) start(Number(custom))
          }}
          placeholder="seg"
          style={{ width: 56, padding: '6px 8px', fontSize: 12 }}
          aria-label="Descanso personalizado en segundos"
        />
      </div>
      <button className="rest-btn" onClick={toggle} aria-label={running ? 'Pausar descanso' : 'Iniciar descanso'} title="Iniciar/pausar descanso">
        <i className={`fa-solid ${running ? 'fa-pause' : 'fa-play'}`}></i>
      </button>
      <button className="rest-btn" onClick={reset} aria-label="Reiniciar descanso" title="Reiniciar" style={{ background: 'var(--surface3)', color: 'var(--text2)' }}>
        <i className="fa-solid fa-rotate-left"></i>
      </button>
    </div>
  )
}
