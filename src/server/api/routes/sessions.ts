import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, eq, desc, lt, inArray, asc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { ApiEnv } from '../types'
import { routineDay, exercise, workoutSession, sessionEntry, sessionSet } from '../../db/schema'
import { lastEntryFor } from '../../db/queries'
import { compareEntry, type CompareRow } from '../logic/compare'
import { buildWhatsAppText } from '../logic/whatsapp'

const setSchema = z.object({
  reps: z.number().int().min(0).max(1000).nullable(),
  weight: z.number().min(0).max(1000).nullable(),
})
const entrySchema = z.object({
  exerciseId: z.string().min(1),
  completed: z.boolean(),
  bench: z.string().trim().max(60).default(''),
  pulley: z.string().trim().max(60).default(''),
  extraWeight: z.string().trim().max(60).default(''),
  notes: z.string().trim().max(500).default(''),
  sets: z.array(setSchema).max(50),
})
const sessionSchema = z.object({
  dayId: z.string().min(1),
  entries: z.array(entrySchema).min(1).max(50),
})

export const sessionsRoutes = new Hono<ApiEnv>()
  // ★ Finalizar sesión: guarda todo y devuelve el feedback comparativo
  .post('/sessions', zValidator('json', sessionSchema), async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const body = c.req.valid('json')

    // ownership del día + snapshot del nombre
    const dayRow = await db
      .select()
      .from(routineDay)
      .where(and(eq(routineDay.id, body.dayId), eq(routineDay.userId, userId)))
      .limit(1)
    if (!dayRow.length) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Día no encontrado' } } as const, 404)
    }
    const day = dayRow[0]

    // mapa id→nombre de los ejercicios del usuario (ownership + snapshot)
    const exIds = body.entries.map((e) => e.exerciseId)
    const owned = await db
      .select({ id: exercise.id, name: exercise.name })
      .from(exercise)
      .where(and(eq(exercise.userId, userId), inArray(exercise.id, exIds)))
    const nameById = new Map(owned.map((e) => [e.id, e.name]))
    for (const e of body.entries) {
      if (!nameById.has(e.exerciseId)) {
        return c.json(
          { success: false, error: { code: 'INVALID', message: 'Ejercicio no válido' } } as const,
          400,
        )
      }
    }

    const finishedAt = new Date()
    const sessionId = nanoid()

    // Comparación contra la entrada anterior (ANTES de insertar la nueva sesión)
    const rows: CompareRow[] = []
    const entryRecords: {
      id: string
      exerciseId: string
      exerciseName: string
      completed: boolean
      bench: string
      pulley: string
      extraWeight: string
      notes: string
      position: number
      sets: { reps: number | null; weight: number | null }[]
    }[] = []

    let position = 0
    for (const e of body.entries) {
      const exerciseName = nameById.get(e.exerciseId)!
      const prev = await lastEntryFor(db, userId, e.exerciseId)
      rows.push(
        compareEntry({
          name: exerciseName,
          completed: e.completed,
          curSets: e.sets,
          prevSets: prev?.sets ?? null,
        }),
      )
      entryRecords.push({
        id: nanoid(),
        exerciseId: e.exerciseId,
        exerciseName,
        completed: e.completed,
        bench: e.bench,
        pulley: e.pulley,
        extraWeight: e.extraWeight,
        notes: e.notes,
        position: position++,
        sets: e.sets,
      })
    }

    // Escritura transaccional (db.batch)
    const statements: any[] = [
      db.insert(workoutSession).values({
        id: sessionId,
        userId,
        dayId: day.id,
        dayName: day.name,
        finishedAt,
      }),
    ]
    for (const er of entryRecords) {
      statements.push(
        db.insert(sessionEntry).values({
          id: er.id,
          sessionId,
          exerciseId: er.exerciseId,
          exerciseName: er.exerciseName,
          completed: er.completed,
          bench: er.bench || null,
          pulley: er.pulley || null,
          extraWeight: er.extraWeight || null,
          notes: er.notes || null,
          position: er.position,
        }),
      )
      er.sets.forEach((s, i) => {
        statements.push(
          db.insert(sessionSet).values({
            id: nanoid(),
            entryId: er.id,
            setIndex: i,
            reps: s.reps,
            weight: s.weight,
          }),
        )
      })
    }
    await db.batch(statements as [any, ...any[]])

    const completedCount = body.entries.filter((e) => e.completed).length
    const total = body.entries.length
    const whatsappText = buildWhatsAppText({
      dayName: day.name,
      finishedAt: finishedAt.getTime(),
      rows,
      completedCount,
      total,
    })

    return c.json(
      {
        success: true,
        data: { sessionId, rows, completedCount, total, whatsappText, finishedAt: finishedAt.getTime() },
      } as const,
      201,
    )
  })

  // Historial paginado (cursor = finishedAt epoch del último item)
  .get('/sessions', zValidator('query', z.object({ cursor: z.coerce.number().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) })), async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const { cursor, limit } = c.req.valid('query')

    const where = cursor
      ? and(eq(workoutSession.userId, userId), lt(workoutSession.finishedAt, new Date(cursor)))
      : eq(workoutSession.userId, userId)

    const sessions = await db
      .select()
      .from(workoutSession)
      .where(where)
      .orderBy(desc(workoutSession.finishedAt))
      .limit(limit + 1)

    const page = sessions.slice(0, limit)
    const nextCursor = sessions.length > limit ? page[page.length - 1].finishedAt.getTime() : null

    const ids = page.map((s) => s.id)
    const entries = ids.length
      ? await db
          .select({ sessionId: sessionEntry.sessionId, completed: sessionEntry.completed })
          .from(sessionEntry)
          .where(inArray(sessionEntry.sessionId, ids))
      : []

    const items = page.map((s) => {
      const es = entries.filter((e) => e.sessionId === s.id)
      return {
        id: s.id,
        dayName: s.dayName,
        finishedAt: s.finishedAt.getTime(),
        total: es.length,
        completedCount: es.filter((e) => e.completed).length,
      }
    })

    return c.json({ success: true, data: { items, nextCursor } } as const)
  })

  // Detalle de una sesión: entries + sets
  .get('/sessions/:id', async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const id = c.req.param('id')

    const sRow = await db
      .select()
      .from(workoutSession)
      .where(and(eq(workoutSession.id, id), eq(workoutSession.userId, userId)))
      .limit(1)
    if (!sRow.length) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesión no encontrada' } } as const, 404)

    const entries = await db
      .select()
      .from(sessionEntry)
      .where(eq(sessionEntry.sessionId, id))
      .orderBy(asc(sessionEntry.position))

    const entryIds = entries.map((e) => e.id)
    const sets = entryIds.length
      ? await db
          .select()
          .from(sessionSet)
          .where(inArray(sessionSet.entryId, entryIds))
          .orderBy(asc(sessionSet.setIndex))
      : []

    const data = {
      id: sRow[0].id,
      dayName: sRow[0].dayName,
      finishedAt: sRow[0].finishedAt.getTime(),
      entries: entries.map((e) => ({
        id: e.id,
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        completed: e.completed,
        bench: e.bench,
        pulley: e.pulley,
        extraWeight: e.extraWeight,
        notes: e.notes,
        sets: sets
          .filter((s) => s.entryId === e.id)
          .map((s) => ({ setIndex: s.setIndex, reps: s.reps, weight: s.weight })),
      })),
    }
    return c.json({ success: true, data } as const)
  })
