import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import type { ApiEnv } from '../types'
import { createStripeClient } from '../../stripe'
import { PRODUCTS, isProductKey } from '../logic/entitlements'
import {
  getEntitlementsForUser,
  createPendingEntitlement,
  getUserStripeCustomerId,
  setUserStripeCustomerId,
} from '../../db/queries'

const checkoutSchema = z.object({
  productKey: z.string().min(1),
})

export const billingRoutes = new Hono<ApiEnv>()
  .post('/billing/checkout', zValidator('json', checkoutSchema), async (c) => {
    const db = c.var.db
    const u = c.var.user
    const { productKey } = c.req.valid('json')

    if (!isProductKey(productKey)) {
      return c.json(
        { success: false, error: { code: 'INVALID', message: 'Producto no válido' } } as const,
        400,
      )
    }
    const product = PRODUCTS[productKey]
    const stripe = createStripeClient(c.env)

    let stripeCustomerId = await getUserStripeCustomerId(db, u.id)
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({ email: u.email, metadata: { userId: u.id } })
      stripeCustomerId = customer.id
      await setUserStripeCustomerId(db, u.id, stripeCustomerId)
    }

    // Bucket de 1 minuto: evita sesiones duplicadas por doble-click/reintento de red
    // sin bloquear un segundo intento legítimo si la sesión anterior expiró.
    const idempotencyKey = `checkout:${u.id}:${productKey}:${Math.floor(Date.now() / 60_000)}`

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer: stripeCustomerId,
        line_items: [{ price: product.stripePriceId, quantity: 1 }],
        success_url: `${c.env.BETTER_AUTH_URL}/app`,
        cancel_url: `${c.env.BETTER_AUTH_URL}/app`,
        metadata: { userId: u.id, productKey },
      },
      { idempotencyKey },
    )

    await createPendingEntitlement(db, {
      id: nanoid(),
      userId: u.id,
      productKey,
      checkoutSessionId: session.id,
      createdAt: new Date(),
    })

    return c.json({ success: true, data: { url: session.url } } as const, 201)
  })

  .get('/billing/entitlements', async (c) => {
    const db = c.var.db
    const userId = c.var.user.id
    const rows = await getEntitlementsForUser(db, userId)
    return c.json({
      success: true,
      data: rows.map((r) => ({
        productKey: r.productKey,
        status: r.status,
        activatedAt: r.activatedAt?.getTime() ?? null,
      })),
    } as const)
  })
