# Play Back Gym 🏋️

**Dale play a tu progreso.** Bitácora de gimnasio: arma tu rutina por días, registra **cada serie por
separado**, y al terminar recibe retroalimentación clara comparada contra tu sesión anterior —dice si
**mejoraste, bajaste o quedaste igual** y en qué (peso, repeticiones, series). Comparte el resumen por
WhatsApp con un toque.

**Una idea de LUKAMON.** Stack 100% Cloudflare, un solo Worker.

- 🌐 Marketing: **playbackgym.fitness** (landing aparte, en la raíz) · App: **app.playbackgym.fitness**
- ⏱️ **Cronómetro** de sesión + **timer de descanso** configurable durante el entreno
- 🌗 **Modo claro y oscuro** (default: el del sistema)
- 🔐 Registro con email+password (verificación por correo) **y OAuth Google / Microsoft / GitHub**
- 📲 PWA instalable, draft de sesión offline-tolerante
- 🍏 App móvil (Expo/React Native) en `../PlayBackGym-react-native`, reutilizando este mismo backend

> **Identidad de marca (colores, tipografía, copy):** ver [`BRAND.md`](./BRAND.md).

## Stack

Astro 7 (SSR · adapter Cloudflare) · React 19 (islas) · Tailwind v4 · Hono (API `/api/*` + RPC tipado)
· better-auth · Drizzle + D1 · **Cloudflare Email Sending** · FontAwesome · PWA.

## Arquitectura de dominios

| Qué | Dónde | Deploy |
|-----|-------|--------|
| Landing de marketing | `playbackgym.fitness` (raíz) | proyecto **aparte** |
| Aplicación (login + app) | `app.playbackgym.fitness` | **este repo** (Worker `playbackgym`) |

Entrar a `app.playbackgym.fitness` cae directo al **login**; el enlace "Crea una gratis" lleva a
`app.playbackgym.fitness/signup`. Aquí **no hay landing**.

## Quickstart (local)

```bash
pnpm install
pnpm db:migrate:local        # aplica migraciones a la D1 local
pnpm dev                     # http://localhost:4321
```

Los secretos locales van en `.dev.vars` (gitignored; hay un `.env.example` de referencia).
En local, sin el binding `EMAIL` disponible, los correos de verificación/reset se **imprimen en
consola** (no se rompe el flujo).

## Correo — Cloudflare Email Sending

Sin API keys: se usa el **binding `EMAIL`** del Worker (`send_email` en `wrangler.jsonc`). Antes de
enviar en producción, hay que **onboarding del dominio** una sola vez:

```bash
npx wrangler email sending enable playbackgym.fitness   # habilita el envío (SPF/DKIM/DMARC)
npx wrangler email sending list                          # verifica que el dominio aparezca
```

El remitente sale de la var `EMAIL_FROM` (`no-reply@playbackgym.fitness`) en `wrangler.jsonc`.

## Configurar OAuth (opcional pero recomendado)

Callback en producción: `https://app.playbackgym.fitness/api/auth/callback/<provider>`.
En local: `http://localhost:4321/api/auth/callback/<provider>`.

- **Google** — https://console.cloud.google.com/apis/credentials → *ID de cliente OAuth · App web*.
  Orígenes: `https://app.playbackgym.fitness` (y `http://localhost:4321`). → `GOOGLE_CLIENT_ID/SECRET`.
- **Microsoft** — https://portal.azure.com → *App registrations*. Redirect URI (Web) de prod y local.
  → `MICROSOFT_CLIENT_ID/SECRET`.
- **GitHub** — https://github.com/settings/developers → *New OAuth App*. Callback de prod y local.
  → `GITHUB_CLIENT_ID/SECRET`.

> Los providers cuyo id empiece con `dev-` (placeholders) se ignoran solos: la app corre sin OAuth
> hasta que pongas credenciales reales.

## Deploy a producción (Cloudflare Workers)

El dominio `playbackgym.fitness` ya está conectado en Cloudflare. El Worker se llama **`playbackgym`**
y toma el custom domain `app.playbackgym.fitness` (definido en `routes` de `wrangler.jsonc`).

```bash
# 1. Habilitar Email Sending para el dominio (una sola vez)
npx wrangler email sending enable playbackgym.fitness

# 2. Migrar la D1 remota
pnpm db:migrate:prod

# 3. Secretos de producción (copia y pega; te pedirá el valor de cada uno)
npx wrangler secret put BETTER_AUTH_SECRET      # genera con: openssl rand -base64 32
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put MICROSOFT_CLIENT_ID
npx wrangler secret put MICROSOFT_CLIENT_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET

# 4. Deploy (crea/actualiza el Worker y el custom domain app.playbackgym.fitness)
pnpm deploy
```

> `BETTER_AUTH_URL` (`https://app.playbackgym.fitness`) y `EMAIL_FROM` NO son secretos: van en `vars`
> de `wrangler.jsonc`. El correo va por el binding `EMAIL` (sin secret). **No** hace falta `RESEND_*`.

> **CI/CD:** conecta el repo a **Workers Builds** para deploy automático en push a `main`.
> Las migraciones D1 se aplican con `pnpm db:migrate:prod` como paso consciente (no automático).

## Estructura

Ver `CLAUDE.md` para la arquitectura completa y los puntos no obvios del stack.
