# Bitácora 🏋️

Registro personal de entrenamiento de gimnasio. Arma tu rutina por días, registra **cada serie por
separado**, y al terminar recibe retroalimentación automática comparada contra tu sesión anterior
(¿subió tu peso máximo? ¿tu total levantado?). Comparte el resumen por WhatsApp con un toque.

**Una idea de LUKAMON.** Stack 100% Cloudflare, un solo Worker.

- **Cronómetro sticky** + **timer de descanso** configurable durante el entreno
- **Modo claro y oscuro** (default: el del sistema)
- Registro con email+password (verificación por correo) **y OAuth Google/GitHub**
- PWA instalable, draft de sesión offline-tolerante
- App móvil (Expo/React Native) en `../PlayBackGym-react-native`, reutilizando este mismo backend

## Stack

Astro 7 (SSR · adapter Cloudflare) · React 19 (islas) · Tailwind v4 · Hono (API `/api/*` + RPC tipado)
· better-auth · Drizzle + D1 · Resend · FontAwesome · PWA.

## Quickstart (local)

```bash
pnpm install
pnpm db:migrate:local        # aplica migraciones a la D1 local
pnpm dev                     # http://localhost:4321
```

Los secretos locales van en `.dev.vars` (ya gitignored; hay un `.env.example` de referencia).
Sin `RESEND_API_KEY` real, los correos de verificación se **imprimen en consola** (dev).

## Configurar OAuth (opcional pero recomendado)

**Google** — https://console.cloud.google.com/apis/credentials → *Crear credenciales → ID de cliente OAuth → Aplicación web*
- Orígenes autorizados: `http://localhost:4321` (y tu dominio de prod)
- URI de redirección: `http://localhost:4321/api/auth/callback/google` (y el de prod)
- Copia client id/secret a `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

**GitHub** — https://github.com/settings/developers → *New OAuth App*
- Homepage: tu URL · Callback: `http://localhost:4321/api/auth/callback/github`
- Copia a `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

> Los providers cuyo id empiece con `dev-` (placeholders) se ignoran automáticamente, así que la app
> corre sin OAuth hasta que pongas credenciales reales.

## Configurar Resend (correo)

1. Cuenta en https://resend.com → verifica un dominio (SPF/DKIM).
2. Crea un API key → `RESEND_API_KEY`. Ajusta `RESEND_FROM` a `Bitácora <no-reply@tudominio.com>`.

## Deploy a producción (Cloudflare Workers)

```bash
# 1. Migrar la D1 remota
pnpm db:migrate:prod

# 2. Secretos de producción
wrangler secret put BETTER_AUTH_SECRET      # openssl rand -base64 32
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_FROM
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET

# 3. Ajustar BETTER_AUTH_URL (vars en wrangler.jsonc) a tu dominio/URL de prod

# 4. Deploy
pnpm deploy
```

> **CI/CD:** conecta el repo a **Workers Builds** para deploy automático en push a `main`.
> Las migraciones D1 se aplican con `pnpm db:migrate:prod` como paso consciente (no automático).

## Estructura

Ver `CLAUDE.md` para la arquitectura completa y los puntos no obvios del stack.
El prototipo HTML original se conserva en `_prototype/` como referencia de diseño y lógica.
