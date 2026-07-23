import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { rpc } from '../../lib/api-client'
import { fmtClock, fmtDuration } from '../../lib/format'
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
type Prefill = { day: { id: string; name: string; lastDurationSeconds: number | null }; exercises: PrefillExercise[] }

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
const WEIGHT_STEP_SMALL = 0.5
const WEIGHT_STEP_BIG = 1
const REST_PRESETS = [60, 90, 120, 180]
const REST_CUSTOM_MAX = 3
// Uso + presets de descanso (de fábrica y creados a mano) — globales, no por
// día: si armaste "1:30" entrenando piernas, lo quieres disponible en pecho.
// Se guardan juntos porque el orden en pantalla depende del uso de todos.
const REST_PRESETS_KEY = 'bitacora_rest_presets'

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

// "90" -> "1:30", "60" -> "1min" (los presets de fábrica siguen en min/s redondos)
function fmtPresetLabel(secs: number): string {
  if (secs % 60 === 0) return `${secs / 60}min`
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
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

  const changeUnit = (exerciseId: string, ei: number, unit: 'kg' | 'lb') => {
    setExs((prev) => prev.map((e, idx) => (idx === ei ? { ...e, unit } : e)))
    rpc.exercises[':id'].$patch({ param: { id: exerciseId }, json: { unit } }).catch((err) => console.error(err))
  }

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
      const durationSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000))
      const res = await rpc.sessions.$post({ json: { dayId, entries, durationSeconds } })
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
      <TrainCockpit
        dayName={prefill.day.name}
        completed={completedCount}
        total={exs.length}
        startedAt={startedAt}
        dayId={dayId}
        lastDurationSeconds={prefill.day.lastDurationSeconds}
      />
      <main className="app-main" style={{ paddingTop: 8 }}>
        <div className="card" style={{ padding: '12px 14px' }}>
          <p className="hint" style={{ margin: 0 }}>
            Registra <strong>cada serie por separado</strong>. Si cambias el peso a mitad de rutina, toca
            "+ Agregar serie" en vez de duplicar el ejercicio.
          </p>
        </div>

        {exs.map((e, ei) => (
          <div
            className={`ex-train-card ${e.completed ? 'done' : ''} anim-in`}
            style={{ animationDelay: `${Math.min(ei, 8) * 40}ms` }}
            key={e.exerciseId}
          >
            <div className="ex-train-headrow">
              <button
                type="button"
                className="ex-train-head"
                onClick={() => update(ei, { completed: !e.completed })}
                aria-pressed={e.completed}
              >
                <span className={`checkbox ${e.completed ? 'checked' : ''}`} aria-hidden="true">
                  {e.completed && <i className="fa-solid fa-check"></i>}
                </span>
                <span className="ex-train-title">{e.name}</span>
              </button>
              <div className="unit-toggle" role="group" aria-label="Unidad de peso">
                <button
                  type="button"
                  className={e.unit === 'kg' ? 'on' : ''}
                  aria-pressed={e.unit === 'kg'}
                  onClick={() => changeUnit(e.exerciseId, ei, 'kg')}
                >
                  kg
                </button>
                <button
                  type="button"
                  className={e.unit === 'lb' ? 'on' : ''}
                  aria-pressed={e.unit === 'lb'}
                  onClick={() => changeUnit(e.exerciseId, ei, 'lb')}
                >
                  lb
                </button>
              </div>
            </div>

            {e.sets.map((s, si) => (
              <div className="set-card" key={si}>
                <div className="set-card-head">
                  <span className="set-idx">Serie {si + 1}</span>
                  {si > 0 && (
                    <button className="icon-btn" onClick={() => removeSet(ei, si)} aria-label="quitar serie">
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  )}
                </div>
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
                  <div className="stepper stepper-weight">
                    <button
                      className="step-lg"
                      onClick={() => step(ei, si, 'weight', -WEIGHT_STEP_BIG)}
                      aria-label="menos 1"
                    >
                      −
                    </button>
                    <button
                      className="step-sm"
                      onClick={() => step(ei, si, 'weight', -WEIGHT_STEP_SMALL)}
                      aria-label="menos 0.5"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={s.weight}
                      onChange={(ev) => updateSet(ei, si, { weight: ev.target.value })}
                      placeholder="peso"
                    />
                    <button
                      className="step-sm"
                      onClick={() => step(ei, si, 'weight', WEIGHT_STEP_SMALL)}
                      aria-label="más 0.5"
                    >
                      +
                    </button>
                    <button
                      className="step-lg"
                      onClick={() => step(ei, si, 'weight', WEIGHT_STEP_BIG)}
                      aria-label="más 1"
                    >
                      +
                    </button>
                  </div>
                </div>
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

// ---- Cabina sticky: volver + cronómetro + progreso + timer de descanso -----
// Una sola región sticky (en vez de piezas sueltas con offsets fijos) para que
// el respiro contra el borde superior sea real y no se rompa si cambia el alto.
function TrainCockpit({
  dayName,
  completed,
  total,
  startedAt,
  dayId,
  lastDurationSeconds,
}: {
  dayName: string
  completed: number
  total: number
  startedAt: number
  dayId: string
  lastDurationSeconds: number | null
}) {
  // Se recalcula desde el timestamp de inicio: sobrevive recargas sin reiniciarse.
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  return (
    <div className={`train-sticky ${scrolled ? 'scrolled' : ''}`}>
      <div className="train-header">
        <div className="train-header-left">
          <a href="/app" className="icon-btn" aria-label="Salir del entreno (tu borrador se guarda)" style={{ color: 'var(--text2)' }}>
            <i className="fa-solid fa-arrow-left"></i>
          </a>
          <div className="brand">
            {dayName}
            <small>{completed}/{total} completados</small>
          </div>
        </div>
        <div className="clock" title="Tiempo de sesión">
          <span className="clock-time">{fmtClock(seconds)}</span>
          <span className="clock-label"><i className="fa-solid fa-stopwatch"></i> sesión</span>
          {lastDurationSeconds != null && <span className="clock-prev">Antes: {fmtDuration(lastDurationSeconds)}</span>}
        </div>
      </div>
      <div className="train-progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="train-progress-fill" style={{ width: `${pct}%` }}></div>
      </div>
      <RestTimer dayId={dayId} />
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

type RestPreset = { secs: number; uses: number; custom: boolean }

function loadRestPresets(): RestPreset[] {
  const defaults = REST_PRESETS.map((secs) => ({ secs, uses: 0, custom: false }))
  if (typeof window === 'undefined') return defaults
  try {
    const raw = localStorage.getItem(REST_PRESETS_KEY)
    const arr = raw ? JSON.parse(raw) : null
    if (!Array.isArray(arr)) return defaults
    const saved: RestPreset[] = arr
      .filter((p) => p && typeof p.secs === 'number')
      .map((p) => ({ secs: p.secs, uses: typeof p.uses === 'number' ? p.uses : 0, custom: !!p.custom }))
    // Los de fábrica siempre existen; se les pega el uso guardado si lo hay.
    const merged = defaults.map((d) => saved.find((s) => s.secs === d.secs && !s.custom) ?? d)
    const custom = saved.filter((s) => s.custom && !REST_PRESETS.includes(s.secs)).slice(0, REST_CUSTOM_MAX)
    return [...merged, ...custom]
  } catch {
    return defaults
  }
}

function RestTimer({ dayId }: { dayId: string }) {
  const [duration, setDuration] = useState(90)
  const [remaining, setRemaining] = useState(0)
  const [running, setRunning] = useState(false)
  const [presets, setPresets] = useState<RestPreset[]>(loadRestPresets)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMin, setModalMin] = useState(1)
  const [modalSec, setModalSec] = useState(30)
  const endRef = useRef<number>(0)
  const presetsRef = useRef<HTMLDivElement>(null)

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
  const persistPresets = (list: RestPreset[]) => {
    try {
      localStorage.setItem(REST_PRESETS_KEY, JSON.stringify(list))
    } catch {}
  }

  // Cada uso suma un punto — el orden en pantalla (más usado primero, más a
  // la izquierda) se deriva de esto al renderizar, no se guarda por separado.
  const bumpUsage = (secs: number) =>
    setPresets((prev) => {
      if (!prev.some((p) => p.secs === secs)) return prev
      const next = prev.map((p) => (p.secs === secs ? { ...p, uses: p.uses + 1 } : p))
      persistPresets(next)
      return next
    })

  const start = (secs: number) => {
    setDuration(secs)
    setRemaining(secs)
    const endsAt = Date.now() + secs * 1000
    endRef.current = endsAt
    persistEnd(endsAt)
    setRunning(true)
    bumpUsage(secs)
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

  // Un valor armado a mano (p. ej. 1:30) se vuelve botón para la próxima vez.
  // Tope de REST_CUSTOM_MAX entre los custom: si ya está lleno, se cae el que
  // menos se ha usado (empate entre varios con el mismo uso → al azar entre esos).
  const addCustomPreset = (secs: number) => {
    if (REST_PRESETS.includes(secs)) return
    setPresets((prev) => {
      if (prev.some((p) => p.secs === secs)) return prev
      const custom = prev.filter((p) => p.custom)
      let list = prev
      if (custom.length >= REST_CUSTOM_MAX) {
        const minUses = Math.min(...custom.map((p) => p.uses))
        const leastUsed = custom.filter((p) => p.uses === minUses)
        const toDrop = leastUsed[Math.floor(Math.random() * leastUsed.length)]
        list = list.filter((p) => p.secs !== toDrop.secs)
      }
      const next = [...list, { secs, uses: 0, custom: true }]
      persistPresets(next)
      return next
    })
  }

  const startCustom = () => {
    const secs = modalMin * 60 + modalSec
    if (secs <= 0) return
    addCustomPreset(secs)
    start(secs)
    setModalOpen(false)
  }

  const clampMin = (n: number) => Math.max(0, Math.min(59, Math.round(n) || 0))
  const clampSec = (n: number) => Math.max(0, Math.min(55, Math.round(n) || 0))

  // Flechas para avanzar/retroceder un preset a la vez — más descubrible que
  // depender de arrastrar (en PC no hay pista visual de que se puede deslizar).
  const scrollByOne = (dir: 1 | -1) => {
    const el = presetsRef.current
    if (!el) return
    const child = el.querySelector<HTMLElement>('.rest-preset')
    const step = child ? child.offsetWidth + 6 : 80
    el.scrollBy({ left: dir * step, behavior: 'smooth' })
  }

  // Más usado, más a la izquierda (más accesible sin tener que deslizar).
  const sortedPresets = [...presets].sort((a, b) => b.uses - a.uses)

  return (
    <div className="rest-bar">
      <div className={`rest-time ${running ? 'running' : ''}`}>{fmtClock(remaining || duration)}</div>
      <div className="rest-presets-wrap">
        <button
          type="button"
          className="rest-scroll-btn"
          aria-label="Ver presets anteriores"
          onClick={() => scrollByOne(-1)}
        >
          <i className="fa-solid fa-chevron-left"></i>
        </button>
        {/* El "+" vive al final del scroll (no fuera) para no robarle ancho
            a la franja donde se desliza con el dedo. */}
        <div className="rest-presets" ref={presetsRef}>
          {sortedPresets.map((p) => (
            <button key={p.secs} className={`rest-preset ${duration === p.secs ? 'on' : ''}`} onClick={() => start(p.secs)}>
              {fmtPresetLabel(p.secs)}
            </button>
          ))}
          <button
            type="button"
            className="rest-preset rest-preset-add"
            aria-label="Personalizar descanso"
            title="Personalizar descanso"
            onClick={() => setModalOpen(true)}
          >
            <i className="fa-solid fa-plus"></i>
          </button>
        </div>
        <button
          type="button"
          className="rest-scroll-btn"
          aria-label="Ver más presets"
          onClick={() => scrollByOne(1)}
        >
          <i className="fa-solid fa-chevron-right"></i>
        </button>
      </div>
      <button className="rest-btn" onClick={toggle} aria-label={running ? 'Pausar descanso' : 'Iniciar descanso'} title="Iniciar/pausar descanso">
        <i className={`fa-solid ${running ? 'fa-pause' : 'fa-play'}`}></i>
      </button>
      <button className="rest-btn" onClick={reset} aria-label="Reiniciar descanso" title="Reiniciar" style={{ background: 'var(--surface3)', color: 'var(--text2)' }}>
        <i className="fa-solid fa-rotate-left"></i>
      </button>

      {modalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="modal-overlay" onClick={() => setModalOpen(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-head">
                <span>Descanso personalizado</span>
                <button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => setModalOpen(false)}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
              <div className="row2">
                <div className="set-field">
                  <span className="set-field-label">Minutos</span>
                  <div className="stepper">
                    <button onClick={() => setModalMin((m) => clampMin(m - 1))} aria-label="menos minutos">−</button>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={modalMin}
                      onChange={(e) => setModalMin(clampMin(Number(e.target.value)))}
                    />
                    <button onClick={() => setModalMin((m) => clampMin(m + 1))} aria-label="más minutos">+</button>
                  </div>
                </div>
                <div className="set-field">
                  <span className="set-field-label">Segundos</span>
                  <div className="stepper">
                    <button onClick={() => setModalSec((s) => clampSec(s - 5))} aria-label="menos segundos">−</button>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={modalSec}
                      onChange={(e) => setModalSec(clampSec(Number(e.target.value)))}
                    />
                    <button onClick={() => setModalSec((s) => clampSec(s + 5))} aria-label="más segundos">+</button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginTop: 12 }}
                onClick={startCustom}
                disabled={modalMin === 0 && modalSec === 0}
              >
                Iniciar descanso
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
