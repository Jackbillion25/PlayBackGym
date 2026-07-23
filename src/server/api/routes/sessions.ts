import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import type { ApiEnv } from '../types'
import { routineDay, exercise, workoutSession, sessionEntry, sessionSet } from '../../db/schema'
import { lastEntryFor } from '../../db/queries'
import { historyPage, sessionDetail } from '../../pages-data'
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
  // Tiempo transcurrido en el reloj de la sesión (cronómetro cliente).
  durationSeconds: z.number().int().min(0).max(24 * 3600),
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
        durationSeconds: body.durationSeconds,
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

  // Historial — RPC (usado por la futura app móvil; la web usa historyPage
  // directo en SSR). Misma lógica que esa función.
  .get('/sessions', zValidator('query', z.object({ limit: z.coerce.number().int().min(1).max(50).default(30) })), async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const { limit } = c.req.valid('query')
    const items = await historyPage(db, userId, limit)
    return c.json({ success: true, data: items } as const)
  })

  // Detalle de una sesión — RPC (idem, mismo motivo que arriba).
  .get('/sessions/:id', async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const id = c.req.param('id')

    const detail = await sessionDetail(db, userId, id)
    if (!detail) return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesión no encontrada' } } as const, 404)
    return c.json({ success: true, data: detail } as const)
  })
