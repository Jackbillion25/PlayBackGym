import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Db } from './db'
import { user, session, account, verification } from './db/schema'
import { sendVerificationEmail, sendResetPasswordEmail } from './email'

export type AuthEnv = {
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_URL: string
  RESEND_API_KEY: string
  RESEND_FROM: string
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string
  MICROSOFT_CLIENT_ID: string
  MICROSOFT_CLIENT_SECRET: string
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
}

// La instancia se crea POR REQUEST — en Workers no hay estado global confiable.
export function createAuth(db: Db, env: AuthEnv) {
  const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {}
  if (env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_ID.startsWith('dev-')) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }
  }
  if (env.MICROSOFT_CLIENT_ID && !env.MICROSOFT_CLIENT_ID.startsWith('dev-')) {
    socialProviders.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
    }
  }
  if (env.GITHUB_CLIENT_ID && !env.GITHUB_CLIENT_ID.startsWith('dev-')) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    }
  }

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.BETTER_AUTH_URL],
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await sendResetPasswordEmail(env, { to: user.email, url, name: user.name })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail(env, { to: user.email, url, name: user.name })
      },
    },
    socialProviders,
    user: {
      additionalFields: {
        phone: { type: 'string', required: false, input: true },
      },
      deleteUser: { enabled: true },
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['google', 'microsoft', 'github'],
      },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
export type Session = Auth['$Infer']['Session']['session']
export type User = Auth['$Infer']['Session']['user']
