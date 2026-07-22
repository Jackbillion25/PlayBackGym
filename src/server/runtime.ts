import { env } from 'cloudflare:workers'
import type { D1Database } from '@cloudflare/workers-types'
import type { EmailBinding } from './email'

// Bindings + secretos del Worker. En Astro v6 / adapter v14 los bindings se
// obtienen de 'cloudflare:workers' (ya no existe Astro.locals.runtime.env).
export type CfEnv = {
  DB: D1Database
  EMAIL?: EmailBinding // Cloudflare Email Sending (binding send_email)
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  EMAIL_FROM: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  MICROSOFT_CLIENT_ID: string
  MICROSOFT_CLIENT_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  STRIPE_PUBLISHABLE_KEY: string
}

export const cfEnv = env as unknown as CfEnv
