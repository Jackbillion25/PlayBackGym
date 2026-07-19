import { createMiddleware } from 'hono/factory'
import type { ApiEnv } from './types'

// Inyecta db + auth por request (nunca estado global en Workers).
export const withContext = createMiddleware<ApiEnv>(async (c, next) => {
  const { createDb } = await import('../db')
  const { createAuth } = await import('../auth')
  const db = createDb(c.env.DB)
  c.set('db', db)
  c.set('auth', createAuth(db, c.env))
  await next()
})

// Exige sesión válida; si no, 401 con el shape estándar.
export const requireAuth = createMiddleware<ApiEnv>(async (c, next) => {
  const session = await c.var.auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user) {
    return c.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'No autenticado' } },
      401,
    )
  }
  c.set('user', session.user)
  await next()
})
