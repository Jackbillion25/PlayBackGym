import { and, eq, desc, asc } from 'drizzle-orm'
import type { Db } from './index'
import { sessionEntry, sessionSet, workoutSession } from './schema'
import type { SetInput } from '../api/logic/compare'

export type PrevEntry = {
  entryId: string
  bench: string | null
  pulley: string | null
  sets: SetInput[]
}

// Entrada de sesión más reciente (cualquier sesión del usuario) para un ejercicio.
// Filtra por userId → ownership a nivel query. Replica lastEntryFor() del prototipo.
export async function lastEntryFor(
  db: Db,
  userId: string,
  exerciseId: string,
): Promise<PrevEntry | null> {
  const rows = await db
    .select({ id: sessionEntry.id, bench: sessionEntry.bench, pulley: sessionEntry.pulley })
    .from(sessionEntry)
    .innerJoin(workoutSession, eq(sessionEntry.sessionId, workoutSession.id))
    .where(and(eq(sessionEntry.exerciseId, exerciseId), eq(workoutSession.userId, userId)))
    .orderBy(desc(workoutSession.finishedAt))
    .limit(1)

  const found = rows[0]
  if (!found) return null

  const sets = await db
    .select({ reps: sessionSet.reps, weight: sessionSet.weight })
    .from(sessionSet)
    .where(eq(sessionSet.entryId, found.id))
    .orderBy(asc(sessionSet.setIndex))

  return {
    entryId: found.id,
    bench: found.bench,
    pulley: found.pulley,
    sets: sets.map((s) => ({ reps: s.reps, weight: s.weight })),
  }
}
