import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import type { ApiEnv } from '../types'
import { user } from '../../db/schema'

const profilePatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
})

export const profileRoutes = new Hono<ApiEnv>()
  .get('/profile', async (c) => {
    const u = c.var.user
    return c.json({
      success: true,
      data: { id: u.id, name: u.name, email: u.email, phone: u.phone ?? null },
    } as const)
  })

  .patch('/profile', zValidator('json', profilePatchSchema), async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const patch = c.req.valid('json')
    const res = await db
      .update(user)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning({ id: user.id, name: user.name, email: user.email, phone: user.phone })
    return c.json({ success: true, data: res[0] } as const)
  })
