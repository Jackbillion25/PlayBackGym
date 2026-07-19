# Bitácora

Registro personal de entrenamiento de gym: rutina por días, registro por serie, comparación
automática contra la sesión anterior, cronómetro + timer de descanso, resumen para WhatsApp.
Una idea de LUKAMON. Stack 100% Cloudflare, un solo Worker. Idioma de la UI: español (es-MX).

## Commands

- `pnpm dev` — dev server Astro (http://localhost:4321, D1 local vía cloudflare vite-plugin)
- `pnpm build` — build de producción
- `pnpm preview` — `wrangler dev` sobre el build (runtime Workers real)
- `pnpm typecheck` — `astro check` (TypeScript debe ser 5.x; TS 7 nativo aún no soporta la API)
- `pnpm db:generate` — genera migración SQL desde `src/server/db/schema.ts`
- `pnpm db:migrate:local` / `pnpm db:migrate:prod` — aplica migraciones D1
- `pnpm test` — Vitest (lógica pura de comparación)
- `pnpm test:e2e` — Playwright
- `pnpm deploy` — `astro build && wrangler deploy`

## Tech Stack

Astro 7 (SSR, adapter `@astrojs/cloudflare` v14 con `@cloudflare/vite-plugin`) + TypeScript strict +
React 19 (islas) + Tailwind v4 (`@tailwindcss/vite`) + Hono 4 embebido (+Zod +RPC) +
better-auth (email+password + **OAuth Google/GitHub**, Resend) + D1 + Drizzle + PWA (`@vite-pwa/astro`) +
FontAwesome (self-hosted).

## Architecture

- `src/server/` — TODO el backend, autocontenido (extraíble a Worker propio):
  `db/` (schema Drizzle + queries), `auth.ts` (better-auth por-request), `email.ts` (Resend via fetch),
  `runtime.ts` (bindings CF), `api/` (app Hono: routes/ + logic/), `pages-data.ts` (lecturas SSR).
  `api/index.ts` exporta `AppType` para el cliente RPC (web y futura app móvil).
- `src/pages/api/[...path].ts` — catch-all que delega TODO `/api/*` a Hono (`export const ALL`).
- `src/middleware.ts` — protege `/app/**`: getSession → redirect `/login`; user en `Astro.locals`.
- `src/components/islands/` — islas React: `RoutineEditor`, `TrainingSession`, `SessionFeedback`,
  `AuthForms`, `ProfileForm`.
- Datos: Astro SSR carga props iniciales (`pages-data.ts`); las islas mutan vía cliente Hono RPC
  (`src/lib/api-client.ts` → `rpc`).
- `api/logic/compare.ts` — factor de mejora (`setStats`: top + volumen). Funciones puras. Es el
  corazón de la app: cualquier cambio requiere actualizar `tests/compare.test.ts`.

## ⚠️ Puntos NO obvios (Astro v6+ / adapter v14)

1. **Bindings CF NO están en `Astro.locals.runtime.env`** (eliminado en Astro v6). Se acceden con
   `import { env } from 'cloudflare:workers'` → envuelto en `src/server/runtime.ts` como `cfEnv`.
   El `ExecutionContext` es `Astro.locals.cfContext`.
2. **`wrangler.jsonc` NO define `main` ni `assets`** — los inyecta el adapter vía el vite-plugin.
   Solo define bindings (D1 `DB`), vars y observability.
3. **auth y db se crean POR REQUEST** desde `cfEnv` (nunca estado global en Workers).
4. **TypeScript debe ser 5.x** para `astro check` (TS 7 nativo aún no expone la API programática).
5. **better-auth exige header `Origin`** (CSRF). `trustedOrigins` = `[BETTER_AUTH_URL]`.

## Key Patterns

- Toda query Drizzle filtra por `userId` de la sesión. Ownership a nivel query, siempre.
- Respuestas API: `{ success: true, data }` | `{ success: false, error: { code, message } }`.
- Todo body validado con `@hono/zod-validator` en el boundary.
- El historial usa snapshots (`dayName`, `exerciseName`): borrar/renombrar rutina NUNCA altera historial.
- `TrainingSession` persiste su draft en localStorage (`bitacora_draft_<dayId>`) en cada cambio;
  se borra solo tras POST exitoso. La sesión activa jamás se pierde.
- **Observability:** `invocation_logs: false` — solo registramos `console.error` en fallos, no cada request.

## Design System

Diseño **profesional, claro por defecto** (rediseñado; el usuario rechazó el look dorado/Bebas por
"vibecodeado"). Identidad: el progreso es el color de marca → **esmeralda**.

- **Claro y oscuro** — default = preferencia del sistema; toggle en `ThemeToggle.astro` fija
  `data-theme` en `<html>` + localStorage `bitacora-theme`. Tokens en `src/styles/global.css`.
- Claro: bg #f6f7f6 · surface #fff · accent/good #0f7a52 (esmeralda) · bad #c23b2c · text #16201c.
  Oscuro: bg #0f1512 · accent #34c77b. Verde=mejora, rojo=retroceso, gris=igual (semántica coherente).
- Fuentes self-hosted (`@fontsource`): **Plus Jakarta Sans** (variable, títulos/marca) + **Inter**
  (cuerpo y datos con `tabular-nums`). **NO** Bebas Neue ni eyebrows mono (eran los "tells" de IA).
  Íconos: FontAwesome self-hosted (sin CDN).
- App = columna única max-w 480px. Landing más ancha (max-w 1000px). Steppers reps ±1, peso ±2.5.
- Feedback legible (sin jerga): "Peso máx" y "Total levantado" en vez de "top/vol".
- Campos opcionales marcados con `(opcional)`. La marca `.brand` lleva una barra esmeralda antes del texto.

## Auth (importante)

- Registro **solo** por email (con verificación) **o OAuth** (sin verificación): **Google, Microsoft, GitHub**.
- **El teléfono NO es para registrarse** — es un campo de perfil opcional, solo para compartir por WhatsApp.
- Providers con id `dev-*` (placeholders) se ignoran solos; la app corre sin OAuth hasta poner credenciales reales.

## Entrenamiento

- Cronómetro sticky (tiempo de sesión) junto al título en `TrainHeader`.
- Timer de descanso configurable (`RestTimer`): presets 60/90/120/180s + personalizado, con beep +
  vibración al terminar.

## Environment

| Var | Qué es | Dónde |
|-----|--------|-------|
| `BETTER_AUTH_SECRET` | firma de sesiones (secreto) | `.dev.vars` / `wrangler secret put` |
| `BETTER_AUTH_URL` | URL base de la app | `.dev.vars` / `vars` en wrangler.jsonc |
| `RESEND_API_KEY` / `RESEND_FROM` | envío de correos (secreto) | `.dev.vars` / `wrangler secret put` |
| `GOOGLE_CLIENT_ID/SECRET` | OAuth Google | `.dev.vars` / `wrangler secret put` |
| `GITHUB_CLIENT_ID/SECRET` | OAuth GitHub | `.dev.vars` / `wrangler secret put` |
| binding `DB` | D1 en wrangler.jsonc | no secreto |

Local: `.dev.vars` (gitignored). Prod: `wrangler secret put`.

## Reglas No Negociables

1. TypeScript strict, cero `any`. Todo input externo pasa por Zod.
2. Email solo vía fetch a Resend (nunca nodemailer/APIs de Node incompatibles con Workers).
3. Nunca estado module-level mutable en el server. auth/db se instancian por request.
4. `logic/compare.ts` no se toca sin actualizar sus tests. Mejora = top mayor, o top igual y volumen
   mayor. Steppers: reps ±1, peso ±2.5.
5. Snapshots en historial: sesiones pasadas son inmutables ante cambios de rutina.
6. Migraciones D1 solo vía drizzle-kit + wrangler d1 migrations. Nunca editar la DB a mano.
7. UI y correos en español (es-MX). Crédito "Una idea de LUKAMON" en landing, footer y WhatsApp.
8. Mobile-first: toda pantalla se diseña y prueba primero a 390px de ancho.
