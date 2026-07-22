// ★ El corazón de la app. Mejora = top mayor, o top igual y volumen mayor.
// El volumen se usa SOLO como criterio interno de desempate (no se muestra:
// "total levantado" es una multiplicación que confunde). La retroalimentación
// visible se expresa en peso, repeticiones y series. Funciones puras.
// NO tocar sin actualizar tests/compare.test.ts.

export type SetInput = { reps: number | null; weight: number | null }
export type Stats = {
  top: number // peso máximo levantado
  totalReps: number // suma de repeticiones
  setCount: number // series con datos reales
  volume: number // Σ peso×reps — solo desempate interno, nunca se muestra
}
export type CompareStatus = 'up' | 'down' | 'same' | 'skip' | 'first'

export type CompareRow = {
  name: string
  status: CompareStatus
  prev: Stats | null
  cur: Stats | null
}

export function setStats(sets: SetInput[]): Stats {
  let top = 0
  let totalReps = 0
  let volume = 0
  let setCount = 0
  for (const s of sets) {
    const w = Number(s.weight) || 0
    const r = Number(s.reps) || 0
    if (w > top) top = w
    totalReps += r
    volume += w * r
    if (w > 0 || r > 0) setCount++
  }
  return { top, totalReps, setCount, volume: Math.round(volume * 10) / 10 }
}

export function compareEntry(args: {
  name: string
  completed: boolean
  curSets: SetInput[]
  prevSets: SetInput[] | null
}): CompareRow {
  const { name, completed, curSets, prevSets } = args
  if (!completed) return { name, status: 'skip', prev: null, cur: null }
  const cur = setStats(curSets)
  if (!prevSets) return { name, status: 'first', prev: null, cur }
  const prev = setStats(prevSets)
  let status: CompareStatus = 'same'
  if (cur.top > prev.top || (cur.top === prev.top && cur.volume > prev.volume)) status = 'up'
  else if (cur.top < prev.top || (cur.top === prev.top && cur.volume < prev.volume)) status = 'down'
  return { name, status, prev, cur }
}

export function statusArrow(status: CompareStatus): string {
  return status === 'up' ? '▲' : status === 'down' ? '▼' : status === 'skip' ? '⚠' : status === 'first' ? '★' : '='
}

const n = (v: number): string => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10))
const series = (k: number): string => `${k} serie${k === 1 ? '' : 's'}`

// Texto legible del ticket: dice si mejoraste / bajaste / quedó igual y EN QUÉ
// (peso, repeticiones o series). Nunca muestra "total levantado".
export function rowText(row: CompareRow): string {
  if (row.status === 'skip') return 'No lo registraste'
  const c = row.cur!
  if (row.status === 'first') {
    return `Primer registro · ${series(c.setCount)} · ${c.totalReps} reps · ${n(c.top)} máx`
  }
  const p = row.prev!
  const bits: string[] = []
  if (c.top !== p.top) bits.push(`peso máx ${n(p.top)}→${n(c.top)}`)
  if (c.totalReps !== p.totalReps) bits.push(`reps ${p.totalReps}→${c.totalReps}`)
  if (c.setCount !== p.setCount) bits.push(`series ${p.setCount}→${c.setCount}`)
  const detail = bits.length ? bits.join(' · ') : `sin cambios · ${n(c.top)} máx · ${c.totalReps} reps`
  const verdict = row.status === 'up' ? 'Mejoraste' : row.status === 'down' ? 'Bajaste' : 'Igual'
  return `${verdict} · ${detail}`
}
