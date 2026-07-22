import { formatSetLine, verdictText, type CompareRow, type CompareStatus } from './compare'

export type Feedback = {
  dayName: string
  finishedAt: number // epoch ms
  rows: CompareRow[]
  completedCount: number
  total: number
}

function fmtDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function mark(status: CompareStatus): string {
  return status === 'up' ? '⬆️' : status === 'down' ? '⬇️' : status === 'skip' ? '⚠️' : '➖'
}

// Genera el resumen compartible por WhatsApp (con crédito LUKAMON al cierre).
// Detalle COMPLETO serie por serie, nunca comprimido.
export function buildWhatsAppText(fb: Feedback): string {
  const lines: string[] = []
  lines.push(`*Play Back Gym — ${fb.dayName}*`)
  lines.push(fmtDate(fb.finishedAt))
  lines.push('')
  for (const r of fb.rows) {
    lines.push(`${mark(r.status)} *${r.name}* — ${verdictText(r.status)}`)
    if (r.status !== 'skip') {
      if (!r.sets.length) lines.push('Sin series registradas')
      else for (const set of r.sets) lines.push(formatSetLine(set))
    }
    lines.push('')
  }
  lines.push(`✅ ${fb.completedCount}/${fb.total} ejercicios completados`)
  lines.push('')
  lines.push('_Play Back Gym — una idea de LUKAMON_')
  return lines.join('\n')
}
