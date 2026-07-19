import { useState } from 'react'
import { rowText, type CompareRow } from '../../server/api/logic/compare'
import { fmtDate } from '../../lib/format'

export type FeedbackData = {
  dayName: string
  finishedAt: number
  rows: CompareRow[]
  completedCount: number
  total: number
  whatsappText: string
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
      <div className="card" style={{ marginBottom: 8, textAlign: 'center' }}>
        <div className="tutorial-icon"><i className="fa-solid fa-circle-check" style={{ color: 'var(--good)' }}></i></div>
        <div className="eyebrow">{data.dayName} · {fmtDate(data.finishedAt)}</div>
        <h1 className="step-title">¡Sesión registrada!</h1>
      </div>

      <div className="card ticket">
        <div className="eyebrow">Comparado con tu sesión anterior</div>
        {data.rows.map((r, i) => (
          <div className="compare-row" key={i}>
            <div className="compare-name">{r.name}</div>
            <div className={`compare-status ${r.status}`}>{rowText(r)}</div>
          </div>
        ))}
        <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text2)' }}>
          <i className="fa-solid fa-check" style={{ color: 'var(--good)' }}></i> {data.completedCount}/{data.total} ejercicios completados
        </div>
      </div>

      <div className="card">
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
