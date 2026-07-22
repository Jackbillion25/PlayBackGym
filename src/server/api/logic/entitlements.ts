import type { Db } from '../../db'
import {
  upsertEntitlementActive,
  expirePendingEntitlementByCheckoutSession,
  revokeEntitlementByPaymentIntent,
} from '../../db/queries'

// Catálogo propio de productos. price_id de Stripe modo test (cuenta acct_1Tw4Gd4tdifrFDhL,
// creados vía API — ver STRIPE_PLAN.md §6/§8). Al pasar a producción, recrear en modo live
// y reemplazar aquí.
export type ProductKey =
  | 'theme_ocean'
  | 'theme_violet'
  | 'theme_slate'
  | 'theme_ember'
  | 'bundle_all_themes'
  | 'sound_pack_1'

export const PRODUCTS: Record<ProductKey, { stripePriceId: string; label: string }> = {
  theme_ocean: { stripePriceId: 'price_1Tw5AA6eDhp9J6DuTYpLJjRw', label: 'Tema Ocean' },
  theme_violet: { stripePriceId: 'price_1Tw5AA6eDhp9J6Du4cnXUUTB', label: 'Tema Violet' },
  theme_slate: { stripePriceId: 'price_1Tw5AB6eDhp9J6Du4Knw2W5L', label: 'Tema Slate' },
  theme_ember: { stripePriceId: 'price_1Tw5AC6eDhp9J6Duw8PvgJxP', label: 'Tema Ember' },
  bundle_all_themes: { stripePriceId: 'price_1Tw5AC6eDhp9J6DunMFet9ie', label: 'Todos los temas' },
  sound_pack_1: { stripePriceId: 'price_1Tw5AD6eDhp9J6DuPA1aDhxF', label: 'Paquete de sonido 1' },
}

export function isProductKey(key: string): key is ProductKey {
  return Object.prototype.hasOwnProperty.call(PRODUCTS, key)
}

// Traduce checkout.session.completed (ya verificado) en la activación del entitlement.
export async function grantEntitlement(
  db: Db,
  session: {
    checkoutSessionId: string
    paymentIntentId: string | null
    amountTotal: number | null
    currency: string | null
  },
): Promise<void> {
  await upsertEntitlementActive(db, session)
}

// Traduce checkout.session.expired: la fila pending asociada no se concreta.
export async function expireEntitlement(db: Db, checkoutSessionId: string): Promise<void> {
  await expirePendingEntitlementByCheckoutSession(db, checkoutSessionId)
}

// Traduce charge.refunded / payment_intent.refunded: revoca el acceso ya otorgado.
export async function revokeEntitlement(db: Db, paymentIntentId: string): Promise<void> {
  await revokeEntitlementByPaymentIntent(db, paymentIntentId)
}
