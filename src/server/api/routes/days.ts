import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, eq, asc, max } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { ApiEnv } from '../types'
import { routineDay, exercise, exerciseSet } from '../../db/schema'
import { prefillForDay } from '../../pages-data'

const daySchema = z.object({ name: z.string().trim().min(1).max(60) })
const dayPatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  position: z.number().int().min(0).optional(),
})
const exerciseSetSchema = z.object({
  targetReps: z.number().int().min(1).max(100).nullable(),
  targetWeight: z.number().min(0).max(1000).nullable(),
})
const exerciseSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sets: z.array(exerciseSetSchema).min(1).max(20).optional(),
  unit: z.enum(['kg', 'lb']).optional(),
  bench: z.string().trim().max(60).nullable().optional(),
  pulley: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
})

export const daysRoutes = new Hono<ApiEnv>()
  // Árbol completo: días + ejercicios ordenados
  .get('/routine', async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const days = await db
      .select()
      .from(routineDay)
      .where(eq(routineDay.userId, userId))
      .orderBy(asc(routineDay.position), asc(routineDay.createdAt))
    const exercises = await db
      .select()
      .from(exercise)
      .where(eq(exercise.userId, userId))
      .orderBy(asc(exercise.position), asc(exercise.createdAt))

    const tree = days.map((d) => ({
      ...d,
      exercises: exercises.filter((e) => e.dayId === d.id),
    }))
    return c.json({ success: true, data: tree } as const)
  })

  .post('/days', zValidator('json', daySchema), async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const { name } = c.req.valid('json')
    const [{ value: maxPos } = { value: null }] = await db
      .select({ value: max(routineDay.position) })
      .from(routineDay)
      .where(eq(routineDay.userId, userId))
    const day = {
      id: nanoid(),
      userId,
      name,
      position: (maxPos ?? -1) + 1,
      createdAt: new Date(),
    }
    await db.insert(routineDay).values(day)
    return c.json({ success: true, data: { ...day, exercises: [] } } as const, 201)
  })

  .patch('/days/:id', zValidator('json', dayPatchSchema), async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const id = c.req.param('id')
    const patch = c.req.valid('json')
    const res = await db
      .update(routineDay)
      .set(patch)
      .where(and(eq(routineDay.id, id), eq(routineDay.userId, userId)))
      .returning()
    if (!res.length) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Día no encontrado' } } as const, 404)
    return c.json({ success: true, data: res[0] } as const)
  })

  .delete('/days/:id', async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const id = c.req.param('id')
    const res = await db
      .delete(routineDay)
      .where(and(eq(routineDay.id, id), eq(routineDay.userId, userId)))
      .returning({ id: routineDay.id })
    if (!res.length) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Día no encontrado' } } as const, 404)
    return c.json({ success: true, data: { id } } as const)
  })

  // Crear ejercicio dentro de un día
  .post('/days/:dayId/exercises', zValidator('json', exerciseSchema), async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const dayId = c.req.param('dayId')
    const body = c.req.valid('json')

    // ownership del día
    const owner = await db
      .select({ id: routineDay.id })
      .from(routineDay)
      .where(and(eq(routineDay.id, dayId), eq(routineDay.userId, userId)))
      .limit(1)
    if (!owner.length) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Día no encontrado' } } as const, 404)

    const [{ value: maxPos } = { value: null }] = await db
      .select({ value: max(exercise.position) })
      .from(exercise)
      .where(eq(exercise.dayId, dayId))

    const ex = {
      id: nanoid(),
      dayId,
      userId,
      name: body.name,
      unit: body.unit ?? ('kg' as const),
      bench: body.bench ?? null,
      pulley: body.pulley ?? null,
      notes: body.notes ?? null,
      position: (maxPos ?? -1) + 1,
      createdAt: new Date(),
    }
    const setsInput = body.sets && body.sets.length ? body.sets : [{ targetReps: null, targetWeight: null }]
    const setRows = setsInput.map((s, i) => ({
      id: nanoid(),
      exerciseId: ex.id,
      setIndex: i,
      targetReps: s.targetReps,
      targetWeight: s.targetWeight,
    }))
    await db.batch([
      db.insert(exercise).values(ex),
      ...setRows.map((sr) => db.insert(exerciseSet).values(sr)),
    ] as [any, ...any[]])
    return c.json({ success: true, data: { ...ex, sets: setRows } } as const, 201)
  })

  // ★ Draft inicial de entrenamiento — RPC (usado por la futura app móvil; la
  // web usa prefillForDay directo en SSR). Misma lógica que esa función.
  .get('/days/:dayId/prefill', async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const dayId = c.req.param('dayId')

    const prefill = await prefillForDay(db, userId, dayId)
    if (!prefill) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Día no encontrado' } } as const, 404)

    return c.json({ success: true, data: prefill } as const)
  })
