// ★ El corazón de la app. Mejora = top mayor, o top igual y volumen mayor.
// El volumen se usa SOLO como criterio interno de desempate (no se muestra:
// "total levantado" es una multiplicación que confunde). La retroalimentación
// visible es SIEMPRE serie por serie, completa, sin comprimir ("de tal a tal"),
// tanto en la UI como en el resumen de WhatsApp. Funciones puras.
// NO tocar sin actualizar tests/compare.test.ts.

export type SetInput = { reps: number | null; weight: number | null }
export type Stats = {
  top: number // peso máximo levantado
  totalReps: number // suma de repeticiones
  setCount: number // series con datos reales
  volume: number // Σ peso×reps — solo desempate interno, nunca se muestra
}
export type CompareStatus = 'up' | 'down' | 'same' | 'skip' | 'first'
export type FieldStatus = 'up' | 'down' | 'same' | 'new' | 'removed'

// Comparación serie por serie (por posición) contra la sesión anterior.
export type SetLine = {
  index: number
  curReps: number | null
  curWeight: number | null
  prevReps: number | null
  prevWeight: number | null
  repsStatus: FieldStatus
  weightStatus: FieldStatus
}

export type CompareRow = {
  name: string
  status: CompareStatus
  prev: Stats | null
  cur: Stats | null
  sets: SetLine[]
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

// Solo las series con datos reales, en el orden en que se registraron.
function realSets(sets: SetInput[]): { reps: number; weight: number }[] {
  return sets
    .map((s) => ({ reps: Number(s.reps) || 0, weight: Number(s.weight) || 0 }))
    .filter((s) => s.reps > 0 || s.weight > 0)
}

function fieldStatus(cur: number, prev: number): FieldStatus {
  return cur > prev ? 'up' : cur < prev ? 'down' : 'same'
}

export function buildSetLines(curSets: SetInput[], prevSets: SetInput[] | null): SetLine[] {
  const cur = realSets(curSets)
  const prev = prevSets ? realSets(prevSets) : []
  const len = Math.max(cur.length, prev.length)
  const lines: SetLine[] = []
  for (let i = 0; i < len; i++) {
    const c = cur[i]
    const p = prev[i]
    lines.push({
      index: i,
      curReps: c ? c.reps : null,
      curWeight: c ? c.weight : null,
      prevReps: p ? p.reps : null,
      prevWeight: p ? p.weight : null,
      repsStatus: !c ? 'removed' : !p ? 'new' : fieldStatus(c.reps, p.reps),
      weightStatus: !c ? 'removed' : !p ? 'new' : fieldStatus(c.weight, p.weight),
    })
  }
  return lines
}

export function compareEntry(args: {
  name: string
  completed: boolean
  curSets: SetInput[]
  prevSets: SetInput[] | null
}): CompareRow {
  const { name, completed, curSets, prevSets } = args
  if (!completed) return { name, status: 'skip', prev: null, cur: null, sets: [] }
  const cur = setStats(curSets)
  const sets = buildSetLines(curSets, prevSets)
  if (!prevSets) return { name, status: 'first', prev: null, cur, sets }
  const prev = setStats(prevSets)
  let status: CompareStatus = 'same'
  if (cur.top > prev.top || (cur.top === prev.top && cur.volume > prev.volume)) status = 'up'
  else if (cur.top < prev.top || (cur.top === prev.top && cur.volume < prev.volume)) status = 'down'
  return { name, status, prev, cur, sets }
}

export function statusArrow(status: CompareStatus): string {
  return status === 'up' ? '▲' : status === 'down' ? '▼' : status === 'skip' ? '⚠' : status === 'first' ? '★' : '='
}

export function verdictText(status: CompareStatus): string {
  return status === 'up'
    ? 'Mejoraste'
    : status === 'down'
      ? 'Bajaste'
      : status === 'same'
        ? 'Igual'
        : status === 'first'
          ? 'Primer registro'
          : 'No lo registraste'
}

export const n = (v: number): string => (Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10))

// Texto plano (sin color) de UNA serie, completo, sin comprimir. Usado en el
// resumen de WhatsApp y como fallback de accesibilidad.
export function formatSetLine(line: SetLine): string {
  const serie = `Serie ${line.index + 1}`
  if (line.prevReps === null) return `${serie}: ${line.curReps} reps, ${n(line.curWeight!)} kg`
  if (line.curReps === null) return `${serie}: ya no la registraste (antes ${line.prevReps} reps, ${n(line.prevWeight!)} kg)`
  return `${serie}: de ${line.prevReps} reps ${n(line.prevWeight!)} kg a ${line.curReps} reps ${n(line.curWeight!)} kg`
}

// Texto plano completo de un ejercicio: veredicto + cada serie, sin comprimir.
export function rowText(row: CompareRow): string {
  if (row.status === 'skip') return verdictText(row.status)
  if (!row.sets.length) return `${verdictText(row.status)} · sin series registradas`
  return [verdictText(row.status), ...row.sets.map(formatSetLine)].join('\n')
}
