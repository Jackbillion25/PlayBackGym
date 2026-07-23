// Formato es-MX para fechas y pesos.

export function fmtDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function fmtDateLong(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('es-MX', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// Peso legible: sin decimales innecesarios (40, 42.5).
export function fmtWeight(w: number | null, unit = 'kg'): string {
  if (w == null) return '—'
  const n = Number.isInteger(w) ? String(w) : String(Math.round(w * 10) / 10)
  return `${n} ${unit}`
}

// mm:ss a partir de segundos.
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

// Duración legible ("42 min", "1h 12min") — para historial y "la última vez".
export function fmtDuration(totalSeconds: number): string {
  const m = Math.max(0, Math.round(totalSeconds / 60))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}min` : `${h}h`
}
