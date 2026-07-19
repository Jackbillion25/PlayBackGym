import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

// ============================================================
// AUTH TABLES (better-auth core schema — shapes must match its models)
// Property keys are camelCase to match better-auth field names; SQL
// columns are snake_case. Do not rename keys without checking better-auth.
// ============================================================

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  // additional field (blueprint §4): solo para identidad / formato del resumen WhatsApp
  phone: text('phone'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================
// DOMAIN TABLES
// ============================================================

export const routineDay = sqliteTable(
  'routine_day',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('day_user_idx').on(t.userId)],
)

export const exercise = sqliteTable(
  'exercise',
  {
    id: text('id').primaryKey(),
    dayId: text('day_id')
      .notNull()
      .references(() => routineDay.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    targetSets: integer('target_sets'),
    targetReps: integer('target_reps'),
    targetWeight: real('target_weight'),
    unit: text('unit', { enum: ['kg', 'lb'] })
      .notNull()
      .default('kg'),
    bench: text('bench'),
    pulley: text('pulley'),
    notes: text('notes'),
    position: integer('position').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('exercise_day_idx').on(t.dayId)],
)

export const workoutSession = sqliteTable(
  'workout_session',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    dayId: text('day_id').references(() => routineDay.id, { onDelete: 'set null' }),
    dayName: text('day_name').notNull(),
    finishedAt: integer('finished_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('ws_user_idx').on(t.userId, t.finishedAt)],
)

export const sessionEntry = sqliteTable(
  'session_entry',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => workoutSession.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id').references(() => exercise.id, { onDelete: 'set null' }),
    exerciseName: text('exercise_name').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    bench: text('bench'),
    pulley: text('pulley'),
    notes: text('notes'),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('entry_exercise_idx').on(t.exerciseId, t.sessionId)],
)

export const sessionSet = sqliteTable('session_set', {
  id: text('id').primaryKey(),
  entryId: text('entry_id')
    .notNull()
    .references(() => sessionEntry.id, { onDelete: 'cascade' }),
  setIndex: integer('set_index').notNull(),
  reps: integer('reps'),
  weight: real('weight'),
})

export type User = typeof user.$inferSelect
export type RoutineDay = typeof routineDay.$inferSelect
export type Exercise = typeof exercise.$inferSelect
export type WorkoutSession = typeof workoutSession.$inferSelect
export type SessionEntry = typeof sessionEntry.$inferSelect
export type SessionSet = typeof sessionSet.$inferSelect
