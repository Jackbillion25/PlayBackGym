import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type Step = { selector: string | null; icon: string; title: string; body: string }

const STEPS: Step[] = [
  {
    selector: null,
    icon: 'fa-hand-sparkles',
    title: '¡Bienvenido a Play Back Gym!',
    body: 'Registra cada serie, mide tus descansos y compara tu progreso. Te muestro lo básico en 3 pasos.',
  },
  {
    selector: '[data-tour="entrenar"]',
    icon: 'fa-dumbbell',
    title: 'Entrena',
    body: 'Toca un día para iniciar tu sesión. Registras cada serie con reps y peso, con cronómetro y timer de descanso.',
  },
  {
    selector: '[data-tour="rutina"]',
    icon: 'fa-list-check',
    title: 'Arma tu rutina',
    body: 'Crea tus días (Empuje, Piernas…) y sus ejercicios. Son tu punto de partida; lo real se registra al entrenar.',
  },
  {
    selector: '[data-tour="perfil"]',
    icon: 'fa-user',
    title: 'Tu perfil',
    body: 'Vincula Google, Microsoft o GitHub y añade tu teléfono para recibir tu resumen por WhatsApp con un toque.',
  },
]

const FLAG = 'bitacora-welcome-seen'

export default function WelcomeTutorial() {
  const [step, setStep] = useState(-1)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [cardPos, setCardPos] = useState<{ top: number; left: number }>({ top: -999, left: -999 })
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let run = false
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('tour') === '1') run = true
      else if (!localStorage.getItem(FLAG)) run = true
    } catch {}
    if (run) setStep(0)
  }, [])

  // Medir el elemento objetivo del paso actual
  useLayoutEffect(() => {
    if (step < 0) return
    const s = STEPS[step]
    if (!s.selector) {
      setRect(null)
      return
    }
    const el = document.querySelector(s.selector) as HTMLElement | null
    if (!el) {
      setRect(null)
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const measure = () => setRect(el.getBoundingClientRect())
    measure()
    const t = window.setTimeout(measure, 340)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step])

  // Posicionar la tarjeta relativa al objetivo (o centrada)
  useLayoutEffect(() => {
    if (step < 0) return
    const card = cardRef.current
    const ch = card?.offsetHeight ?? 200
    const cw = card?.offsetWidth ?? 320
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (!rect) {
      setCardPos({ top: Math.max(16, (vh - ch) / 2), left: Math.max(12, (vw - cw) / 2) })
      return
    }
    const pad = 8
    let top = rect.bottom + pad + 12
    if (top + ch > vh - 12) top = Math.max(12, rect.top - pad - 12 - ch)
    let left = rect.left + rect.width / 2 - cw / 2
    left = Math.min(Math.max(12, left), vw - cw - 12)
    setCardPos({ top, left })
  }, [rect, step])

  function finish() {
    try {
      localStorage.setItem(FLAG, '1')
    } catch {}
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.has('tour')) {
        url.searchParams.delete('tour')
        window.history.replaceState({}, '', url.pathname + url.search)
      }
    } catch {}
    setStep(-1)
  }
  function next() {
    if (step >= STEPS.length - 1) finish()
    else setStep(step + 1)
  }

  if (step < 0) return null
  const s = STEPS[step]

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Tutorial de bienvenida">
      {!rect && <div className="tour-scrim" />}
      {rect && (
        <div
          className="tour-spotlight pulse"
          style={{ top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16 }}
        />
      )}
      <div className="tour-card" ref={cardRef} style={{ top: cardPos.top, left: cardPos.left }}>
        <div className="tour-counter">Paso {step + 1} de {STEPS.length}</div>
        <h4>
          <span className="tour-ic">
            <i className={`fa-solid ${s.icon}`}></i>
          </span>
          {s.title}
        </h4>
        <p>{s.body}</p>
        <div className="tour-actions">
          {step < STEPS.length - 1 && (
            <button className="tour-skip" onClick={finish}>
              Saltar
            </button>
          )}
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={next}>
            {step >= STEPS.length - 1 ? '¡Listo!' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  )
}
