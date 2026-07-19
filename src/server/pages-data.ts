// Lecturas para SSR de páginas Astro (las islas reciben esto como props).
// Las mutaciones van por la API Hono (RPC). Ownership: todo filtra por userId.
import { and, eq, asc, desc, inArray } from 'drizzle-orm'
import type { Db } from './db'
import { routineDay, exercise, workoutSession, sessionEntry, sessionSet } from './db/schema'
import { lastEntryFor } from './db/queries'

export type PrefillExercise = {
  exerciseId: string
  name: string
  unit: 'kg' | 'lb'
  bench: string
  pulley: string
  notes: string
  sets: { reps: number | null; weight: number | null }[]
}

export async function routineTree(db: Db, userId: string) {
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
  return days.map((d) => ({
    id: d.id,
    name: d.name,
    position: d.position,
    exercises: exercises
      .filter((e) => e.dayId === d.id)
      .map((e) => ({
        id: e.id,
        name: e.name,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        targetWeight: e.targetWeight,
        unit: e.unit,
        bench: e.bench,
        pulley: e.pulley,
        notes: e.notes,
        position: e.position,
      })),
  }))
}

export async function prefillForDay(db: Db, userId: string, dayId: string) {
  const dayRow = await db
    .select()
    .from(routineDay)
    .where(and(eq(routineDay.id, dayId), eq(routineDay.userId, userId)))
    .limit(1)
  if (!dayRow.length) return null

  const exercises = await db
    .select()
    .from(exercise)
    .where(eq(exercise.dayId, dayId))
    .orderBy(asc(exercise.position), asc(exercise.createdAt))

  const items: PrefillExercise[] = []
  for (const ex of exercises) {
    const prev = await lastEntryFor(db, userId, ex.id)
    let sets: { reps: number | null; weight: number | null }[]
    if (prev && prev.sets.length) {
      sets = prev.sets
    } else {
      const n = Math.max(1, ex.targetSets ?? 1)
      sets = Array.from({ length: n }, () => ({ reps: ex.targetReps, weight: ex.targetWeight }))
    }
    items.push({
      exerciseId: ex.id,
      name: ex.name,
      unit: ex.unit,
      bench: prev?.bench ?? ex.bench ?? '',
      pulley: prev?.pulley ?? ex.pulley ?? '',
      notes: '',
      sets,
    })
  }
  return { day: { id: dayRow[0].id, name: dayRow[0].name }, exercises: items }
}

export async function historyPage(db: Db, userId: string, limit = 30) {
  const sessions = await db
    .select()
    .from(workoutSession)
    .where(eq(workoutSession.userId, userId))
    .orderBy(desc(workoutSession.finishedAt))
    .limit(limit)

  const ids = sessions.map((s) => s.id)
  const entries = ids.length
    ? await db
        .select({ sessionId: sessionEntry.sessionId, completed: sessionEntry.completed })
        .from(sessionEntry)
        .where(inArray(sessionEntry.sessionId, ids))
    : []

  return sessions.map((s) => {
    const es = entries.filter((e) => e.sessionId === s.id)
    return {
      id: s.id,
      dayName: s.dayName,
      finishedAt: s.finishedAt.getTime(),
      total: es.length,
      completedCount: es.filter((e) => e.completed).length,
    }
  })
}

export async function sessionDetail(db: Db, userId: string, id: string) {
  const sRow = await db
    .select()
    .from(workoutSession)
    .where(and(eq(workoutSession.id, id), eq(workoutSession.userId, userId)))
    .limit(1)
  if (!sRow.length) return null

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

  return {
    id: sRow[0].id,
    dayName: sRow[0].dayName,
    finishedAt: sRow[0].finishedAt.getTime(),
    entries: entries.map((e) => ({
      id: e.id,
      exerciseName: e.exerciseName,
      completed: e.completed,
      bench: e.bench,
      pulley: e.pulley,
      notes: e.notes,
      sets: sets.filter((s) => s.entryId === e.id).map((s) => ({ reps: s.reps, weight: s.weight })),
    })),
  }
}
