import type { D1Database } from '@cloudflare/workers-types'
import type { Db } from '../db'
import type { Auth, User, AuthEnv } from '../auth'

export type ApiBindings = AuthEnv & {
  DB: D1Database
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
