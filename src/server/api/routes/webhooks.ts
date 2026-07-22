import { Hono } from 'hono'
import type Stripe from 'stripe'
import type { ApiEnv } from '../types'
import { createDb } from '../../db'
import { createStripeClient } from '../../stripe'
import { recordWebhookEventIfNew } from '../../db/queries'
import { grantEntitlement, expireEntitlement, revokeEntitlement } from '../logic/entitlements'

// Montada FUERA de protectedApp: Stripe no manda sesión de better-auth.
// Se invoca vía webhooksRoutes.fetch(...) (ver api/index.ts), así que arma su
// propio db/cliente Stripe por request en vez de depender del middleware compartido.
// basePath('/api') porque .fetch() recibe la request cruda con el path completo
// (webhooksRoutes.fetch(c.req.raw, c.env) en api/index.ts, no un sub-router montado).
export const webhooksRoutes = new Hono<ApiEnv>().basePath('/api').post('/webhooks/stripe', async (c) => {
  const signature = c.req.header('stripe-signature')
  if (!signature) {
    return c.json({ success: false, error: { code: 'INVALID', message: 'Falta firma' } } as const, 400)
  }

  // Body crudo ANTES de cualquier parseo — constructEventAsync necesita el string exacto.
  const rawBody = await c.req.text()
  const stripe = createStripeClient(c.env)

  let event: Stripe.Event
  try {
    // Workers no tiene el crypto síncrono que usa constructEvent(); hay que usar la variante async.
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, c.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('[webhooks:stripe] firma inválida', err)
    return c.json({ success: false, error: { code: 'INVALID', message: 'Firma inválida' } } as const, 400)
  }

  const db = createDb(c.env.DB)

  const isNew = await recordWebhookEventIfNew(db, event.id, event.type)
  if (!isNew) {
    return c.json({ success: true, data: { deduped: true } } as const)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      await grantEntitlement(db, {
        checkoutSessionId: session.id,
        paymentIntentId:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : (session.payment_intent?.id ?? null),
        amountTotal: session.amount_total,
        currency: session.currency,
      })
      break
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session
      await expireEntitlement(db, session.id)
      break
    }
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      const paymentIntentId =
        typeof charge.payment_intent === 'string' ? charge.payment_intent : (charge.payment_intent?.id ?? null)
      if (paymentIntentId) await revokeEntitlement(db, paymentIntentId)
      break
    }
    default:
      break
  }

  return c.json({ success: true, data: { received: true } } as const)
})
