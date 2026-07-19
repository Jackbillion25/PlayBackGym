# Bitácora — Blueprint

> Generado por The Architect el 2026-07-16
> Arquetipo: SaaS / Web App (mobile-first, futuro cliente nativo)
> Una idea de **LUKAMON**

---

## 1. Project Overview

### Visión

**Bitácora** es un registro personal de entrenamiento de gimnasio, mobile-first, donde cada usuario arma su división semanal (días → ejercicios), entrena registrando **cada serie por separado** (reps y peso con steppers rápidos), y al finalizar cada sesión recibe retroalimentación automática comparada contra su sesión anterior: ¿subiste el peso top? ¿subió tu volumen total? ¿qué omitiste? El resumen se comparte por WhatsApp con un toque.

Nace de un prototipo HTML local (localStorage + "códigos portables"). Esta versión lo convierte en una web app real: cuentas con better-auth, datos en Cloudflare D1, todo desplegado como un solo Cloudflare Worker. El progreso del usuario lo sigue a cualquier dispositivo automáticamente — los códigos de exportación desaparecen. Es una idea de **LUKAMON**, y ese crédito aparece en la landing, el footer y el texto compartido por WhatsApp.

### Metas

- Registrar una sesión completa de gym en el teléfono, con guantes puestos, sin fricción (steppers ±, prellenado con los valores de la última sesión).
- Feedback inmediato al finalizar: factor de mejora por ejercicio (top weight + volumen) contra el registro anterior.
- Registro abierto: cualquiera crea cuenta con email+password (verificación y recuperación por correo vía Resend).
- Base lista para una futura app nativa (Expo/React Native) **sin construir infraestructura de API adicional**: Hono embebido expone `/api/*` tipado (Hono RPC) desde el mismo Worker.

### Métricas de éxito

- Flujo completo entrenar→finalizar→compartir funciona offline-tolerante (la sesión activa nunca se pierde por mala señal en el gym).
- Tiempo de registrar una serie: < 3 segundos (2 taps de stepper).
- Un solo deploy (un Worker), cero servicios externos salvo Resend.

---

## 2. Tech Stack

| Capa | Tecnología | Por qué |
|------|-----------|---------|
| Framework | **Astro 5** (output: server, adapter `@astrojs/cloudflare`) | Páginas SSR ligeras + islas interactivas solo donde hace falta. Se despliega como un único Cloudflare Worker |
| Lenguaje | **TypeScript (strict)** | No negociable |
| Islas UI | **React 19** (`@astrojs/react`) | Solo 2 islas grandes (editor de rutina, modo entrenamiento). Mismo paradigma que la futura app React Native |
| Estilos | **Tailwind CSS v4** con tokens `@theme` del design system existente | El prototipo ya definió la estética; Tailwind la sistematiza |
| API | **Hono 4 embebido en Astro** (`src/pages/api/[...path].ts`) + **Zod** + **Hono RPC** | Un solo Worker, un solo deploy. Middleware, validación y cliente tipado que la futura app móvil importa directo |
| Auth | **better-auth** (email+password, verificación de email y reset de password) | Elegido por el usuario. Corre en Workers con adaptador Drizzle sobre D1 |
| Email | **Resend** (API REST) | Envío de verificación de correo y "olvidé mi contraseña" desde los hooks de better-auth |
| Base de datos | **Cloudflare D1** (SQLite) | Elegida por el usuario. Serverless, en el mismo ecosistema, gratis en este volumen |
| ORM | **Drizzle ORM** + drizzle-kit | Soporte D1 de primera clase, migraciones SQL versionadas, tipos inferidos |
| Hosting/CI | **Cloudflare Workers** + Workers Builds conectado a GitHub | Deploy automático en cada push a `main`; preview en PRs |
| PWA | **@vite-pwa/astro** | Instalable en el teléfono; draft de sesión activa persiste en localStorage |
| Package manager | **pnpm** | Rápido y estándar |

### Arquitectura de alto nivel

```
┌────────────────────── Cloudflare Worker (un solo deploy) ──────────────────────┐
│                                                                                 │
│  Astro SSR ── páginas: /, /login, /registro, /app/** (protegidas)              │
│     │  middleware Astro → auth.api.getSession() → redirect si no hay sesión    │
│     │                                                                           │
│  /api/[...path].ts ──► Hono app                                                │
│         ├── /api/auth/**  ──► better-auth.handler                              │
│         └── /api/**       ──► rutas CRUD (Zod-validadas) ──► Drizzle ──► D1    │
│                                                                                 │
│  better-auth hooks ──► Resend API (verificación / reset password)              │
└─────────────────────────────────────────────────────────────────────────────────┘

Cliente web: islas React consumen /api/* con el cliente Hono RPC (hono/client) — tipado end-to-end.
Futura app nativa (Expo): consume exactamente los mismos /api/* + plugin Expo de better-auth. Cero infra nueva.
```

**Decisión clave (documentada para el futuro):** NO hay Worker de API separado. La app Hono vive autocontenida en `src/server/` — si algún día se necesita `api.dominio.com` dedicado, se extrae moviendo esa carpeta a su propio Worker sin reescribir nada.

---

## 3. Directory Structure

```
bitacora/
  astro.config.mjs              # adapter cloudflare, integraciones react + tailwind + pwa
  wrangler.jsonc                # nombre del worker, binding D1 (DB), compatibility_date, assets
  drizzle.config.ts             # apunta a src/server/db/schema.ts, dialecto sqlite/d1
  package.json
  tsconfig.json                 # strict, path alias @/* → src/*
  .dev.vars                     # secretos locales (NO commitear): BETTER_AUTH_SECRET, RESEND_API_KEY
  migrations/                   # migraciones SQL generadas por drizzle-kit (SÍ se commitean)
  public/
    favicon.svg
    icons/                      # iconos PWA 192/512
  src/
    styles/global.css           # Tailwind v4 @theme con todos los tokens del design system
    middleware.ts               # protege /app/**: getSession → redirect a /login
    env.d.ts                    # tipos de Astro.locals (user, session) y bindings CF
    server/                     # ★ TODO el backend vive aquí (autocontenido, extraíble)
      db/
        schema.ts               # tablas Drizzle (auth + dominio)
        index.ts                # createDb(d1Binding) → drizzle(d1)
      auth.ts                   # createAuth(db, env) → instancia better-auth + hooks Resend
      email.ts                  # sendEmail() via fetch a api.resend.com; plantillas verificación/reset
      api/
        index.ts                # app Hono raíz: basePath /api, middleware auth+error, monta routers; exporta AppType
        middleware.ts           # requireAuth: inyecta c.var.user o 401
        routes/
          days.ts               # CRUD días de rutina
          exercises.ts          # CRUD ejercicios
          sessions.ts           # start / finish / historial / detalle
          profile.ts            # perfil (nombre visible, teléfono)
        logic/
          compare.ts            # ★ setStats(), compareEntries() — el "factor de mejora" (funciones puras, testeadas)
          whatsapp.ts           # buildWhatsAppText() — genera el resumen compartible
    lib/
      api-client.ts             # hc<AppType>('/') — cliente Hono RPC tipado para las islas
      auth-client.ts            # createAuthClient de better-auth/client (login, registro, reset)
      format.ts                 # fmtDate es-MX, formato de pesos
    components/
      ui/                       # primitivas: Button, Card, Field, Chip, Toast, Stepper, Checkbox
      layout/                   # TopBar, AppShell, Footer (crédito LUKAMON)
      islands/
        RoutineEditor.tsx       # ★ isla React: editar días y ejercicios
        TrainingSession.tsx     # ★ isla React: modo entrenamiento (steppers, series, draft offline)
        SessionFeedback.tsx     # resumen comparativo + botón copiar WhatsApp
        AuthForms.tsx           # login / registro / olvidé password / reset
    pages/
      index.astro               # landing pública ("Una idea de LUKAMON")
      login.astro
      registro.astro
      verificar-email.astro     # aterrizaje del link de verificación
      olvide-password.astro
      reset-password.astro      # aterrizaje del link de reset (token en URL)
      app/
        index.astro             # dashboard: días para entrenar, accesos a historial/rutina
        rutina.astro            # monta RoutineEditor
        entrenar/[dayId].astro  # monta TrainingSession
        historial/index.astro   # lista de sesiones
        historial/[id].astro    # detalle de una sesión (series registradas)
        perfil.astro            # nombre, teléfono, borrar cuenta
      api/[...path].ts          # ★ catch-all: export const ALL = (ctx) => honoApp.fetch(ctx.request, ...)
  tests/
    compare.test.ts             # lógica de comparación (la parte más crítica)
    api.test.ts                 # rutas Hono con vitest-pool-workers + D1 en memoria
    e2e/flow.spec.ts            # Playwright: registro → rutina → entrenar → feedback
```

---

## 4. Data Model

### Entidades

**user** (better-auth, con campos adicionales)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | text PK | generado por better-auth |
| name | text | nombre visible en la bitácora |
| email | text unique | login |
| emailVerified | integer (bool) | requerido para usar la app |
| phone | text nullable | **campo adicional** — solo para formato/identidad del resumen WhatsApp, no es login |
| createdAt / updatedAt | integer (timestamp) | |

**session / account / verification** — tablas estándar de better-auth (las genera su CLI; no tocar a mano).

**routine_day** — un bloque de la división semanal ("Empuje", "Piernas")
| Campo | Tipo | Notas |
|-------|------|-------|
| id | text PK | nanoid |
| userId | text FK → user.id | on delete cascade |
| name | text | |
| position | integer | orden definido por el usuario |
| createdAt | integer | |

**exercise** — ejercicio dentro de un día; los targets son solo el punto de partida
| Campo | Tipo | Notas |
|-------|------|-------|
| id | text PK | |
| dayId | text FK → routine_day.id | cascade |
| userId | text FK → user.id | denormalizado para checks de ownership en una query |
| name | text | |
| targetSets | integer nullable | referencia inicial |
| targetReps | integer nullable | |
| targetWeight | real nullable | |
| unit | text ('kg'\|'lb') default 'kg' | |
| bench | text nullable | altura de banco, ej. "nivel 3" |
| pulley | text nullable | polea / agarre |
| notes | text nullable | técnica, sensaciones |
| position | integer | |
| createdAt | integer | |

**workout_session** — una sesión de entrenamiento terminada (⚠ no confundir con `session` de auth)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | text PK | |
| userId | text FK → user.id | cascade |
| dayId | text nullable FK → routine_day.id | set null si el día se borra |
| dayName | text | **snapshot** — el historial no cambia si renombran el día |
| finishedAt | integer | timestamp |

**session_entry** — lo que pasó con un ejercicio en esa sesión
| Campo | Tipo | Notas |
|-------|------|-------|
| id | text PK | |
| sessionId | text FK → workout_session.id | cascade |
| exerciseId | text nullable FK → exercise.id | set null si se borra el ejercicio; la comparación usa este id |
| exerciseName | text | snapshot |
| completed | integer (bool) | omitido = 0 |
| bench / pulley / notes | text nullable | valores reales usados ese día |
| position | integer | |

**session_set** — cada serie individual (el corazón de la app)
| Campo | Tipo | Notas |
|-------|------|-------|
| id | text PK | |
| entryId | text FK → session_entry.id | cascade |
| setIndex | integer | S1, S2, ... |
| reps | integer nullable | |
| weight | real nullable | en la unidad del ejercicio |

### Relaciones

- user 1—N routine_day 1—N exercise
- user 1—N workout_session 1—N session_entry 1—N session_set
- La **comparación** entre sesiones se hace buscando el `session_entry` más reciente anterior con el mismo `exerciseId` (índice en `(exerciseId, sessionId)`).

### Esquema Drizzle (dominio; las tablas de auth las genera `npx @better-auth/cli generate`)

```typescript
// src/server/db/schema.ts (extracto de dominio)
import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const routineDay = sqliteTable('routine_day', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, t => [index('day_user_idx').on(t.userId)])

export const exercise = sqliteTable('exercise', {
  id: text('id').primaryKey(),
  dayId: text('day_id').notNull().references(() => routineDay.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  targetSets: integer('target_sets'),
  targetReps: integer('target_reps'),
  targetWeight: real('target_weight'),
  unit: text('unit', { enum: ['kg', 'lb'] }).notNull().default('kg'),
  bench: text('bench'),
  pulley: text('pulley'),
  notes: text('notes'),
  position: integer('position').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, t => [index('exercise_day_idx').on(t.dayId)])

export const workoutSession = sqliteTable('workout_session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  dayId: text('day_id').references(() => routineDay.id, { onDelete: 'set null' }),
  dayName: text('day_name').notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp' }).notNull(),
}, t => [index('ws_user_idx').on(t.userId, t.finishedAt)])

export const sessionEntry = sqliteTable('session_entry', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => workoutSession.id, { onDelete: 'cascade' }),
  exerciseId: text('exercise_id').references(() => exercise.id, { onDelete: 'set null' }),
  exerciseName: text('exercise_name').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  bench: text('bench'),
  pulley: text('pulley'),
  notes: text('notes'),
  position: integer('position').notNull().default(0),
}, t => [index('entry_exercise_idx').on(t.exerciseId, t.sessionId)])

export const sessionSet = sqliteTable('session_set', {
  id: text('id').primaryKey(),
  entryId: text('entry_id').notNull().references(() => sessionEntry.id, { onDelete: 'cascade' }),
  setIndex: integer('set_index').notNull(),
  reps: integer('reps'),
  weight: real('weight'),
})
```

---

## 5. API Design

Hono app montada en `src/pages/api/[...path].ts`. Todas las rutas (salvo `/api/auth/**`) pasan por `requireAuth` (401 sin sesión). Respuestas: `{ success: true, data }` | `{ success: false, error: { code, message } }`. Validación con `@hono/zod-validator` en cada body.

### Rutas

| Método | Path | Descripción | Auth |
|--------|------|-------------|------|
| ALL | `/api/auth/**` | better-auth (registro, login, logout, verify-email, forget/reset-password) | pública |
| GET | `/api/routine` | Árbol completo: días + ejercicios ordenados | ✔ |
| POST | `/api/days` | Crear día `{ name }` | ✔ |
| PATCH | `/api/days/:id` | Renombrar / reordenar | ✔ |
| DELETE | `/api/days/:id` | Borrar día (cascade ejercicios; historial se conserva por snapshots) | ✔ |
| POST | `/api/days/:dayId/exercises` | Crear ejercicio (name, targets, unit, bench, pulley, notes) | ✔ |
| PATCH | `/api/exercises/:id` | Editar ejercicio | ✔ |
| DELETE | `/api/exercises/:id` | Borrar ejercicio | ✔ |
| GET | `/api/days/:dayId/prefill` | ★ Draft inicial de entrenamiento (ver detalle) | ✔ |
| POST | `/api/sessions` | ★ Finalizar sesión: guarda todo y devuelve el feedback comparativo | ✔ |
| GET | `/api/sessions?cursor=&limit=20` | Historial paginado (fecha, día, completados/total) | ✔ |
| GET | `/api/sessions/:id` | Detalle: entries + sets de esa sesión | ✔ |
| GET | `/api/exercises/:id/progress` | Serie histórica (top weight y volumen por sesión) — para gráficas futuras | ✔ |
| GET | `/api/profile` / PATCH | Nombre visible y teléfono | ✔ |

**Ownership:** toda query filtra por `userId` de la sesión — nunca confiar en ids del cliente.

### Endpoints críticos

**`GET /api/days/:dayId/prefill`** — replica `buildTrainingDraft()` del prototipo:
para cada ejercicio del día, busca su `session_entry` más reciente (cualquier sesión); si existe, devuelve sus sets reales (reps/peso), bench y pulley como valores iniciales; si no, genera `targetSets` filas con `targetReps`/`targetWeight`. Respuesta:
```json
{ "success": true, "data": { "day": { "id", "name" }, "exercises": [
  { "exerciseId", "name", "unit", "bench", "pulley", "notes": "",
    "sets": [ { "reps": 10, "weight": 40 }, ... ] } ] } }
```

**`POST /api/sessions`** — body validado con Zod:
```json
{ "dayId": "...", "entries": [
  { "exerciseId": "...", "completed": true, "bench": "", "pulley": "", "notes": "",
    "sets": [ { "reps": 10, "weight": 42.5 } ] } ] }
```
El servidor (transacción `db.batch`): inserta `workout_session` + entries + sets, luego para cada entry calcula el **factor de mejora** contra el entry anterior (lógica en `logic/compare.ts`, idéntica al prototipo):
- `setStats(sets)` → `top` (peso máximo) y `volume` (Σ peso×reps, redondeado a 1 decimal)
- `up` si `cur.top > prev.top` o (top igual y `cur.volume > prev.volume`); `down` al revés; `same` si igual; `skip` si `completed=false`; `first` si no hay registro previo.

Respuesta: `{ sessionId, rows: [{ name, status: 'up'|'down'|'same'|'skip'|'first', prevTop, curTop, prevVolume, curVolume }], completedCount, total, whatsappText }`. El `whatsappText` ya viene formateado del servidor (⬆️⬇️➖⚠️, fecha es-MX, y cierre "_Bitácora — una idea de LUKAMON_").

---

## 6. Frontend Architecture

### Páginas

| Ruta | Página | Descripción |
|------|--------|-------------|
| `/` | Landing | Pitch + features + CTA registro. Crédito "Una idea de LUKAMON" prominente |
| `/login`, `/registro` | Auth | Formularios better-auth client. Registro pide nombre + email + password (teléfono opcional, editable después) |
| `/verificar-email`, `/olvide-password`, `/reset-password` | Auth flows | Aterrizaje de links enviados por Resend |
| `/app` | Dashboard | Lista de días → botón entrenar; accesos: historial, rutina, perfil, tutorial |
| `/app/rutina` | Editor de rutina | Isla `RoutineEditor`: CRUD de días y ejercicios |
| `/app/entrenar/[dayId]` | Modo entrenamiento | Isla `TrainingSession`: la pantalla estrella |
| `/app/historial` / `[id]` | Historial | Lista SSR paginada; detalle con series por ejercicio |
| `/app/perfil` | Perfil | Nombre, teléfono, cerrar sesión, borrar cuenta |

### Jerarquía de la pantalla clave (TrainingSession)

```
TrainingSession (isla React — recibe prefill del endpoint como prop desde Astro SSR)
├── HintCard ("registra cada serie por separado…")
├── ExerciseCard × N  (borde verde al completar)
│   ├── CheckboxDone + título
│   ├── SetRow × M
│   │   ├── Stepper reps  (− input +, delta ±1)
│   │   ├── Stepper peso  (− input +, delta ±2.5)
│   │   └── botón ✕ quitar serie (solo idx > 0)
│   ├── + Agregar serie (clona reps/peso de la última)
│   ├── inputs Banco / Polea
│   └── textarea Notas
├── FinalizarSesión → POST /api/sessions → navega a SessionFeedback
└── Cancelar (confirmación si hay cambios)
```

### Estado

- **Astro SSR** carga datos iniciales (sesión, rutina, prefill) y los pasa como props — las islas no hacen fetch inicial.
- Dentro de las islas: `useState`/`useReducer` — el dominio es pequeño, no se necesita TanStack Query ni store global.
- **Draft offline (crítico):** `TrainingSession` persiste su estado en `localStorage` (`bitacora_draft_<dayId>`) en cada cambio. Si se recarga la página o se va la señal a mitad del entreno, el draft se restaura. Al finalizar con éxito, se borra. Si el POST falla (sin red), se muestra reintento — el draft sigue vivo.
- Mutaciones vía cliente Hono RPC (`src/lib/api-client.ts`) — tipado end-to-end sin codegen.

---

## 7. Design System

Conservar la identidad del prototipo — ya está resuelta y es distintiva (dark, dorado, ticket/punch-card). Definir como tokens `@theme` de Tailwind v4.

### Colores

| Rol | Hex | Uso |
|-----|-----|-----|
| bg | `#14110f` | fondo de página |
| surface | `#1d1815` | cards |
| surface-2 | `#26201b` | inputs, filas |
| surface-3 | `#2f2822` | steppers, código |
| border | `#3a322b` / `#4a4038` | bordes 1er/2do nivel |
| accent | `#d9a441` | CTA, marca, focus (soft: `rgba(217,164,65,.14)`) |
| accent-2 | `#f2c96d` | títulos de día |
| good | `#7aab5f` | mejora ▲, completado (soft: `rgba(122,171,95,.14)`) |
| bad | `#c1543f` | retroceso ▼, omitido, peligro |
| text / text-2 / text-3 | `#efe8dd` / `#a89c8c` / `#6b6055` | jerarquía de texto |

### Tipografía

| Rol | Fuente | Uso |
|-----|--------|-----|
| Display | **Bebas Neue** | marca, títulos de pantalla, botones (letter-spacing 1–2px, uppercase) |
| Body | **Inter** 400–700 | texto general, 13–15px |
| Mono | **IBM Plex Mono** | datos: ids, fechas, métricas, eyebrows (10–12px, letter-spacing 2–3px, uppercase) |

Cargar con `@fontsource` (self-hosted) — no Google Fonts CDN (rendimiento y privacidad).

### Espaciado y layout

- Columna única `max-width: 480px` centrada — la app es un flujo móvil incluso en desktop; la landing sí puede ser ancha.
- Radius: 8px inputs/botones, 10px cards, 20px chips. Espaciado base 4px.
- Botones: 48px de alto (44px mínimo táctil), steppers 36px.
- Estética: flat, sin sombras, bordes 1px, borde punteado + muescas circulares para el "ticket" del resumen. Feedback táctil: `scale(0.98)` en `:active`.

---

## 8. Authentication & Authorization

### Flujo

1. Registro (`/registro`): nombre + email + password → better-auth crea el usuario → hook `sendVerificationEmail` dispara correo vía **Resend**.
2. El usuario verifica desde el correo → aterriza en `/verificar-email` → sesión activa → `/app` (primer login muestra el tutorial de 3 slides).
3. `requireEmailVerification: true` — sin verificar no se entra a `/app`.
4. Olvidé mi contraseña: `/olvide-password` → hook `sendResetPassword` (Resend) → link a `/reset-password?token=...`.

### Configuración better-auth (puntos no obvios)

- `database: drizzleAdapter(db, { provider: 'sqlite' })` sobre el binding D1.
- La instancia se crea **por request** (`createAuth(db, env)`) — en Workers no hay estado global confiable entre requests.
- `emailAndPassword: { enabled: true, requireEmailVerification: true }`; `emailVerification: { sendOnSignUp: true }`.
- Campo adicional: `user.additionalFields.phone` (string, opcional).
- Emails: `src/server/email.ts` hace `fetch('https://api.resend.com/emails', ...)` — **no** usar nodemailer (no funciona en Workers). Remitente: dominio verificado en Resend.
- Sesiones: cookie httpOnly gestionada por better-auth (default). La futura app Expo usa el plugin `@better-auth/expo` contra los mismos endpoints.

### Protección

| Superficie | Mecanismo |
|-----------|-----------|
| Páginas `/app/**` | `src/middleware.ts`: `auth.api.getSession({ headers })` → sin sesión → redirect `/login`; guarda `user` en `Astro.locals` |
| API `/api/**` (excepto `/api/auth`) | middleware Hono `requireAuth` → 401 JSON |
| Datos | toda query Drizzle filtra por `userId` de la sesión (ownership a nivel query, no a nivel confianza) |
| Rate limiting | en `/api/auth/**` usar el rate limiting integrado de better-auth |

Roles: solo `user` en v1. (Si algún día se agrega modo coach para el gym, better-auth tiene plugin `admin` — fuera de alcance ahora.)

---

## 9. Build Order

**Step 1 — Scaffolding**
`pnpm create astro@latest bitacora` (template minimal, TS strict) → `pnpm astro add cloudflare react` → instalar `tailwindcss @tailwindcss/vite`, `hono`, `zod`, `@hono/zod-validator`, `drizzle-orm`, `better-auth`, `nanoid`; dev: `drizzle-kit`, `wrangler`, `vitest`, `@cloudflare/vitest-pool-workers`. Crear `wrangler.jsonc` (worker `bitacora`, `compatibility_date` actual, flag `nodejs_compat`). Verificar `pnpm dev` y `pnpm build` en verde. Init git + repo GitHub.

**Step 2 — Design system**
`src/styles/global.css` con `@theme` (todos los tokens de §7), `@fontsource` para las 3 fuentes. Componentes UI base: `Button`, `Card`, `Field`, `Toast`, `Stepper`, `Checkbox`, `TopBar`, `Footer` (con "Una idea de LUKAMON"). Página de muestra temporal para validarlos visualmente.

**Step 3 — D1 + Drizzle**
`wrangler d1 create bitacora-db` → binding `DB` en `wrangler.jsonc`. Escribir `schema.ts` (§4, dominio). `drizzle.config.ts` → `pnpm db:generate` → `pnpm db:migrate:local` (wrangler d1 migrations apply --local). Tipar bindings en `env.d.ts`.

**Step 4 — better-auth + Resend**
`createAuth()` en `src/server/auth.ts` con drizzleAdapter; `npx @better-auth/cli generate` para las tablas de auth → nueva migración. `src/server/email.ts` con plantillas (verificación, reset) en el tono visual de la marca. Secretos en `.dev.vars`. Probar registro/login vía curl contra `/api/auth/**` (montado en Step 5; para probar antes, montarlo provisionalmente).

**Step 5 — Hono montado en Astro**
`src/server/api/index.ts` (basePath `/api`, error handler con shape estándar, monta better-auth en `/api/auth/**`, `requireAuth` para el resto) + catch-all `src/pages/api/[...path].ts` con `export const ALL`. Exportar `AppType` y crear `src/lib/api-client.ts` (Hono RPC). Middleware Astro para `/app/**`.

**Step 6 — Páginas de auth**
`/login`, `/registro`, `/verificar-email`, `/olvide-password`, `/reset-password` con la isla `AuthForms` (better-auth client). Flujo completo verificable: registro → correo Resend → verificar → `/app`.

**Step 7 — CRUD de rutina**
Rutas Hono `days.ts` + `exercises.ts` (Zod, ownership). Isla `RoutineEditor` en `/app/rutina`: agregar/renombrar/borrar días; agregar/editar/borrar ejercicios con todos los campos (targets, unidad kg/lb, banco, polea, notas). Dashboard `/app` listando días con conteo de ejercicios.

**Step 8 — Modo entrenamiento**
Endpoint `prefill` (§5). Isla `TrainingSession` en `/app/entrenar/[dayId]`: cards por ejercicio, filas de series con steppers (reps ±1, peso ±2.5), agregar/quitar serie (agregar clona la última), toggle completado (borde verde), banco/polea/notas editables. **Draft en localStorage en cada cambio, restauración al recargar.**

**Step 9 — Finalizar sesión + factor de mejora**
`logic/compare.ts` (funciones puras `setStats`/`compareEntries`) **con tests unitarios primero** — es el corazón de la app. `POST /api/sessions` transaccional (db.batch). Pantalla `SessionFeedback`: ticket comparativo (▲▼= / ⚠ omitido / primer registro, "top 40→42.5 · vol 1200→1310"), contador completados, botón **Copiar para WhatsApp** (texto generado por el servidor, con crédito LUKAMON).

**Step 10 — Historial**
`GET /api/sessions` paginado + `/app/historial` (SSR): fecha es-MX, día, completados/total. Detalle `/app/historial/[id]` con todas las series registradas. `GET /api/exercises/:id/progress` (dato listo para gráficas futuras).

**Step 11 — Perfil + tutorial**
`/app/perfil`: nombre visible, teléfono, logout, borrar cuenta (better-auth `deleteUser`, confirmación fuerte). Tutorial de 3 slides adaptado (ya no existe "todo vive en tu navegador"): tu rutina es punto de partida / cada serie se registra por separado / tu progreso te sigue a todos lados. Se muestra en primer login y desde el dashboard.

**Step 12 — PWA + offline**
`@vite-pwa/astro`: manifest (nombre "Bitácora", theme `#14110f`, iconos), service worker con precache del shell. Verificar: instalable en Android/iOS, draft sobrevive pérdida de señal, POST de finalizar reintentable.

**Step 13 — Landing**
`/` pública: hero con la marca, 3-4 features (registro por serie, comparación automática, WhatsApp, multi-dispositivo), CTA registro, "Una idea de LUKAMON" en hero y footer. SEO básico (meta, OG image).

**Step 14 — Deploy + CI**
`wrangler d1 migrations apply bitacora-db --remote` → `wrangler secret put` (BETTER_AUTH_SECRET, RESEND_API_KEY) → `wrangler deploy` manual de validación → conectar repo GitHub a **Workers Builds** (deploy en push a `main`, preview en PRs). Dominio custom + actualizar `BETTER_AUTH_URL` y el dominio de remitente en Resend. E2E Playwright del flujo completo contra preview.

---

## 10. Environment Setup

### Prerrequisitos
- Node.js ≥ 20, pnpm ≥ 9
- Cuenta Cloudflare (Workers + D1, plan free alcanza) + `wrangler login`
- Cuenta Resend (free: 100 emails/día) con dominio verificado
- Repo GitHub

### Variables / secretos

| Variable | Descripción | Dónde |
|----------|-------------|-------|
| `BETTER_AUTH_SECRET` | firma de sesiones (`openssl rand -base64 32`) | `.dev.vars` local / `wrangler secret put` prod |
| `BETTER_AUTH_URL` | URL base (`http://localhost:4321` / dominio prod) | `.dev.vars` / vars de wrangler.jsonc |
| `RESEND_API_KEY` | envío de correos | `.dev.vars` / `wrangler secret put` |
| binding `DB` | base D1 | `wrangler.jsonc` (no es secreto) |

### Comandos iniciales
```bash
pnpm create astro@latest bitacora -- --template minimal --typescript strict
cd bitacora && pnpm astro add cloudflare react
pnpm add hono zod @hono/zod-validator drizzle-orm better-auth nanoid tailwindcss @tailwindcss/vite \
  @fontsource/bebas-neue @fontsource/inter @fontsource/ibm-plex-mono
pnpm add -D drizzle-kit wrangler vitest @cloudflare/vitest-pool-workers @playwright/test @vite-pwa/astro
wrangler d1 create bitacora-db        # copiar binding a wrangler.jsonc
pnpm db:generate && pnpm db:migrate:local
pnpm dev                              # http://localhost:4321
```

Scripts de package.json: `dev`, `build`, `preview` (`wrangler dev` sobre el build), `db:generate` (drizzle-kit generate), `db:migrate:local` / `db:migrate:prod` (wrangler d1 migrations apply), `test`, `test:e2e`, `deploy`.

---

## 11. Dependencies

### Core
| Paquete | Propósito |
|---------|-----------|
| astro, @astrojs/cloudflare, @astrojs/react | framework + adapter Workers + islas |
| react, react-dom | islas interactivas |
| hono, @hono/zod-validator, zod | API embebida, validación, RPC tipado |
| better-auth | auth completa (email+password, verificación, reset) |
| drizzle-orm | ORM sobre D1 |
| tailwindcss, @tailwindcss/vite | estilos con tokens |
| @fontsource/* (bebas-neue, inter, ibm-plex-mono) | fuentes self-hosted |
| nanoid | ids de dominio |

### Dev
| Paquete | Propósito |
|---------|-----------|
| wrangler | D1, secretos, deploy, dev remoto |
| drizzle-kit | generación de migraciones SQL |
| vitest + @cloudflare/vitest-pool-workers | tests en runtime Workers real con D1 |
| @playwright/test | E2E |
| @vite-pwa/astro | manifest + service worker |

---

## 12. Deployment Strategy

- **Hosting:** un solo Cloudflare Worker (`bitacora`) sirviendo SSR + estáticos + API. D1 en la misma cuenta.
- **CI/CD:** Workers Builds conectado al repo GitHub — push a `main` = deploy a producción; PRs generan preview URLs. Migraciones D1 se aplican con `pnpm db:migrate:prod` como paso consciente (no automático en CI en v1 — evita migraciones accidentales).
- **Dominio:** custom domain en el Worker; actualizar `BETTER_AUTH_URL` y verificar dominio remitente en Resend (SPF/DKIM) para que los correos no caigan en spam.
- **Entornos:** local (`wrangler dev` + D1 local + `.dev.vars`) y producción. Staging no se justifica a esta escala; los previews de PR cubren la validación.

---

## 13. Testing Strategy

- **Unit (Vitest):** `logic/compare.ts` es lo más crítico — casos: mejora por top, mejora por volumen con top igual, retroceso, igual, omitido, primer registro, sets vacíos/parciales, decimales (2.5). También `whatsapp.ts` (formato exacto).
- **Integración (vitest-pool-workers):** rutas Hono contra D1 en memoria — ownership (usuario A no ve datos de B), validación Zod (400 con shape estándar), prefill con y sin historial, transaccionalidad de `POST /api/sessions`.
- **E2E (Playwright):** un flujo dorado: registro (con verificación mockeada o auto-verify en test) → crear día + 2 ejercicios → entrenar (steppers, agregar serie, completar 1, omitir 1) → finalizar → feedback correcto → historial lo muestra. Corre contra preview antes de mergear.

---

## 14. Skills to Use During Build

| Skill | Cuándo | Por qué |
|-------|--------|---------|
| `/frontend-design` | Steps 2, 8, 9, 13 | UI distintiva fiel al design system del prototipo |
| `/cloudflare` (o `cloudflare:cloudflare`) | Steps 3, 5, 14 | Config correcta de D1, bindings, wrangler.jsonc |
| `/wrangler` | Steps 3, 14 | Sintaxis actual de migraciones D1, secretos, deploy |
| `/workers-best-practices` | Steps 5, 9 | Evitar antipatrones de Workers (estado global, promesas flotantes) |
| `/playwright-cli` o `@playwright/test` | Step 14 | E2E del flujo dorado |
| `/verify` | Al final de cada step | Probar el flujo real, no solo el build |

---

## 15. CLAUDE.md for Target Project

```markdown
# Bitácora

Registro personal de entrenamiento de gym: rutina por días, registro por serie, comparación
automática contra la sesión anterior, resumen para WhatsApp. Una idea de LUKAMON.
Stack 100% Cloudflare, un solo Worker. Idioma de la UI: español (es-MX).

## Commands

- `pnpm dev` — dev server Astro (http://localhost:4321, D1 local)
- `pnpm build` — build de producción
- `pnpm preview` — wrangler dev sobre el build (runtime Workers real)
- `pnpm db:generate` — genera migración SQL desde src/server/db/schema.ts
- `pnpm db:migrate:local` / `pnpm db:migrate:prod` — aplica migraciones D1
- `pnpm test` — Vitest (unit + integración en pool de Workers)
- `pnpm test:e2e` — Playwright
- `pnpm deploy` — wrangler deploy (normalmente lo hace Workers Builds en push a main)

## Tech Stack

Astro 5 (SSR, adapter Cloudflare) + TypeScript strict + React 19 (islas) + Tailwind v4 +
Hono 4 embebido (+Zod +RPC) + better-auth (email+password, Resend) + D1 + Drizzle + PWA.

## Architecture

- `src/server/` — TODO el backend, autocontenido (extraíble a Worker propio si algún día hace falta):
  `db/` (schema Drizzle), `auth.ts` (better-auth por-request), `email.ts` (Resend via fetch),
  `api/` (app Hono: routes/ + logic/). `api/index.ts` exporta `AppType` para el cliente RPC.
- `src/pages/api/[...path].ts` — catch-all que delega TODO /api/* a Hono (`export const ALL`).
- `src/middleware.ts` — protege /app/**: getSession → redirect /login; user en Astro.locals.
- `src/components/islands/` — islas React: RoutineEditor, TrainingSession, SessionFeedback, AuthForms.
- Datos: Astro SSR carga props iniciales; las islas mutan vía cliente Hono RPC (`src/lib/api-client.ts`).
- `logic/compare.ts` — factor de mejora (setStats: top + volumen). Funciones puras. Es el corazón
  de la app: cualquier cambio requiere tests.

## Key Patterns

- Instancias de auth y db se crean POR REQUEST desde bindings (nunca estado global en Workers).
- Toda query Drizzle filtra por userId de la sesión. Ownership a nivel query, siempre.
- Respuestas API: `{ success: true, data }` | `{ success: false, error: { code, message } }`.
- Todo body validado con @hono/zod-validator en el boundary.
- El historial usa snapshots (dayName, exerciseName): borrar/renombrar rutina NUNCA altera historial.
- TrainingSession persiste su draft en localStorage (`bitacora_draft_<dayId>`) en cada cambio;
  se borra solo tras POST exitoso. La sesión activa jamás se pierde.

## Design System

- Dark siempre. bg #14110f · surface #1d1815 · surface2 #26201b · surface3 #2f2822 ·
  borders #3a322b/#4a4038 · accent #d9a441 · accent2 #f2c96d · good #7aab5f · bad #c1543f ·
  text #efe8dd/#a89c8c/#6b6055
- Fuentes (@fontsource): Bebas Neue (display/botones, uppercase, tracking 1-2px),
  Inter (body 13-15px), IBM Plex Mono (datos/eyebrows 10-12px, uppercase, tracking 2-3px)
- Flat, sin sombras, bordes 1px. Radius 8/10/20px. Botones 48px, steppers 36px, táctil ≥44px.
- App = columna única max-w 480px centrada. Landing puede ser ancha.

## Environment

| Var | Qué es |
|-----|--------|
| `BETTER_AUTH_SECRET` | firma de sesiones (secreto) |
| `BETTER_AUTH_URL` | URL base de la app |
| `RESEND_API_KEY` | envío de correos (secreto) |
| binding `DB` | D1 en wrangler.jsonc |

Local: `.dev.vars` (gitignored). Prod: `wrangler secret put`.

## Reglas No Negociables

1. TypeScript strict, cero `any`. Todo input externo pasa por Zod.
2. Nunca nodemailer ni APIs de Node incompatibles con Workers — email solo vía fetch a Resend.
3. Nunca estado module-level mutable en el server (Workers). auth/db se instancian por request.
4. `logic/compare.ts` no se toca sin actualizar sus tests. Los umbrales: mejora = top mayor,
   o top igual y volumen mayor. Steppers: reps ±1, peso ±2.5.
5. Snapshots en historial: sesiones pasadas son inmutables ante cambios de rutina.
6. Migraciones D1 solo vía drizzle-kit + wrangler d1 migrations. Nunca editar la DB a mano.
7. UI en español (es-MX). Crédito "Una idea de LUKAMON" en landing, footer y texto de WhatsApp.
8. Mobile-first: toda pantalla se diseña y prueba primero a 390px de ancho.
```

---

## 16. Reglas No Negociables (para el builder)

1. **Seguir el Build Order en orden.** Cada step termina con `pnpm build` en verde y el flujo del step verificado a mano (o con `/verify`).
2. **Un solo Worker.** No crear Workers adicionales, colas, DOs ni servicios que el blueprint no pida.
3. **La lógica de comparación se implementa con tests primero** (Step 9) y replica exactamente la semántica del prototipo (top → volumen como desempate).
4. **Ownership en cada query.** Toda lectura/escritura de dominio filtra por el userId de la sesión.
5. **El draft de entrenamiento nunca se pierde:** localStorage en cada cambio, borrado solo tras POST exitoso.
6. **Snapshots en historial:** `dayName`/`exerciseName` se copian al guardar la sesión; FKs a rutina con `set null`.
7. **Fidelidad al design system §7** — nada de estilos genéricos de Tailwind por defecto; usar los tokens.
8. **No commitear `.dev.vars`** ni ningún secreto. `migrations/` sí se commitea.
9. **Idioma:** UI y correos en español; código, identificadores y commits en inglés.
10. **Crédito LUKAMON** presente en landing, footer de la app y texto compartido por WhatsApp.
