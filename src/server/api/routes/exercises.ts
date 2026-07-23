import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, eq, asc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { ApiEnv } from '../types'
import { exercise, exerciseSet, sessionEntry, sessionSet, workoutSession } from '../../db/schema'
import { setStats } from '../logic/compare'

const exerciseSetSchema = z.object({
  targetReps: z.number().int().min(1).max(100).nullable(),
  targetWeight: z.number().min(0).max(1000).nullable(),
})
const exercisePatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  sets: z.array(exerciseSetSchema).min(1).max(20).optional(),
  unit: z.enum(['kg', 'lb']).optional(),
  bench: z.string().trim().max(60).nullable().optional(),
  pulley: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  position: z.number().int().min(0).optional(),
})

export const exercisesRoutes = new Hono<ApiEnv>()
  .patch('/exercises/:id', zValidator('json', exercisePatchSchema), async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const id = c.req.param('id')
    const { sets, ...patch } = c.req.valid('json')

    const owner = await db
      .select({ id: exercise.id })
      .from(exercise)
      .where(and(eq(exercise.id, id), eq(exercise.userId, userId)))
      .limit(1)
    if (!owner.length) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Ejercicio no encontrado' } } as const, 404)

    const statements: any[] = []
    if (Object.keys(patch).length) {
      statements.push(db.update(exercise).set(patch).where(eq(exercise.id, id)))
    }
    if (sets) {
      statements.push(db.delete(exerciseSet).where(eq(exerciseSet.exerciseId, id)))
      sets.forEach((s, i) => {
        statements.push(
          db.insert(exerciseSet).values({
            id: nanoid(),
            exerciseId: id,
            setIndex: i,
            targetReps: s.targetReps,
            targetWeight: s.targetWeight,
          }),
        )
      })
    }
    if (statements.length) await db.batch(statements as [any, ...any[]])

    const [updated] = await db.select().from(exercise).where(eq(exercise.id, id)).limit(1)
    const setRows = await db
      .select()
      .from(exerciseSet)
      .where(eq(exerciseSet.exerciseId, id))
      .orderBy(asc(exerciseSet.setIndex))
    return c.json({ success: true, data: { ...updated, sets: setRows } } as const)
  })

  .delete('/exercises/:id', async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const id = c.req.param('id')
    const res = await db
      .delete(exercise)
      .where(and(eq(exercise.id, id), eq(exercise.userId, userId)))
      .returning({ id: exercise.id })
    if (!res.length) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Ejercicio no encontrado' } } as const, 404)
    return c.json({ success: true, data: { id } } as const)
  })

  // Serie histórica (top weight y volumen por sesión) — para gráficas futuras
  .get('/exercises/:id/progress', async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const id = c.req.param('id')

    const entries = await db
      .select({
        entryId: sessionEntry.id,
        finishedAt: workoutSession.finishedAt,
      })
      .from(sessionEntry)
      .innerJoin(workoutSession, eq(sessionEntry.sessionId, workoutSession.id))
      .where(and(eq(sessionEntry.exerciseId, id), eq(workoutSession.userId, userId)))
      .orderBy(asc(workoutSession.finishedAt))

    const points = []
    for (const en of entries) {
      const sets = await db
        .select({ reps: sessionSet.reps, weight: sessionSet.weight })
        .from(sessionSet)
        .where(eq(sessionSet.entryId, en.entryId))
      const stats = setStats(sets)
      points.push({ finishedAt: en.finishedAt.getTime(), top: stats.top, volume: stats.volume })
    }
    return c.json({ success: true, data: points } as const)
  })
