import { useState, type FormEvent } from 'react'
import { authClient, signInWith } from '../../lib/auth-client'

type Mode = 'login' | 'register' | 'forgot' | 'reset'

export default function AuthForms({ mode, token }: { mode: Mode; token?: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')

  async function oauth(provider: 'google' | 'microsoft' | 'github') {
    setError(null)
    try {
      await signInWith(provider, '/app')
    } catch {
      setError('No se pudo iniciar con ' + provider)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await authClient.signIn.email({ email, password, callbackURL: '/app' })
        if (error) throw new Error(error.message || 'Correo o contraseña incorrectos')
        window.location.href = '/app'
      } else if (mode === 'register') {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name,
          callbackURL: '/app',
          // campo adicional opcional — solo para compartir por WhatsApp
          phone: phone.trim() || undefined,
        } as { email: string; password: string; name: string; callbackURL: string; phone?: string })
        if (error) throw new Error(error.message || 'No se pudo crear la cuenta')
        setNotice('¡Cuenta creada! Te enviamos un correo para verificar tu cuenta. Revísalo para entrar.')
      } else if (mode === 'forgot') {
        const { error } = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })
        if (error) throw new Error(error.message)
        setNotice('Si el correo existe, te enviamos un enlace para restablecer tu contraseña.')
      } else if (mode === 'reset') {
        if (!token) throw new Error('Enlace inválido o expirado.')
        const { error } = await authClient.resetPassword({ newPassword: password, token })
        if (error) throw new Error(error.message)
        setNotice('Contraseña actualizada. Ya puedes iniciar sesión.')
        setTimeout(() => (window.location.href = '/login'), 1500)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo salió mal')
    } finally {
      setLoading(false)
    }
  }

  const titles: Record<Mode, string> = {
    login: 'Inicia sesión',
    register: 'Crea tu cuenta',
    forgot: '¿Olvidaste tu contraseña?',
    reset: 'Nueva contraseña',
  }
  const eyebrows: Record<Mode, string> = {
    login: 'Bienvenido de vuelta',
    register: 'Empieza tu bitácora',
    forgot: 'Recuperación',
    reset: 'Restablecer',
  }

  return (
    <div className="card">
      <div className="eyebrow">{eyebrows[mode]}</div>
      <h1 className="step-title">{titles[mode]}</h1>

      {(mode === 'login' || mode === 'register') && (
        <>
          <div className="oauth-stack">
            <button type="button" className="btn btn-oauth" onClick={() => oauth('google')}>
              <i className="fa-brands fa-google"></i> Continuar con Google
            </button>
            <button type="button" className="btn btn-oauth" onClick={() => oauth('microsoft')}>
              <i className="fa-brands fa-microsoft"></i> Continuar con Microsoft
            </button>
            <button type="button" className="btn btn-oauth" onClick={() => oauth('github')}>
              <i className="fa-brands fa-github"></i> Continuar con GitHub
            </button>
          </div>
          <div className="divider"><span>o con tu correo</span></div>
        </>
      )}

      <form onSubmit={onSubmit}>
        {mode === 'register' && (
          <div className="field">
            <label>Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" required />
          </div>
        )}

        {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
          <div className="field">
            <label>Correo</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" required />
          </div>
        )}

        {(mode === 'login' || mode === 'register' || mode === 'reset') && (
          <div className="field">
            <label>{mode === 'reset' ? 'Nueva contraseña' : 'Contraseña'}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
            />
          </div>
        )}

        {mode === 'register' && (
          <div className="field">
            <label>
              Teléfono <span className="opcional">(opcional · para recibir tu resumen por WhatsApp)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+52 55 1234 5678"
              autoComplete="tel"
            />
          </div>
        )}

        {error && <div className="form-error">{error}</div>}
        {notice && <div className="form-notice">{notice}</div>}

        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? 'Un momento…' : titles[mode]}
        </button>
      </form>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
        {mode === 'login' && (
          <>
            <a href="/olvide-password" style={{ color: 'var(--text2)' }}>
              ¿Olvidaste tu contraseña?
            </a>
            <span style={{ color: 'var(--text2)' }}>
              ¿No tienes cuenta?{' '}
              <a href="/registro" style={{ color: 'var(--accent)' }}>
                Regístrate
              </a>
            </span>
          </>
        )}
        {mode === 'register' && (
          <span style={{ color: 'var(--text2)' }}>
            ¿Ya tienes cuenta?{' '}
            <a href="/login" style={{ color: 'var(--accent)' }}>
              Inicia sesión
            </a>
          </span>
        )}
        {(mode === 'forgot' || mode === 'reset') && (
          <a href="/login" style={{ color: 'var(--accent)' }}>
            Volver a iniciar sesión
          </a>
        )}
      </div>
    </div>
  )
}
