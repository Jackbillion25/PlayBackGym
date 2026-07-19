// ★ El corazón de la app. Replica exactamente setStats()/finishSession() del
// prototipo: mejora = top mayor, o top igual y volumen mayor. Funciones puras.
// NO tocar sin actualizar tests/compare.test.ts.

export type SetInput = { reps: number | null; weight: number | null }
export type Stats = { top: number; volume: number }
export type CompareStatus = 'up' | 'down' | 'same' | 'skip' | 'first'

export type CompareRow = {
  name: string
  status: CompareStatus
  prevTop: number | null
  curTop: number | null
  prevVolume: number | null
  curVolume: number | null
}

export function setStats(sets: SetInput[]): Stats {
  let top = 0
  let volume = 0
  for (const s of sets) {
    const w = Number(s.weight) || 0
    const r = Number(s.reps) || 0
    if (w > top) top = w
    volume += w * r
  }
  return { top, volume: Math.round(volume * 10) / 10 }
}

export function compareEntry(args: {
  name: string
  completed: boolean
  curSets: SetInput[]
  prevSets: SetInput[] | null
}): CompareRow {
  const { name, completed, curSets, prevSets } = args
  if (!completed) {
    return { name, status: 'skip', prevTop: null, curTop: null, prevVolume: null, curVolume: null }
  }
  const cur = setStats(curSets)
  if (!prevSets) {
    return { name, status: 'first', prevTop: null, curTop: cur.top, prevVolume: null, curVolume: cur.volume }
  }
  const prev = setStats(prevSets)
  let status: CompareStatus = 'same'
  if (cur.top > prev.top || (cur.top === prev.top && cur.volume > prev.volume)) status = 'up'
  else if (cur.top < prev.top || (cur.top === prev.top && cur.volume < prev.volume)) status = 'down'
  return {
    name,
    status,
    prevTop: prev.top,
    curTop: cur.top,
    prevVolume: prev.volume,
    curVolume: cur.volume,
  }
}

const num = (n: number | null): string => (n == null || n === 0 ? '—' : String(n))

export function statusArrow(status: CompareStatus): string {
  return status === 'up' ? '▲' : status === 'down' ? '▼' : status === 'skip' ? '⚠' : status === 'first' ? '★' : '='
}

// Texto legible para el ticket de feedback (sin jerga: "Peso máx" y "Total levantado").
// "Total levantado" = suma de peso×repeticiones de todas las series.
export function rowText(row: CompareRow): string {
  if (row.status === 'skip') return 'Omitido'
  if (row.status === 'first') {
    return `Primer registro · Peso máx ${num(row.curTop)} · Total levantado ${row.curVolume ?? 0}`
  }
  return `${statusArrow(row.status)} Peso máx ${num(row.prevTop)}→${num(row.curTop)} · Total levantado ${row.prevVolume ?? 0}→${row.curVolume ?? 0}`
}
