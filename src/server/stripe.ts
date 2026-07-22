import Stripe from 'stripe'

export type StripeEnv = {
  STRIPE_SECRET_KEY: string
}

// La instancia se crea POR REQUEST — en Workers no hay estado global confiable.
export function createStripeClient(env: StripeEnv) {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
  })
}
