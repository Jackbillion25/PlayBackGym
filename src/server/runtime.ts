import { env } from 'cloudflare:workers'
import type { D1Database } from '@cloudflare/workers-types'

// Bindings + secretos del Worker. En Astro v6 / adapter v14 los bindings se
// obtienen de 'cloudflare:workers' (ya no existe Astro.locals.runtime.env).
export type CfEnv = {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  RESEND_API_KEY: string
  RESEND_FROM: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  MICROSOFT_CLIENT_ID: string
  MICROSOFT_CLIENT_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
}

export const cfEnv = env as unknown as CfEnv
