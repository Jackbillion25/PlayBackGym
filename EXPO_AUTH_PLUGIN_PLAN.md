# Plan: instalar y configurar el plugin de servidor `@better-auth/expo` en el backend de Play Back Gym

## Cómo usar este documento

Este documento es un **prompt listo para ejecutar**, no unas notas para leer pasivamente. Está escrito
en segunda persona imperativa porque su audiencia eres tú, una instancia de Claude Code, corriendo sin
supervisión humana directa dentro de este repo (`/home/benjamin/Documents/PlayBackGym`). Léelo de arriba
a abajo y ejecuta cada Fase en orden — no te saltes fases ni reordenes pasos dentro de una fase. Cada
fase termina con un paso de **Verificación** explícito: si esa verificación falla de forma inesperada
(no del modo en que la fase anticipa), **detente y pregunta al humano** en vez de improvisar una solución
distinta o continuar a la siguiente fase con el problema sin resolver. No omitas los avisos de
"invoca el skill `wrangler`" — están ahí en cada punto de uso, no solo al principio, precisamente para
que nunca corras un comando relacionado con wrangler sin haber cargado ese skill en el mismo turno.

## Contexto (para que no tengas que re-investigar)

- El backend (este repo) es Astro 7 + Cloudflare Workers + Hono 4 + better-auth + D1/Drizzle. El
  producto se llama **Play Back Gym** (nunca "Bitácora" en nombre público — ver `BRAND.md`).
- El repo hermano `/home/benjamin/Documents/PlayBackGym-react-native` es la nueva app Expo/React Native
  que reusa este mismo backend (mismo Hono API, misma instancia de better-auth). Su cliente de auth
  (`src/lib/auth/client.tsx`) ya usa `expoClient` de `@better-auth/expo/client` con
  `scheme: Env.EXPO_PUBLIC_SCHEME`. Lo que falta es el lado **servidor**: el plugin `expo()` de
  `@better-auth/expo` no está instalado en este backend, y los esquemas de URL de la app móvil no están
  en `trustedOrigins`.
- `src/server/auth.ts` crea la instancia de better-auth **por request** (`createAuth(db, env)`), nunca
  como estado module-level — regla no negociable #3 de `CLAUDE.md`. Hoy `trustedOrigins` es
  `[env.BETTER_AUTH_URL]` (solo el origen web) y no existe ninguna clave `plugins` en el objeto pasado a
  `betterAuth({...})`.
- Los tres esquemas de la app móvil, confirmados leyendo
  `/home/benjamin/Documents/PlayBackGym-react-native/env.ts`:
  - production → scheme `playbackgym` → origen confiable `playbackgym://`
  - preview → scheme `playbackgym.preview` → origen confiable `playbackgym.preview://`
  - development → scheme `playbackgym.dev` → origen confiable `playbackgym.dev://`
- **Investigación de la API real del plugin** (no asumida — verificada leyendo el paquete instalado en
  el repo móvil, `node_modules/@better-auth/expo/dist/index.d.ts` e `index.js`, versión `1.6.24`):
  - `expo(options?: { disableOriginOverride?: boolean })` — esa es la ÚNICA opción que acepta. No
    requiere `baseURL`, ni `overrideOrigin`, ni ninguna otra config obligatoria.
  - `init()` del plugin agrega automáticamente `exp://` a `trustedOrigins` **solo si
    `process.env.NODE_ENV === 'development'`** (para el cliente Expo Go). No agrega los esquemas
    custom de la app (`playbackgym://` etc.) — esos hay que ponerlos tú mismo en `trustedOrigins`.
  - `onRequest()` reescribe el header `origin` de la request a partir del header `expo-origin` que
    manda el cliente Expo, cuando la request no trae ya un `origin`. Esto es lo que le permite a la app
    nativa (que no manda `Origin` como un browser) pasar el chequeo CSRF de better-auth.
  - El hook `after` intercepta redirects de OAuth callback / magic-link / verify-email y, si el
    `location` de la redirección es un esquema custom (no http/https) **y ese esquema está en
    `trustedOrigins`** (`ctx.context.isTrustedOrigin(location)`), le pega el `cookie` de sesión como
    query param a la URL de redirección. Esto es exactamente lo que hace que el flujo de OAuth
    (Google/Microsoft/GitHub) funcione en la app móvil — y es la razón concreta por la que
    `playbackgym://`, `playbackgym.preview://` y `playbackgym.dev://` DEBEN estar en `trustedOrigins`,
    no es opcional ni cosmético.
  - El plugin expone un único endpoint nuevo, `/expo-authorization-proxy` (`GET`), usado para el
    handshake de OAuth vía proxy de autorización. No lee ni escribe ninguna tabla de la base de datos.
  - **Conclusión de esquema:** el plugin **no agrega columnas ni tablas nuevas**. No hay `schema` que
    inyectar, no hay `additionalFields` implícitos. Esto se confirma en el código fuente del plugin: no
    hay ninguna sección de `schema` en el objeto que retorna `expo()`, a diferencia de otros plugins de
    better-auth (p. ej. `twoFactor` o `admin`) que sí la tienen.
- **Versión de `better-auth`:** este backend tiene `better-auth: "^1.6.23"` en `package.json`, con
  `1.6.23` exacto instalado en `node_modules` (`/home/benjamin/Documents/PlayBackGym/node_modules/better-auth/package.json`).
  El paquete `@better-auth/expo@1.6.24` (el que está instalado en el repo móvil) declara
  `peerDependencies: { "better-auth": "^1.6.24", "@better-auth/core": "^1.6.24" }` — es decir, exige
  `better-auth >= 1.6.24 < 2.0.0`. La versión actualmente instalada aquí (`1.6.23`) **no cumple** ese
  rango peer. Vas a necesitar subir `better-auth` a `^1.6.24` (o más nueva compatible) como parte de
  este trabajo — lo cubre la Fase 2.
- El repo móvil ya tiene un comentario de `@ts-expect-error` en `src/lib/auth/client.tsx` documentando
  un desajuste de tipos conocido entre `@better-auth/expo@1.6.24` y `better-auth/react` en esa
  combinación de versiones ("runtime API is exactly per the docs" — el propio equipo del repo móvil ya
  determinó que es un problema solo de tipos, no de comportamiento). Tenlo presente si `pnpm typecheck`
  en este backend se queja de algo similar tras el bump de versión: no es necesariamente un bug tuyo.
- **Estado del árbol de trabajo al momento de escribir este plan:** `git status` mostraba cambios sin
  commitear de trabajo en curso de integración de Stripe (`package.json`, `wrangler.jsonc`,
  `src/server/db/schema.ts`, `src/server/runtime.ts`, etc. modificados; `STRIPE_PLAN.md`,
  `migrations/0002_equal_colossus.sql` y otros archivos nuevos sin trackear). **`src/server/auth.ts`
  estaba limpio** (sin cambios pendientes). Esto puede haber cambiado para cuando ejecutes este plan
  (ese trabajo pudo haberse commiteado ya). No asumas que el árbol está limpio — la Fase 0 te dice
  exactamente cómo verificarlo y qué hacer si no lo está.

---

## Fase 0 — Pre-flight

**Objetivo:** confirmar que el repo está en un estado conocido y seguro para empezar, sin asumir nada
sobre el estado del árbol de trabajo.

- [ ] Corre `git status` en `/home/benjamin/Documents/PlayBackGym`.
  - Si el árbol está completamente limpio, continúa.
  - Si el árbol tiene cambios sin commitear, revisa la lista de archivos modificados/nuevos. Este plan
    va a tocar únicamente `src/server/auth.ts` (edición), `package.json` y `pnpm-lock.yaml` (por la
    nueva dependencia), y potencialmente un archivo de migración nuevo en `migrations/` (solo si la
    Fase 3 determina que hace falta — ver ahí, aunque adelantamos que la investigación dice que NO hace
    falta). Si ninguno de los archivos que ya aparecen modificados en `git status` se solapa con esos
    (aparte de `package.json`/`pnpm-lock.yaml`, que es aceptable que ya tengan cambios de otro trabajo:
    tus cambios se sumarán ahí), es seguro continuar sin tocar ni revertir nada ajeno. Si ves que
    `src/server/auth.ts` YA tiene cambios sin commitear de otro trabajo en curso, **detente y pregunta
    al humano** antes de tocarlo — no quieras pisar trabajo ajeno a medias.
  - No hagas `git stash`, `git checkout .` ni ningún comando destructivo para "limpiar" el árbol. Nunca
    asumas que tienes permiso para descartar trabajo de otro.
- [ ] Confirma que el gestor de paquetes es `pnpm`: revisa `packageManager` en `package.json` (debe decir
  `pnpm@11.10.0` o similar) y confirma que el binario existe con `pnpm --version`.
- [ ] Como sanity check de línea base, arranca el dev server: `pnpm dev` (en background o con timeout
  corto), confirma que loguea que está escuchando en `http://localhost:4321` sin errores de arranque, y
  luego deténlo (Ctrl+C / mata el proceso). Esto te da una línea base de "el server arrancaba antes de
  tocar nada" para poder diagnosticar si algo se rompe más adelante.

**Verificación de la Fase 0:** tienes confirmado (a) el estado real de `git status` y que
`src/server/auth.ts` no tiene cambios ajenos pendientes, (b) que `pnpm` funciona, y (c) que `pnpm dev`
arranca limpio hoy, antes de cualquier cambio. Si cualquiera de estos tres falla de forma inesperada
(el dev server no arranca ni siquiera sin tus cambios), detente y pregunta al humano — no tiene sentido
diagnosticar un problema pre-existente como si lo hubieras causado tú.

---

## Fase 1 — Confirmar la versión objetivo del plugin y la compatibilidad de `better-auth`

**Objetivo:** decidir con qué versión instalar `@better-auth/expo` y resolver el desajuste de peer
dependency con `better-auth` ANTES de instalar, para no terminar con un `node_modules` inconsistente.

- [ ] Corre `cat /home/benjamin/Documents/PlayBackGym-react-native/node_modules/@better-auth/expo/package.json | grep -A3 peerDependencies`
  para reconfirmar en el momento de ejecución cuál es la versión de `@better-auth/expo` instalada en el
  repo móvil y qué rango de `better-auth`/`@better-auth/core` exige como peer. Al momento de escribir
  este plan era `@better-auth/expo@1.6.24` exigiendo `better-auth: ^1.6.24` y `@better-auth/core: ^1.6.24`.
- [ ] Corre `cat /home/benjamin/Documents/PlayBackGym/package.json | grep '"better-auth"'` para
  reconfirmar la versión pineada en este backend (al momento de escribir era `^1.6.23`).
- [ ] Si la versión de `@better-auth/expo` que vas a instalar exige una versión de `better-auth` más
  nueva que la que hay pineada aquí (como es el caso: `^1.6.24` vs `^1.6.23`), decide instalar
  **la misma versión mayor.menor.patch de `@better-auth/expo` que está probada en el repo móvil**
  (no una más nueva sin verificar) y sube `better-auth` en este backend al mínimo que ese peer exige.
  Razonamiento: el repo móvil ya tiene esa combinación de versiones funcionando del lado cliente: es la
  combinación con más probabilidad de funcionar también del lado servidor sin sorpresas. No hay
  necesidad de perseguir "latest" de ninguno de los dos paquetes en esta tarea.

**Verificación de la Fase 1:** tienes anotados (a) el número de versión exacto de `@better-auth/expo`
que vas a pinear, y (b) la versión mínima de `better-auth` a la que necesitas subir este backend. Si al
ejecutar esto la versión instalada en el repo móvil ya cambió respecto a lo documentado arriba (por
ejemplo si alguien actualizó ese repo desde que se escribió este plan), usa la versión que encuentres en
ese momento como fuente de verdad, no la de este documento.

---

## Fase 2 — Instalar las dependencias

**Objetivo:** añadir `@better-auth/expo` como dependencia de este backend, y subir `better-auth` a una
versión compatible, sin warnings de peer dependency sin resolver.

- [ ] Si hace falta subir `better-auth` (según lo que determinaste en la Fase 1), corre primero:
  ```bash
  pnpm add better-auth@^1.6.24
  ```
  (ajusta el número de versión al que realmente determinaste en la Fase 1 si difiere).
- [ ] Instala el plugin, pineado a la versión exacta verificada:
  ```bash
  pnpm add @better-auth/expo@1.6.24
  ```
  (ajusta el número de versión al que realmente determinaste en la Fase 1 si difiere).
- [ ] Revisa la salida de ambos comandos. `pnpm` imprime advertencias de `peer dependency` directamente
  en la salida de `pnpm add` cuando hay conflictos sin resolver — no hace falta un comando aparte. Si
  ves un warning de peer dependency para `better-auth`, `@better-auth/core`, `expo-constants`,
  `expo-linking`, `expo-network` o `expo-web-browser`, léelo con cuidado: los cuatro paquetes `expo-*`
  son peers **opcionales** del lado del plugin de servidor (marcados `optional: true` en
  `peerDependenciesMeta` de `@better-auth/expo`) porque ese paquete también exporta un cliente Expo —
  este backend solo usa el plugin de **servidor** (`import { expo } from '@better-auth/expo'`, sin
  `/client`), así que es esperable y correcto que esos cuatro NO estén instalados aquí ni haga falta
  instalarlos. Un warning sobre esos cuatro específicamente no es un problema. Un warning sobre
  `better-auth` o `@better-auth/core` sí lo sería — si lo ves, vuelve a la Fase 1 y reconsidera la
  versión.
- [ ] Confirma que `package.json` ahora tiene ambas entradas (`better-auth` en su nueva versión y
  `@better-auth/expo`) en `dependencies`, y que `pnpm-lock.yaml` se actualizó (`git status` debe mostrar
  ambos archivos modificados/tocados).

**Verificación de la Fase 2:** `pnpm add` terminó sin errores, no hay warnings de peer dependency sobre
`better-auth`/`@better-auth/core`, y `package.json`/`pnpm-lock.yaml` reflejan las nuevas versiones. Si
`pnpm add` falla (por ejemplo por un conflicto de resolución que no puede resolver solo), detente y
pregunta al humano antes de forzar nada con `--force` o editando el lockfile a mano.

---

## Fase 3 — Editar `src/server/auth.ts`

**Objetivo:** agregar el plugin `expo()` a la configuración de better-auth y extender `trustedOrigins`
con los tres esquemas de la app móvil, manteniendo intacta la regla de instanciación por-request y el
resto de la configuración existente.

- [ ] Abre `src/server/auth.ts` y reemplaza su contenido completo por el siguiente (nota los tres
  cambios respecto al original: el nuevo `import { expo } from '@better-auth/expo'` en la línea 6, el
  array `trustedOrigins` extendido, y la nueva clave `plugins: [expo()]` — todo lo demás es idéntico al
  archivo original, incluyendo el comentario en español de la línea 20 sobre instanciación por-request):

  ```typescript
  import { betterAuth } from 'better-auth'
  import { drizzleAdapter } from 'better-auth/adapters/drizzle'
  import { expo } from '@better-auth/expo'
  import type { Db } from './db'
  import { user, session, account, verification } from './db/schema'
  import { sendVerificationEmail, sendResetPasswordEmail, type EmailBinding } from './email'

  export type AuthEnv = {
    BETTER_AUTH_SECRET: string
    BETTER_AUTH_URL: string
    EMAIL?: EmailBinding
    EMAIL_FROM: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    MICROSOFT_CLIENT_ID: string
    MICROSOFT_CLIENT_SECRET: string
    GITHUB_CLIENT_ID: string
    GITHUB_CLIENT_SECRET: string
  }

  // Esquemas de la app móvil (Expo) — deben coincidir con SCHEMES en
  // PlayBackGym-react-native/env.ts. Cada uno habilita que el flujo de OAuth
  // (redirect de vuelta a la app tras login social) sea reconocido como origen
  // confiable por el plugin `expo()` de better-auth.
  const EXPO_TRUSTED_ORIGINS = [
    'playbackgym://', // production
    'playbackgym.preview://', // preview
    'playbackgym.dev://', // development
  ]

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
      trustedOrigins: [env.BETTER_AUTH_URL, ...EXPO_TRUSTED_ORIGINS],
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
      plugins: [expo()],
    })
  }

  export type Auth = ReturnType<typeof createAuth>
  export type Session = Auth['$Infer']['Session']['session']
  export type User = Auth['$Infer']['Session']['user']
  ```

- [ ] No pases ninguna opción a `expo()` — `disableOriginOverride` es la única opción que existe y su
  default (`false`, es decir el override de origin SÍ está activo) es exactamente lo que se necesita
  para que la app nativa pase el chequeo CSRF. No hay ninguna razón para desactivarlo en este proyecto.
- [ ] No toques `CLAUDE.md`, el punto 5 de "Puntos NO obvios" (`better-auth exige header Origin (CSRF).
  trustedOrigins = [BETTER_AUTH_URL]`) queda desactualizado por este cambio, pero **este plan te pide
  explícitamente NO editar `CLAUDE.md`** — actualizar la documentación del proyecto es una decisión
  aparte que el humano puede pedir después; tu alcance aquí es únicamente el código funcional.

**Verificación de la Fase 3:** abre el archivo editado y confirma visualmente que: (a) el import de
`expo` está presente y apunta a `@better-auth/expo` sin `/client`, (b) `trustedOrigins` incluye
`env.BETTER_AUTH_URL` PRIMERO seguido de los tres esquemas, (c) `plugins: [expo()]` está presente como
última clave del objeto pasado a `betterAuth(...)`, y (d) el resto del archivo es carácter-por-carácter
idéntico al original (no se perdió ningún campo de `emailAndPassword`, `socialProviders`, `user`,
`account` ni `session`).

---

## Fase 4 — Decisión de esquema / migración

**Objetivo:** determinar si hace falta generar y aplicar una migración de base de datos para el plugin.

**Respuesta, ya investigada: NO hace falta ninguna migración.** Se verificó leyendo el código fuente
compilado del plugin instalado (`node_modules/@better-auth/expo/dist/index.js` e `index.d.ts` en el
repo móvil, versión `1.6.24`): el objeto que retorna `expo()` no define ninguna clave `schema`. Solo
aporta: un `id`, un `init()` que ajusta `trustedOrigins` en dev, un `onRequest()` que reescribe el header
`origin`, un hook `after` para el redirect de OAuth, y un endpoint HTTP nuevo
(`/expo-authorization-proxy`) que no toca ninguna tabla — su lógica opera enteramente sobre cookies y
parámetros de query/URL. Compáralo mentalmente con `user`/`session`/`account`/`verification` en
`src/server/db/schema.ts`: ninguna de esas tablas necesita columnas nuevas para este plugin.

Por lo tanto:

- [ ] **NO** corras `pnpm auth:generate` (`@better-auth/cli generate`) para este cambio — no hay drift
  de esquema que ese comando necesite reconciliar.
- [ ] **NO** corras `pnpm db:generate` (drizzle-kit) — no hay cambios en `src/server/db/schema.ts` que
  requieran una migración SQL nueva.
- [ ] **NO** corras `pnpm db:migrate:local` ni `pnpm db:migrate:prod` como parte de este trabajo.
- [ ] Si en el momento de ejecutar este plan encuentras que una versión más nueva de `@better-auth/expo`
  (distinta a la `1.6.24` investigada aquí) SÍ agrega un `schema` al objeto del plugin — cosa que
  puedes confirmar leyendo `node_modules/@better-auth/expo/dist/index.js` en TU repo tras el `pnpm add`
  de la Fase 2, buscando literalmente la palabra `schema` en ese archivo — entonces sí deberías seguir
  el flujo completo: `pnpm auth:generate` → revisar el diff de
  `src/server/db/auth.schema.ts` generado → integrarlo a mano en `src/server/db/schema.ts` siguiendo el
  patrón camelCase-en-TS/snake_case-en-SQL ya usado en ese archivo → `pnpm db:generate` (invoca el skill
  `wrangler` antes si ese comando internamente invoca wrangler; si es solo `drizzle-kit`, no hace falta,
  pero sí invócalo igual antes de los pasos de migración de abajo) → **leer el SQL generado en
  `migrations/` línea por línea antes de aplicarlo** (regla no negociable #6 de `CLAUDE.md`: "Migraciones
  D1 solo vía drizzle-kit + wrangler d1 migrations. Nunca editar la DB a mano.") → invoca el skill
  `wrangler` → `pnpm db:migrate:local` → verificar con
  `wrangler d1 execute bitacora-db --local --command "SELECT name FROM sqlite_master WHERE type='table'"`
  (invoca el skill `wrangler` antes de este comando también) que las tablas/columnas nuevas existen.
  Pero, de nuevo: con la versión `1.6.24` verificada, **este bloque condicional no debería activarse**.

**Verificación de la Fase 4:** confirmaste (leyendo el `index.js` real que quedó instalado en
`node_modules/@better-auth/expo/` tras la Fase 2) que no hay clave `schema` en el plugin, y por lo tanto
no tocaste `migrations/` ni `src/server/db/schema.ts` en esta fase. `git status` no debe mostrar ningún
archivo nuevo dentro de `migrations/` como resultado de esta fase.

---

## Fase 5 — Variables de entorno y configuración

**Objetivo:** confirmar si `wrangler.jsonc` o `.dev.vars` necesitan alguna variable nueva para este
plugin.

**Respuesta, ya investigada: NO hace falta ninguna variable nueva.** La única opción de `expo()` es
`disableOriginOverride` (un booleano que se pasa como literal de código en `auth.ts`, no como variable
de entorno — y no la estamos usando, ver Fase 3). El plugin no lee ningún `process.env.*` propio salvo
`NODE_ENV` (estándar, ya presente en cualquier entorno Node/Workers) para decidir si agrega `exp://` a
`trustedOrigins` en desarrollo. No requiere una `base URL` propia distinta de la que ya usa
`betterAuth({ baseURL: env.BETTER_AUTH_URL })`.

- [ ] Abre `wrangler.jsonc` y confirma (sin editarlo) que `vars.BETTER_AUTH_URL` sigue siendo
  `https://app.playbackgym.fitness` — no cambia.
- [ ] Abre `.dev.vars` y confirma (sin editarlo, y sin reproducir ningún valor de este archivo en
  ninguna parte) que `BETTER_AUTH_SECRET` y `BETTER_AUTH_URL` ya existen — no hace falta agregar nada.
- [ ] No agregues ninguna entrada nueva a la tabla "Environment" de `CLAUDE.md` (fuera de alcance de este
  plan, ver nota de la Fase 3 sobre no editar `CLAUDE.md`).

**Verificación de la Fase 5:** confirmaste visualmente que ni `wrangler.jsonc` ni `.dev.vars` necesitan
cambios, y no los editaste.

---

## Fase 6 — Verificación

**Objetivo:** confirmar que el cambio compila, no rompe los tests existentes, y que el comportamiento
runtime es el esperado (los orígenes de la app móvil ahora son aceptados por better-auth).

- [ ] Typecheck:
  ```bash
  pnpm typecheck
  ```
  Debe terminar sin errores. Si `astro check` reporta un error de tipos relacionado con `expo()` o con
  el import de `@better-auth/expo`, revisa primero si es el mismo tipo de desajuste de tipos entre
  `@better-auth/expo` y la versión de `better-auth`/`better-auth/react` documentado en el
  `@ts-expect-error` del repo móvil (`src/lib/auth/client.tsx`) — si es así, es un problema de tipos
  conocido en el ecosistema para esta combinación de versiones, no un error tuyo de código; documenta
  el hallazgo y decide si hace falta un `@ts-expect-error` puntual análogo en `auth.ts` (con el mismo
  estilo de comentario explicativo que usa el repo móvil) antes de continuar. Si es cualquier otro tipo
  de error, corrígelo antes de avanzar.
- [ ] Suite de tests:
  ```bash
  pnpm test
  ```
  Debe pasar completa. Este cambio no toca `src/server/api/logic/compare.ts` así que
  `tests/compare.test.ts` no debería verse afectado en absoluto — si falla, es señal de que algo se
  rompió de forma no relacionada y hay que investigar antes de seguir, no descartarlo como "normal".
- [ ] Smoke test runtime — **usa el enfoque (b) descrito abajo como el primario**, porque es
  mecánicamente verificable por un agente sin humano presente (no depende de un simulador/dispositivo
  iOS/Android disponible, ni de interacción manual con una UI). El enfoque (a) (correr la app móvil de
  verdad contra el dev server local) es el que da la confianza más alta end-to-end, pero requiere
  tooling de Expo (simulador, cuenta EAS, etc.) que puede no estar disponible en este entorno — trátalo
  como opcional/adicional si tienes esas herramientas a mano, no como bloqueante.

  **(b) Smoke test vía `curl` contra el dev server local — hazlo siempre:**
  - [ ] Invoca el skill `wrangler` antes de este paso (aunque `pnpm dev` es Astro dev, no `wrangler dev`
    directamente, corre sobre el plugin de Cloudflare para Vite que emula bindings D1 — trátalo como
    "wrangler-adjacent" y carga el skill de todas formas, seg��n la instrucción de este plan de invocarlo
    en cada punto de uso).
  - [ ] Arranca el dev server en background: `pnpm dev` (puerto 4321).
  - [ ] Espera a que loguee que está listo, luego corre:
    ```bash
    curl -i -X POST http://localhost:4321/api/auth/sign-in/email \
      -H "Content-Type: application/json" \
      -H "Origin: playbackgym://" \
      -d '{"email":"no-existe@example.com","password":"placeholder-no-real"}'
    ```
  - [ ] Lo que estás verificando NO es que el login tenga éxito (el usuario no existe, así que se espera
    un 401/403 de credenciales inválidas por parte de better-auth) — estás verificando que la respuesta
    **no sea un rechazo por CSRF/origen no confiable**. Antes de este cambio, con
    `Origin: playbackgym://`, better-auth debía rechazar la request a nivel de origen (típicamente un
    403 con un mensaje relacionado a origen/CSRF, potencialmente antes de siquiera intentar validar
    credenciales). Después de este cambio, la request debe llegar hasta la lógica de credenciales y
    fallar por razones de credenciales (401/400 con `error.code` de credenciales inválidas), NO por
    razones de origen. Si quieres una comparación de control, corre el mismo `curl` con
    `-H "Origin: https://evil-no-deberia-funcionar.example"` y confirma que ESE sí es rechazado por
    origen (para asegurarte de que no aflojaste el chequeo de origen para cualquier origen, solo para
    los tres esquemas agregados).
  - [ ] Como verificación adicional y más directa del propósito del plugin, prueba también un endpoint
    GET simple con el mismo header, por ejemplo:
    ```bash
    curl -i http://localhost:4321/api/auth/session \
      -H "Origin: playbackgym.dev://"
    ```
    y confirma un `200` (probablemente con `{"session":null,"user":null}` sin cookie) en vez de un
    rechazo de origen.
  - [ ] Detén el dev server al terminar.

  **(a) Opcional/adicional si tienes tooling de Expo disponible:** en
  `/home/benjamin/Documents/PlayBackGym-react-native`, apunta `EXPO_PUBLIC_API_URL` en su `.env` local a
  `http://localhost:4321` (o la URL LAN si corres en dispositivo/simulador físico), corre `pnpm dev` en
  este repo backend, y `pnpm ios` / `pnpm start` en el repo móvil, e intenta un signup/login real desde
  la app para confirmar el round-trip completo incluyendo el flujo de cookie tras redirect de OAuth. Si
  eliges hacer esto, documenta el resultado, pero no bloquees el resto del plan en esto — es
  complementario al smoke test de `curl`, no un sustituto.

**Verificación de la Fase 6:** `pnpm typecheck` y `pnpm test` pasan limpios, y el smoke test de `curl`
confirma que los tres orígenes nuevos (`playbackgym://`, `playbackgym.preview://`, `playbackgym.dev://`)
ya no son rechazados por CSRF/origen, mientras que un origen arbitrario no listado sigue siéndolo. Si
cualquiera de estos falla de forma inesperada, vuelve a la Fase 3 y revisa el archivo editado antes de
insistir con más cambios — no sigas apilando fixes especulativos.

---

## Fase 7 — Guía de commit (no lo hagas automáticamente)

**Objetivo:** dejar el trabajo listo para revisión humana, sin commitear nada por tu cuenta.

Por las instrucciones globales de este entorno, **los commits solo se hacen cuando el humano los pide
explícitamente**. Este plan, por sí mismo, NO es esa solicitud. Al llegar a este punto:

- [ ] Corre `git status` y `git diff` (y `git diff --stat` para un resumen) para mostrar exactamente qué
  archivos cambiaron como resultado de este plan: `package.json`, `pnpm-lock.yaml`,
  `src/server/auth.ts`, y (solo si la Fase 4 determinó que hacía falta, lo cual no era el caso con la
  versión investigada) algún archivo nuevo en `migrations/`.
- [ ] Presenta al humano un mensaje de commit sugerido, por ejemplo:
  ```
  Agregar plugin expo() de better-auth y orígenes confiables de la app móvil

  Instala @better-auth/expo (server-side) y lo registra en createAuth() junto
  con los tres esquemas de URL de la app Expo (playbackgym://, .preview://,
  .dev://) en trustedOrigins, para que el backend acepte requests firmadas
  desde la app móvil y complete el flujo de redirect de OAuth de vuelta a
  la app. Sube better-auth a ^1.6.24 por requerimiento de peer dependency
  del plugin. Sin cambios de esquema de base de datos.
  ```
- [ ] Detente ahí y espera confirmación explícita del humano antes de correr `git add` / `git commit`
  con nada de esto. No asumas que "el plan decía que había que hacerlo" cuenta como esa confirmación —
  el plan te autoriza a dejar el código listo, no a commitearlo.

---

## Nota de rollback

Si el smoke test de la Fase 6 falla de un modo que no puedes diagnosticar y decides revertir: los únicos
archivos de código que este plan modifica son `src/server/auth.ts` (edición) y `package.json` /
`pnpm-lock.yaml` (por la dependencia nueva). Para revertir de forma limpia:
`git checkout -- src/server/auth.ts package.json pnpm-lock.yaml` (revisa primero con `git status`/`git
diff` que esos tres son efectivamente los únicos archivos que tocaste, para no descartar accidentalmente
cambios ajenos ya presentes en el árbol de trabajo — ver la nota de la Fase 0 sobre el estado del árbol
al momento de escribir este plan) y luego `pnpm install` para que `node_modules` vuelva a coincidir con
el lockfile revertido. Si, contra lo esperado según la Fase 4, en algún punto llegaste a aplicar una
migración local (`pnpm db:migrate:local`), no existe un comando de "deshacer migración" en drizzle-kit/D1
— para descartarla en el entorno local (nunca en prod) invoca el skill `wrangler` y borra la base de
datos D1 local (`rm -rf .wrangler/state/v3/d1` o el path equivalente que reporte `wrangler d1 info
bitacora-db --local`) y vuelve a aplicar únicamente las migraciones previas a la que generaste en este
plan.
