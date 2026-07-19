import { defineMiddleware } from 'astro:middleware'
import { createDb } from './server/db'
import { createAuth } from './server/auth'
import { cfEnv } from './server/runtime'

export const onRequest = defineMiddleware(async (context, next) => {
  const path = context.url.pathname

  // /api/** lo maneja Hono (su propio requireAuth); no dupliques getSession aquí.
  if (path.startsWith('/api')) return next()

  const db = createDb(cfEnv.DB)
  const auth = createAuth(db, cfEnv)
  const session = await auth.api.getSession({ headers: context.request.headers })

  context.locals.user = session?.user ?? null
  context.locals.session = session?.session ?? null

  // Proteger /app/**: sin sesión → login
  if (path.startsWith('/app') && !session?.user) {
    return context.redirect('/login')
  }

  return next()
})
