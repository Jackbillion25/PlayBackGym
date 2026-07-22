import type { D1Database } from '@cloudflare/workers-types'
import type { Db } from '../db'
import type { Auth, User, AuthEnv } from '../auth'

export type ApiBindings = AuthEnv & {
  DB: D1Database
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
}

export type ApiVariables = {
  db: Db
  auth: Auth
  user: User
}

export type ApiEnv = {
  Bindings: ApiBindings
  Variables: ApiVariables
}
