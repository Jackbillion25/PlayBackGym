import { Hono } from 'hono'
import type { ApiEnv } from './types'
import { withContext, requireAuth } from './middleware'
import { daysRoutes } from './routes/days'
import { exercisesRoutes } from './routes/exercises'
import { sessionsRoutes } from './routes/sessions'
import { profileRoutes } from './routes/profile'

const app = new Hono<ApiEnv>().basePath('/api')

// db + auth por request (para todas las rutas, incluida /auth)
app.use('*', withContext)

// better-auth: registro, login, logout, verify-email, reset, OAuth (Google/GitHub)
app.on(['GET', 'POST'], '/auth/*', (c) => c.var.auth.handler(c.req.raw))

// Rutas de dominio protegidas
const protectedApp = new Hono<ApiEnv>()
  .use('*', requireAuth)
  .route('/', daysRoutes)
  .route('/', exercisesRoutes)
  .route('/', sessionsRoutes)
  .route('/', profileRoutes)

const routes = app.route('/', protectedApp)

// Manejo de errores con shape estándar
app.onError((err, c) => {
  console.error('[api:error]', err)
  return c.json(
    { success: false, error: { code: 'INTERNAL', message: 'Error interno del servidor' } },
    500,
  )
})

app.notFound((c) => c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } }, 404))

export { app }
export type AppType = typeof routes
