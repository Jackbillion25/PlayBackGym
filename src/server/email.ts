// Envío de correos vía la API REST de Resend (fetch — nunca nodemailer en Workers).

type SendArgs = {
  apiKey: string
  from: string
  to: string
  subject: string
  html: string
}

async function sendEmail({ apiKey, from, to, subject, html }: SendArgs): Promise<void> {
  // En desarrollo, sin API key real, solo logueamos el link para no romper el flujo.
  if (!apiKey || apiKey.startsWith('re_dev')) {
    console.log(`\n[email:dev] To: ${to}\nSubject: ${subject}\n${html}\n`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend error ${res.status}: ${body}`)
  }
}

// ---- Plantillas (tono de marca: dark, dorado) ------------------------------

const BRAND = '#0f7a52'
const BG = '#f6f7f6'
const SURFACE = '#ffffff'
const TEXT = '#16201c'
const TEXT2 = '#566159'

function shell(title: string, bodyHtml: string, cta: { href: string; label: string }): string {
  return `<!doctype html><html><body style="margin:0;background:${BG};font-family:-apple-system,Segoe UI,Inter,Helvetica,sans-serif;color:${TEXT};padding:32px 16px;">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:${SURFACE};border:1px solid #e4e7e5;border-radius:14px;">
    <tr><td style="padding:30px 28px;">
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:22px;">
        <span style="display:inline-block;width:9px;height:22px;border-radius:3px;background:${BRAND};"></span>
        <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${TEXT};">Bitácora</span>
      </div>
      <h1 style="font-size:21px;font-weight:700;margin:0 0 12px;color:${TEXT};">${title}</h1>
      <p style="font-size:15px;line-height:1.6;color:${TEXT2};margin:0 0 26px;">${bodyHtml}</p>
      <a href="${cta.href}" style="display:inline-block;background:${BRAND};color:#ffffff;font-weight:600;text-decoration:none;padding:13px 22px;border-radius:10px;font-size:15px;">${cta.label}</a>
      <p style="font-size:13px;color:#8a938d;margin:26px 0 0;">Si el botón no funciona, copia este enlace:<br><span style="color:${TEXT2};word-break:break-all;">${cta.href}</span></p>
      <hr style="border:none;border-top:1px solid #e4e7e5;margin:24px 0 14px;">
      <p style="font-size:12px;color:#8a938d;margin:0;">Una idea de <strong style="color:${TEXT2};">LUKAMON</strong></p>
    </td></tr>
  </table>
</body></html>`
}

type Env = { RESEND_API_KEY: string; RESEND_FROM: string }

export async function sendVerificationEmail(
  env: Env,
  args: { to: string; url: string; name?: string },
): Promise<void> {
  const html = shell(
    `Verifica tu correo`,
    `Hola${args.name ? ` ${args.name}` : ''}, confirma tu correo para empezar a registrar tus entrenamientos en Bitácora.`,
    { href: args.url, label: 'Verificar correo' },
  )
  await sendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM,
    to: args.to,
    subject: 'Verifica tu correo — Bitácora',
    html,
  })
}

export async function sendResetPasswordEmail(
  env: Env,
  args: { to: string; url: string; name?: string },
): Promise<void> {
  const html = shell(
    `Restablece tu contraseña`,
    `Recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, ignora este correo.`,
    { href: args.url, label: 'Cambiar contraseña' },
  )
  await sendEmail({
    apiKey: env.RESEND_API_KEY,
    from: env.RESEND_FROM,
    to: args.to,
    subject: 'Restablece tu contraseña — Bitácora',
    html,
  })
}
