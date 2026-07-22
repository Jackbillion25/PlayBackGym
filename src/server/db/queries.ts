import { and, eq, desc, asc } from 'drizzle-orm'
import type { Db } from './index'
import { sessionEntry, sessionSet, workoutSession, user, userEntitlement, stripeWebhookEvent } from './schema'
import type { UserEntitlement } from './schema'
import type { SetInput } from '../api/logic/compare'

export type PrevEntry = {
  entryId: string
  bench: string | null
  pulley: string | null
  extraWeight: string | null
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
    .select({
      id: sessionEntry.id,
      bench: sessionEntry.bench,
      pulley: sessionEntry.pulley,
      extraWeight: sessionEntry.extraWeight,
    })
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
    extraWeight: found.extraWeight,
    sets: sets.map((s) => ({ reps: s.reps, weight: s.weight })),
  }
}

// ============================================================
// BILLING (Stripe) — todas filtradas por userId salvo las que operan
// por identificador de Stripe (ya validado contra la firma del webhook).
// ============================================================

export async function getUserStripeCustomerId(db: Db, userId: string): Promise<string | null> {
  const rows = await db
    .select({ stripeCustomerId: user.stripeCustomerId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  return rows[0]?.stripeCustomerId ?? null
}

export async function setUserStripeCustomerId(
  db: Db,
  userId: string,
  stripeCustomerId: string,
): Promise<void> {
  await db.update(user).set({ stripeCustomerId }).where(eq(user.id, userId))
}

export async function getEntitlementsForUser(db: Db, userId: string): Promise<UserEntitlement[]> {
  return db
    .select()
    .from(userEntitlement)
    .where(eq(userEntitlement.userId, userId))
    .orderBy(desc(userEntitlement.createdAt))
}

export async function createPendingEntitlement(
  db: Db,
  params: { id: string; userId: string; productKey: string; checkoutSessionId: string; createdAt: Date },
): Promise<void> {
  await db.insert(userEntitlement).values({
    id: params.id,
    userId: params.userId,
    productKey: params.productKey,
    status: 'pending',
    stripeCheckoutSessionId: params.checkoutSessionId,
    createdAt: params.createdAt,
  })
}

export async function upsertEntitlementActive(
  db: Db,
  params: {
    checkoutSessionId: string
    paymentIntentId: string | null
    amountTotal: number | null
    currency: string | null
  },
): Promise<void> {
  await db
    .update(userEntitlement)
    .set({
      status: 'active',
      activatedAt: new Date(),
      stripePaymentIntentId: params.paymentIntentId,
      amountTotal: params.amountTotal,
      currency: params.currency,
    })
    .where(eq(userEntitlement.stripeCheckoutSessionId, params.checkoutSessionId))
}

export async function expirePendingEntitlementByCheckoutSession(
  db: Db,
  checkoutSessionId: string,
): Promise<void> {
  await db
    .update(userEntitlement)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(
      and(
        eq(userEntitlement.stripeCheckoutSessionId, checkoutSessionId),
        eq(userEntitlement.status, 'pending'),
      ),
    )
}

export async function revokeEntitlementByPaymentIntent(db: Db, paymentIntentId: string): Promise<void> {
  await db
    .update(userEntitlement)
    .set({ status: 'refunded', revokedAt: new Date() })
    .where(eq(userEntitlement.stripePaymentIntentId, paymentIntentId))
}

// Idempotencia de webhooks: PK duplicada ⇒ el evento ya se procesó, no repetir efectos.
export async function recordWebhookEventIfNew(db: Db, eventId: string, type: string): Promise<boolean> {
  try {
    await db.insert(stripeWebhookEvent).values({ id: eventId, type, processedAt: new Date() })
    return true
  } catch {
    return false
  }
}
