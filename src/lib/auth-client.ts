import { createAuthClient } from 'better-auth/client'
import { inferAdditionalFields } from 'better-auth/client/plugins'

// Cliente better-auth para las islas de auth (login, registro, reset, OAuth).
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: { phone: { type: 'string', required: false } },
    }),
  ],
})

export const { signIn, signUp, signOut, useSession, requestPasswordReset, resetPassword } = authClient

// Providers OAuth disponibles
export type OAuthProvider = 'google' | 'microsoft' | 'github'
export function signInWith(provider: OAuthProvider, callbackURL = '/app') {
  return authClient.signIn.social({ provider, callbackURL })
}
