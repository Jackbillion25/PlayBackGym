import { useState } from 'react'
import { rpc } from '../../lib/api-client'

type Day = { id: string; name: string; position: number; exercises: { id: string }[] }

async function ok<T>(p: Promise<{ json: () => Promise<unknown> }>): Promise<T> {
  const res = await p
  const body = (await res.json()) as { success: boolean; data?: T; error?: { message: string } }
  if (!body.success) throw new Error(body.error?.message ?? 'Error')
  return body.data as T
}

// Lista de días de la rutina. Cada día se edita en su propia pantalla
// (/app/rutina/[dayId]) — aquí solo se crean, se navega y se borran.
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

  const addDay = () => {
    if (!newDay.trim()) return
    run(async () => {
      const day = await ok<Day>(rpc.days.$post({ json: { name: newDay.trim() } }))
      // Llevar directo a la pantalla del día nuevo: lo natural después de
      // crear un día es agregarle ejercicios, no seguir viendo la lista.
      window.location.href = `/app/rutina/${day.id}`
    })
  }

  const removeDay = (id: string, name: string) => {
    if (!confirm(`¿Borrar "${name}" y sus ejercicios? El historial se conserva.`)) return
    run(async () => {
      await ok(rpc.days[':id'].$delete({ param: { id } }))
      setDays((d) => d.filter((x) => x.id !== id))
    })
  }

  return (
    <>
      <div className="card" style={{ padding: '12px 14px' }}>
        <p className="hint" style={{ margin: 0 }}>
          Toca un día para editar sus ejercicios. Series, reps y peso ahí son solo tu{' '}
          <strong>punto de partida</strong> — los valores reales se ajustan durante el entreno.
        </p>
      </div>

      {err && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <div className="form-error" style={{ margin: 0 }}>{err}</div>
        </div>
      )}

      <div className="card">
        {days.length ? (
          days.map((day, i) => (
            <div className="section-link anim-in" style={{ animationDelay: `${i * 30}ms` }} key={day.id}>
              <a href={`/app/rutina/${day.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, gap: 12, minWidth: 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{day.name}</div>
                  <div className="s">{day.exercises.length} ejercicio(s)</div>
                </div>
                <div className="arrow">
                  <i className="fa-solid fa-chevron-right"></i>
                </div>
              </a>
              <button
                className="icon-btn"
                onClick={() => removeDay(day.id, day.name)}
                aria-label={`Borrar día ${day.name}`}
                style={{ marginLeft: 6 }}
              >
                <i className="fa-solid fa-trash"></i>
              </button>
            </div>
          ))
        ) : (
          <div className="list-empty">Agrega tu primer día para empezar</div>
        )}
      </div>

      <div className="card">
        <div className="eyebrow">Nuevo día</div>
        <div className="field">
          <input
            value={newDay}
            onChange={(e) => setNewDay(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDay()}
            placeholder="Ej. Espalda/Bíceps"
          />
        </div>
        <button className="btn btn-primary" onClick={addDay} disabled={busy || !newDay.trim()}>
          <i className="fa-solid fa-plus"></i> Agregar día
        </button>
      </div>
    </>
  )
}
