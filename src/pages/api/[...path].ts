import type { APIRoute } from 'astro'
import { app } from '../../server/api'
import { cfEnv } from '../../server/runtime'

export const prerender = false

// Catch-all: delega TODO /api/* a la app Hono, pasando los bindings CF como env.
export const ALL: APIRoute = (ctx) => {
  return app.fetch(ctx.request, cfEnv, ctx.locals.cfContext)
}
