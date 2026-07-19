import { useEffect, useState } from 'react'
import { rpc } from '../../lib/api-client'
import { authClient } from '../../lib/auth-client'

type Profile = { name: string; email: string; phone: string | null }
type ThemePref = 'system' | 'light' | 'dark'

const SOCIALS: { key: 'google' | 'microsoft' | 'github'; label: string; icon: string }[] = [
  { key: 'google', label: 'Google', icon: 'fa-brands fa-google' },
  { key: 'microsoft', label: 'Microsoft', icon: 'fa-brands fa-microsoft' },
  { key: 'github', label: 'GitHub', icon: 'fa-brands fa-github' },
]

export default function ProfileForm({ initial }: { initial: Profile }) {
  const [name, setName] = useState(initial.name)
  const [phone, setPhone] = useState(initial.phone ?? '')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [theme, setTheme] = useState<ThemePref>('system')
  const [accounts, setAccounts] = useState<string[] | null>(null)

  useEffect(() => {
    try {
      const t = localStorage.getItem('bitacora-theme')
      setTheme(t === 'light' || t === 'dark' ? t : 'system')
    } catch {}
    loadAccounts()
  }, [])

  async function loadAccounts() {
    try {
      const res = await authClient.listAccounts()
      const data = (res as { data?: { provider?: string; providerId?: string }[] }).data ?? []
      setAccounts(data.map((a) => a.provider ?? a.providerId ?? '').filter(Boolean))
    } catch {
      setAccounts([])
    }
  }

  async function link(provider: 'google' | 'microsoft' | 'github') {
    setErr(null)
    try {
      await authClient.linkSocial({ provider, callbackURL: '/app/perfil' })
    } catch {
      setErr('No se pudo iniciar la vinculación con ' + provider)
    }
  }

  async function unlink(provider: string) {
    setErr(null)
    if (!confirm(`¿Desvincular tu cuenta de ${provider}?`)) return
    try {
      const res = await authClient.unlinkAccount({ providerId: provider })
      if ((res as { error?: unknown }).error) throw new Error()
      await loadAccounts()
    } catch {
      setErr('No se pudo desvincular. Debes conservar al menos un método de acceso.')
    }
  }

  function applyTheme(t: ThemePref) {
    setTheme(t)
    try {
      if (t === 'system') {
        localStorage.removeItem('bitacora-theme')
        delete document.documentElement.dataset.theme
      } else {
        localStorage.setItem('bitacora-theme', t)
        document.documentElement.dataset.theme = t
      }
    } catch {}
  }

  async function save() {
    setErr(null)
    setBusy(true)
    try {
      const res = await rpc.profile.$patch({ json: { name: name.trim(), phone: phone.trim() || null } })
      const body = (await res.json()) as { success: boolean; error?: { message: string } }
      if (!body.success) throw new Error(body.error?.message ?? 'Error')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    await authClient.signOut()
    window.location.href = '/'
  }

  async function remove() {
    if (!confirm('Esto borra tu cuenta y TODOS tus datos de forma permanente. ¿Continuar?')) return
    if (!confirm('Última confirmación: esta acción no se puede deshacer.')) return
    try {
      await authClient.deleteUser({})
      window.location.href = '/'
    } catch {
      setErr('No se pudo borrar la cuenta.')
    }
  }

  const themes: { key: ThemePref; label: string; icon: string }[] = [
    { key: 'system', label: 'Sistema', icon: 'fa-circle-half-stroke' },
    { key: 'light', label: 'Claro', icon: 'fa-sun' },
    { key: 'dark', label: 'Oscuro', icon: 'fa-moon' },
  ]

  return (
    <>
      <div className="card">
        <div className="eyebrow">Tus datos</div>
        <div className="field">
          <label>Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Correo</label>
          <input value={initial.email} disabled style={{ opacity: 0.6 }} />
        </div>
        <div className="field">
          <label>Teléfono <span className="opcional">(opcional · solo para compartir por WhatsApp)</span></label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+52 55 1234 5678" />
        </div>
        {err && <div style={{ color: 'var(--bad)', fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Guardando…' : saved ? '¡Guardado!' : 'Guardar cambios'}
        </button>
      </div>

      <div className="card">
        <div className="eyebrow">Tema</div>
        <div className="btn-row">
          {themes.map((t) => (
            <button
              key={t.key}
              className={`btn btn-sm ${theme === t.key ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1 }}
              onClick={() => applyTheme(t.key)}
            >
              <i className={`fa-solid ${t.icon}`}></i> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="eyebrow">Cuentas vinculadas</div>
        <p className="hint" style={{ marginBottom: 12 }}>Vincula tus cuentas para entrar con un toque.</p>
        {SOCIALS.map((s) => {
          const linked = accounts?.includes(s.key)
          return (
            <div className="linked-row" key={s.key}>
              <span className="linked-name">
                <i className={s.icon}></i> {s.label}
              </span>
              {accounts === null ? (
                <span className="linked-status">…</span>
              ) : linked ? (
                <button className="btn btn-ghost btn-sm" onClick={() => unlink(s.key)}>
                  Desvincular
                </button>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => link(s.key)}>
                  Vincular
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="eyebrow">Ayuda</div>
        <button className="btn btn-ghost" onClick={() => (window.location.href = '/app?tour=1')}>
          <i className="fa-solid fa-circle-question"></i> Ver tutorial de bienvenida
        </button>
      </div>

      <div className="card">
        <div className="eyebrow">Cuenta</div>
        <button className="btn btn-ghost" onClick={logout} style={{ marginBottom: 10 }}>
          <i className="fa-solid fa-right-from-bracket"></i> Cerrar sesión
        </button>
        <button className="btn btn-danger btn-sm" onClick={remove}>
          <i className="fa-solid fa-trash"></i> Borrar mi cuenta
        </button>
      </div>
    </>
  )
}
