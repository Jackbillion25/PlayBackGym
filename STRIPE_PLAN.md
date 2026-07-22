# Plan de integración Stripe (solo backend/API)

Este documento es el plan de ejecución para preparar el backend de Play Back Gym para recibir
pagos con Stripe. **Es un plan, no una implementación** — fue generado en una sesión de Claude
para que **otra sesión** (o la misma, después) lo ejecute paso a paso. Léelo completo antes de
tocar código.

Generado: 2026-07-22. Cuenta Stripe conectada: `acct_1Tw4Gd4tdifrFDhL` ("Play Back Gym",
[dashboard](https://dashboard.stripe.com/acct_1Tw4Gd4tdifrFDhL/apikeys)).

## 0. Alcance — leer esto primero

**Qué SÍ es este trabajo:** preparar el backend y la API (rutas Hono, esquema D1/Drizzle,
webhook, cliente Stripe) para que la app *pueda* recibir pagos.

**Qué NO es este trabajo:**
- Nada de UI de compra, botón de "comprar", página de precios, ni Stripe.js en el cliente.
- Ninguna isla React ni página Astro se toca.
- Hoy no hay nada comprable en la app. Este trabajo no cambia eso — solo dejaría el backend listo.

**Por qué backend-only:** habrá una app React Native futura con su **propio** flujo de pago
(probablemente Apple/Google In-App Purchase, no Stripe Checkout web). El diseño de datos debe
separar claramente "qué compró el usuario" (entitlement) de "cómo pagó" (Stripe hoy, IAP mañana),
para no acoplar el modelo de datos a un solo canal de pago.

## 1. Qué construir y por qué (Stripe Implementation Planner)

Se usó la herramienta `stripe_implementation_planner` del MCP de Stripe con el contexto del
negocio. Decisión tomada, en orden:

1. Solo Stripe (no hay otro procesador).
2. Superficie: navegador web (la app móvil es un flujo aparte, fuera de este plan).
3. **No** usar el programa "Managed Payments" de Stripe (ese exige elegibilidad — solo bienes
   digitales, cuenta directa, sin IC+ — y cede control de tax/fraude a Stripe; preferimos control
   propio dado que esto crecerá).
4. No se necesita facturación (invoices).
5. No basta con Payment Links compartidos — el cobro debe iniciarse desde la app.
6. **Resultado: Stripe Checkout (hosted/redirect)** — la opción "out of the box", poco código,
   buena conversión. Encaja con compras de bajo costo tipo impulso (~10-30 MXN).

Guía: [Stripe Checkout — hosted](https://docs.stripe.com/payments/accept-a-payment?payment-ui=checkout&ui=stripe-hosted).

Cuando llegue la app React Native, Stripe recomienda su propio camino nativo (Payment Sheet /
Apple Pay / Google Pay, o App-to-Web Checkout) — ver
[digital goods en iOS](https://docs.stripe.com/mobile/digital-goods/checkout). No se implementa
ahora; se menciona para que el modelo de datos de abajo no lo bloquee.

## 2. Modelo de datos (Drizzle / D1)

Agregar a `src/server/db/schema.ts`, siguiendo las convenciones ya usadas ahí (PK `text` con
`nanoid`, columnas snake_case, índice por `userId`, tipos `$inferSelect` exportados):

```ts
export const userEntitlement = sqliteTable(
  'user_entitlement',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Catálogo de productos propios, ver sección 7. NO es el price_id de Stripe.
    productKey: text('product_key').notNull(),
    status: text('status', { enum: ['pending', 'active', 'refunded', 'revoked'] })
      .notNull()
      .default('pending'),
    stripeCheckoutSessionId: text('stripe_checkout_session_id').unique(),
    stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
    amountTotal: integer('amount_total'), // minor units (centavos), snapshot para auditoría
    currency: text('currency'), // 'mxn'
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    activatedAt: integer('activated_at', { mode: 'timestamp' }),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  },
  (t) => [index('entitlement_user_idx').on(t.userId)],
)

// Idempotencia de webhooks: insertar por event.id ANTES de procesar.
// Si el insert falla por PK duplicada, el evento ya se procesó — no repetir efectos.
export const stripeWebhookEvent = sqliteTable('stripe_webhook_event', {
  id: text('id').primaryKey(), // event.id de Stripe, p.ej. 'evt_...'
  type: text('type').notNull(),
  processedAt: integer('processed_at', { mode: 'timestamp' }).notNull(),
})

export type UserEntitlement = typeof userEntitlement.$inferSelect
```

También agregar `stripeCustomerId: text('stripe_customer_id')` (nullable, unique) a la tabla
`user` existente — permite reusar un mismo `Customer` de Stripe por usuario en vez de crear uno
por compra (recomendado por Stripe para historial/reembolsos).

Después de editar el schema: `pnpm db:generate` → revisar la migración generada →
`pnpm db:migrate:local` para probar.

## 3. Archivos nuevos (siguiendo el patrón de `src/server/`)

Mismo patrón que `runtime.ts`/`auth.ts`: nada de estado global, todo por-request.

- **`src/server/stripe.ts`** — `createStripeClient(env: CfEnv)`, análogo a `createAuth`/`createDb`.
  Instancia el SDK `stripe` con `STRIPE_SECRET_KEY` por request (nunca a nivel módulo).
- **`src/server/api/logic/entitlements.ts`** — lógica pura/casi pura:
  - `PRODUCTS`: catálogo constante `productKey → { stripePriceId, label }` (ver sección 7).
  - `grantEntitlement(...)`, `revokeEntitlement(...)` — funciones que traducen un evento de
    Stripe ya verificado en escrituras a `userEntitlement`.
- **`src/server/api/routes/billing.ts`** — montada **dentro** de `protectedApp` (requiere sesión,
  igual que `profileRoutes`):
  - `POST /billing/checkout` — crea una Checkout Session para un `productKey`, devuelve `url`.
  - `GET /billing/entitlements` — lista lo que el usuario posee.
- **`src/server/api/routes/webhooks.ts`** — montada **fuera** de `protectedApp` (Stripe no manda
  sesión de better-auth), igual que `/auth/*` en `src/server/api/index.ts`:
  - `POST /webhooks/stripe` — verifica firma, deduplica con `stripeWebhookEvent`, llama a
    `entitlements.ts`.
- **`src/server/db/queries.ts`** — agregar queries de entitlements junto a las existentes
  (`getEntitlementsForUser`, `upsertEntitlement`, etc.), todas filtradas por `userId` como el
  resto del archivo.

En `src/server/api/index.ts`, montar el webhook igual que `/auth/*` (antes de `requireAuth`):

```ts
app.post('/webhooks/stripe', (c) => webhooksRoutes.fetch(c.req.raw, c.env))
// ...
const protectedApp = new Hono<ApiEnv>()
  .use('*', requireAuth)
  .route('/', daysRoutes)
  .route('/', exercisesRoutes)
  .route('/', sessionsRoutes)
  .route('/', profileRoutes)
  .route('/', billingRoutes) // nuevo
```

## 4. El gotcha de Cloudflare Workers: verificación de firma

Workers **no tiene el `crypto` síncrono de Node** que usa `stripe.webhooks.constructEvent()` por
defecto — falla con `SubtleCryptoProvider cannot be used in a synchronous context`.

**Hay que usar la variante async:**

```ts
const event = await stripe.webhooks.constructEventAsync(
  rawBody, // string crudo, NUNCA el body ya parseado por Hono
  signatureHeader, // header 'stripe-signature'
  env.STRIPE_WEBHOOK_SECRET,
)
```

Importante: leer el body como texto crudo (`await c.req.text()`) **antes** de cualquier
`c.req.json()` — si Hono (u otro middleware) parsea el body primero, la verificación de firma
falla siempre, incluso con el secret correcto.

## 5. Variables de entorno nuevas

Seguir el patrón ya documentado en `CLAUDE.md` (`.dev.vars` local, `wrangler secret put` en prod):

| Var | Qué es | Dónde |
|-----|--------|-------|
| `STRIPE_SECRET_KEY` | clave secreta del SDK (`sk_test_...` / `sk_live_...`) | `.dev.vars` / `wrangler secret put` |
| `STRIPE_WEBHOOK_SECRET` | firma del endpoint (`whsec_...`) | `.dev.vars` / `wrangler secret put` |
| `STRIPE_PUBLISHABLE_KEY` | clave pública (`pk_...`) — no se usa hasta que exista frontend, pero no hace daño declararla ya | `.dev.vars` / `vars` en `wrangler.jsonc` (no es secreta) |

Agregar los tres campos a `CfEnv` en `src/server/runtime.ts`, igual que `GOOGLE_CLIENT_ID`, etc.

Instalar el SDK: `pnpm add stripe`.

## 6. Catálogo de productos (a crear en Stripe, modo test primero)

Basado en el análisis de monetización (apéndice A) — **no crear los Products/Prices reales en
Stripe todavía**, esto es solo el borrador de `productKey` que el código va a esperar:

| `productKey` | Qué es | Precio sugerido (MXN) |
|---|---|---|
| `theme_ocean`, `theme_violet`, `theme_slate`, `theme_ember` | temas de color individuales (solo re-tintan `--accent`/`--accent-hover`/`--accent-soft`/`--accent-contrast`; **nunca** `--good`/`--bad`) | 10–15 MXN c/u |
| `bundle_all_themes` | los 4 temas juntos | 25–30 MXN |
| `sound_pack_1` | sonido alterno del timer de descanso | 10–15 MXN |

⚠️ **Ojo con el mínimo de Stripe**: el cargo mínimo permitido en MXN es **10 MXN exactos** — un
precio de 10 MXN queda justo en el piso, válido pero sin margen para bajarlo más. Además, la
comisión de Stripe en México (~3.6% + 3 MXN por transacción) se come la mayor parte de un cargo
de 10 MXN — por eso el bundle a ~25-30 MXN debería ser el SKU principal, no los ítems sueltos.
Ver apéndice A para el razonamiento completo.

## 7. Idempotencia y seguridad

- **Checkout Session**: pasar un `idempotencyKey` a `stripe.checkout.sessions.create()` derivado
  de `userId` + `productKey` (evita sesiones duplicadas si el cliente reintenta la petición).
- **Webhooks**: insertar el `event.id` en `stripeWebhookEvent` *antes* de aplicar efectos; si el
  insert falla (PK duplicada), el evento ya se procesó — responder 200 y salir sin repetir la
  escritura del entitlement.
- **Metadata**: guardar `userId` y `productKey` en `metadata` de la Checkout Session al crearla —
  es la forma de saber, en el webhook, a quién y qué otorgar sin depender de estado local.
- El endpoint de webhook NO lleva `requireAuth` ni valida `Origin` (la petición viene de Stripe,
  no de un navegador) — pero tampoco debe compartir middleware con las rutas de dominio.

## 8. Fulfillment — qué hace el webhook

Eventos a escuchar (registrar el endpoint en el Dashboard con exactamente estos):

- `checkout.session.completed` → leer `metadata.userId` / `metadata.productKey`, marcar el
  `userEntitlement` correspondiente como `active`, `activatedAt = now`.
- `checkout.session.expired` → limpiar/marcar como caducado cualquier fila `pending` asociada.
- `charge.refunded` (o `payment_intent.refunded`) → marcar `status = 'refunded'`,
  `revokedAt = now`.

Referencia: [Entitlements API](https://docs.stripe.com/billing/entitlements?dashboard-or-api=api)
(pensado para suscripciones, pero el patrón evento→conceder/revocar aplica igual a compras únicas).

## 9. Pasos de ejecución (para la próxima sesión, en orden)

1. `pnpm add stripe`.
2. Pedir a Benjamin las claves de test (`sk_test_...`) y crearlas con `wrangler secret put` /
   `.dev.vars`; agregar `STRIPE_*` a `CfEnv` en `runtime.ts`.
3. Editar `src/server/db/schema.ts` (sección 2) → `pnpm db:generate` → revisar SQL generado →
   `pnpm db:migrate:local`.
4. Crear `src/server/stripe.ts`.
5. Crear `src/server/api/logic/entitlements.ts` (catálogo `PRODUCTS` + `grantEntitlement`/
   `revokeEntitlement`).
6. Crear `src/server/api/routes/billing.ts` y `src/server/api/routes/webhooks.ts`.
7. Montar ambas rutas en `src/server/api/index.ts` (billing dentro de `protectedApp`, webhook
   fuera, como se muestra en la sección 3).
8. En el Dashboard de Stripe (modo test): crear los Products/Prices del catálogo de la sección 6,
   anotar los `price_id` reales en `PRODUCTS`.
9. Registrar el endpoint de webhook apuntando a
   `https://app.playbackgym.fitness/api/webhooks/stripe` (en prod) — en local, usar
   `stripe listen --forward-to localhost:4321/api/webhooks/stripe` y copiar el secret que imprime.
10. Probar con `stripe trigger checkout.session.completed` y confirmar que se crea/activa una
    fila en `user_entitlement`.
11. Escribir tests (Vitest) para `entitlements.ts` — mismo rigor que exige `CLAUDE.md` para
    `compare.ts`: casos de grant, revoke, y el guard de idempotencia.
12. `pnpm db:migrate:prod`, poner los secrets de prod, desplegar, verificar en el Dashboard que
    el webhook entrega 200.

**Recordatorio explícito de alcance:** ningún paso de esta lista toca `src/components/`,
`src/pages/` (fuera de la API), ni agrega un botón, link o mención de pagos visible al usuario.

---

## Apéndice A — Qué vender: temas de color y personalización

*(Producido por un subagente de planeación de producto, a partir de `CLAUDE.md`,
`src/styles/global.css` y `src/server/db/schema.ts` actuales.)*

**Contexto de diseño relevante**: `--accent` y `--good` comparten hoy el mismo verde esmeralda —
la marca ES el color de "mejora". Cualquier tema pagado debe re-tintar únicamente
`--accent`/`--accent-hover`/`--accent-soft`/`--accent-contrast`, dejando `--good` (verde) y
`--bad` (rojo) intactos — es la señal de confianza central de la app (mejoraste/bajaste) y no
debe poder cambiarse por dinero.

**Ideas concretas**
- **Temas de color de acento** ("temas"): 3-5 alternativas a esmeralda — p. ej. `theme_ocean`
  (azul-verde), `theme_violet`, `theme_slate` (monocromo/grafito), `theme_ember` (coral cálido,
  cuidando no acercarse al rojo de `--bad`). Implementación: variables CSS nuevas por tema,
  aplicadas con un atributo tipo `data-cosmetic="ocean"` junto al `data-theme` ya existente.
- **Ícono/badge de PWA a color**: recolorear la marca según el tema comprado — poco esfuerzo
  (ya depende de `--accent`), alta visibilidad (pantalla de inicio).
- **Sonido/vibración alterna del timer de descanso**: `RestTimer` ya tiene beep+vibración; un
  paquete de sonido alterno es un producto adicional razonable, no solo color.
- **Evitar explícitamente**: rachas, insignias, marcos de avatar o cualquier cosa que se sienta
  "juego" — esta es una bitácora seria, no gamificación, y el look dorado/Bebas ya fue rechazado
  una vez por sentirse "vibecodeado".

**Precio**: bundle "todos los temas" (~25-30 MXN) como SKU principal; ítems individuales a
10-15 MXN. Nada de suscripciones — son compras de impulso, no recurrentes. (Ver sección 6 de
este documento para el razonamiento de por qué un flat de 10 MXN por ítem individual no es ideal
dadas las comisiones de Stripe.)

**Modelo de datos**: cubierto por `userEntitlement` en la sección 2 de este documento. Se agregó
además una tabla `userCosmeticPrefs` opcional (no incluida arriba, agregar solo cuando exista
UI): `userId` (PK) + `selectedThemeKey` (nullable) — separa "qué posee" (`userEntitlement`, fuente
de verdad) de "qué tiene aplicado ahora" (preferencia), para que un reembolso pueda revocar acceso
sin perder el historial de compra.

**Fuera de alcance ahora**: ningún UI de compra, botón, pricing page, selector de tema, ni CSS de
los temas alternativos. Esto es solo la definición de producto/precio para que el modelo de datos
del backend (sección 2) tenga sentido.

**Riesgos de UX**: nunca insistir con upsells a mitad de una serie (pantallas de 390px, en medio
de entrenar, es el peor lugar para un paywall); cualquier color nuevo debe pasar la misma barra de
contraste claro/oscuro que esmeralda hoy; nunca dejar que un tema pagado sobreescriba
`--good`/`--bad`.
