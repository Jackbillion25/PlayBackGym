// Envío de correos vía Cloudflare Email Sending (binding `EMAIL` del Worker).
// Sin API keys: el binding envía desde un dominio onboarded en Email Sending.
// (Antes usábamos Resend por fetch; ahora todo es 100% Cloudflare.)

// Forma mínima del binding send_email (Workers). Evita `any` (regla: 0 any).
export type EmailAddress = string | { email: string; name?: string }
export type EmailMessage = {
  to: EmailAddress
  from: EmailAddress
  replyTo?: EmailAddress
  subject: string
  html: string
  text: string
}
export type EmailBinding = {
  send(message: EmailMessage): Promise<{ messageId: string }>
}

export type EmailEnv = {
  EMAIL?: EmailBinding
  EMAIL_FROM: string // ej. "no-reply@playbackgym.fitness"
}

const FROM_NAME = 'Play Back Gym'

async function sendEmail(
  env: EmailEnv,
  args: { to: string; subject: string; html: string; text: string },
): Promise<void> {
  // En dev (o si el binding no está disponible localmente) solo logueamos, así
  // el flujo de verificación/reset no se rompe sin tener que enviar de verdad.
  if (!env.EMAIL) {
    console.log(`\n[email:dev] Para: ${args.to}\nAsunto: ${args.subject}\n${args.text}\n`)
    return
  }
  await env.EMAIL.send({
    to: args.to,
    from: { email: env.EMAIL_FROM, name: FROM_NAME },
    subject: args.subject,
    html: args.html,
    text: args.text,
  })
}

// ---- Plantillas (marca: claro, esmeralda) ----------------------------------

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
        <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:${TEXT};">Play Back Gym</span>
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

export async function sendVerificationEmail(
  env: EmailEnv,
  args: { to: string; url: string; name?: string },
): Promise<void> {
  const intro = `Hola${args.name ? ` ${args.name}` : ''}, confirma tu correo para empezar a registrar tus entrenamientos en Play Back Gym.`
  await sendEmail(env, {
    to: args.to,
    subject: 'Verifica tu correo — Play Back Gym',
    html: shell('Verifica tu correo', intro, { href: args.url, label: 'Verificar correo' }),
    text: `${intro}\n\nVerifica tu correo aquí:\n${args.url}\n\nPlay Back Gym — una idea de LUKAMON`,
  })
}

export async function sendResetPasswordEmail(
  env: EmailEnv,
  args: { to: string; url: string; name?: string },
): Promise<void> {
  const intro = `Recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, ignora este correo.`
  await sendEmail(env, {
    to: args.to,
    subject: 'Restablece tu contraseña — Play Back Gym',
    html: shell('Restablece tu contraseña', intro, { href: args.url, label: 'Cambiar contraseña' }),
    text: `${intro}\n\nCambia tu contraseña aquí:\n${args.url}\n\nPlay Back Gym — una idea de LUKAMON`,
  })
}
