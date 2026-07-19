import { rowText, type CompareRow, type CompareStatus } from './compare'

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
export function buildWhatsAppText(fb: Feedback): string {
  const lines: string[] = []
  lines.push(`*Bitácora — ${fb.dayName}*`)
  lines.push(fmtDate(fb.finishedAt))
  lines.push('')
  for (const r of fb.rows) {
    lines.push(`${mark(r.status)} ${r.name}: ${rowText(r)}`)
  }
  lines.push('')
  lines.push(`✅ ${fb.completedCount}/${fb.total} ejercicios completados`)
  lines.push('')
  lines.push('_Bitácora — una idea de LUKAMON_')
  return lines.join('\n')
}
