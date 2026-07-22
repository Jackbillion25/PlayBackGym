import { useState } from 'react'
import { verdictText, n, type CompareRow, type SetLine } from '../../server/api/logic/compare'
import { fmtDate } from '../../lib/format'

export type FeedbackData = {
  dayName: string
  finishedAt: number
  rows: CompareRow[]
  completedCount: number
  total: number
  whatsappText: string
}

function SetLineView({ line }: { line: SetLine }) {
  if (line.prevReps === null) {
    return (
      <div className="set-line">
        <span className="set-label">Serie {line.index + 1}</span>
        <span className="set-values">
          {line.curReps} reps · {n(line.curWeight!)} kg
        </span>
      </div>
    )
  }
  if (line.curReps === null) {
    return (
      <div className="set-line">
        <span className="set-label">Serie {line.index + 1}</span>
        <span className="set-values set-field-removed">
          ya no la registraste (antes {line.prevReps} reps · {n(line.prevWeight!)} kg)
        </span>
      </div>
    )
  }
  return (
    <div className="set-line">
      <span className="set-label">Serie {line.index + 1}</span>
      <span className="set-values">
        <span className={`set-field ${line.repsStatus}`}>
          {line.prevReps}→{line.curReps} reps
        </span>
        {' · '}
        <span className={`set-field ${line.weightStatus}`}>
          {n(line.prevWeight!)}→{n(line.curWeight!)} kg
        </span>
      </span>
    </div>
  )
}

export default function SessionFeedback({ data, phone }: { data: FeedbackData; phone?: string | null }) {
  const [copied, setCopied] = useState(false)
  const phoneDigits = (phone ?? '').replace(/\D/g, '')
  const hasPhone = phoneDigits.length >= 10

  function sendWhatsApp() {
    const url = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(data.whatsappText)}`
    window.open(url, '_blank', 'noopener')
  }

  async function copyWhatsApp() {
    try {
      await navigator.clipboard.writeText(data.whatsappText)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = data.whatsappText
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <>
      <div className="card anim-in" style={{ marginBottom: 8, textAlign: 'center' }}>
        <div className="tutorial-icon"><i className="fa-solid fa-circle-check" style={{ color: 'var(--good)' }}></i></div>
        <div className="eyebrow">{data.dayName} · {fmtDate(data.finishedAt)}</div>
        <h1 className="step-title">¡Sesión registrada!</h1>
      </div>

      <div className="card ticket anim-in" style={{ animationDelay: '60ms' }}>
        <div className="eyebrow">Comparado con tu sesión anterior</div>
        {data.rows.map((r, i) => (
          <div className="compare-block anim-in" style={{ animationDelay: `${100 + Math.min(i, 8) * 40}ms` }} key={i}>
            <div className="compare-block-header">
              <span className="compare-name">{r.name}</span>
              <span className={`compare-badge ${r.status}`}>{verdictText(r.status)}</span>
            </div>
            {r.status !== 'skip' && (
              <div className="set-lines">
                {r.sets.length ? (
                  r.sets.map((line) => <SetLineView line={line} key={line.index} />)
                ) : (
                  <div className="set-line set-line-empty">Sin series registradas</div>
                )}
              </div>
            )}
          </div>
        ))}
        <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text2)' }}>
          <i className="fa-solid fa-check" style={{ color: 'var(--good)' }}></i> {data.completedCount}/{data.total} ejercicios completados
        </div>
      </div>

      <div className="card anim-in" style={{ animationDelay: '160ms' }}>
        <div className="eyebrow">Compartir</div>
        {hasPhone ? (
          <button className="btn btn-primary" onClick={sendWhatsApp}>
            <i className="fa-brands fa-whatsapp"></i> Enviármelo por WhatsApp
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={copyWhatsApp}>
            <i className="fa-brands fa-whatsapp"></i> {copied ? '¡Copiado!' : 'Copiar para WhatsApp'}
          </button>
        )}
      </div>

      <a href="/app" className="btn btn-primary">Volver al panel</a>
      <a href="/app/historial" className="btn btn-ghost">Ver historial</a>
    </>
  )
}
