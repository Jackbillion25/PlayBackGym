# Play Back Gym — Identidad de marca

> Documento de referencia reutilizable (landing, app, correos, redes, tiendas de apps, prensa).
> Una idea de **LUKAMON**.

---

## 1. Nombre y concepto

**Play Back Gym.** Tu bitácora de gimnasio que le da **play** a tu progreso: registras cada serie y
la app la *reproduce* comparándola con tu sesión anterior, para que sepas al instante si mejoraste.

El nombre juega con **playback** (reproducir/repasar) + **gym**: cada entreno es una grabación de tu
progreso que puedes volver a ver, medir y superar.

- **Marca completa:** Play Back Gym
- **Marca corta / wordmark:** Play Back Gym (evitar "PBG" en UI; ok como handle interno)
- **Dominio marketing:** `playbackgym.fitness`
- **App:** `app.playbackgym.fitness`

## 2. Descripciones (copy listo para pegar)

- **Ultra corta (≤5 palabras):** Dale play a tu progreso.
- **Tagline:** Registra cada serie. Mira tu progreso.
- **Corta (una línea):** Bitácora de gimnasio: registra cada serie y compárala automáticamente con tu
  sesión anterior. Cronómetro, descansos y resumen para WhatsApp.
- **Store / meta (≤160):** Registra tu rutina serie por serie y descubre al instante si mejoraste vs.
  tu última sesión. Cronómetro, timer de descanso y resumen para WhatsApp. Una idea de LUKAMON.
- **Larga:** Play Back Gym es una bitácora de entrenamiento pensada para el gimnasio real: armas tu
  rutina por días, registras **cada serie por separado** (reps y peso, con botones +/− rápidos), y al
  terminar recibes retroalimentación clara —mejoraste, bajaste o quedaste igual— comparada contra tu
  sesión anterior en peso, repeticiones y series. Incluye cronómetro de sesión, timer de descanso
  configurable, campos opcionales (banco, polea, peso extra, notas) y un resumen listo para compartir
  por WhatsApp. 100% Cloudflare, instalable como PWA.

## 3. Voz y tono

- **Español (es-MX)**, cercano, directo, sin jerga técnica ni de coach.
- Habla claro: "Mejoraste", "peso máx", "repeticiones", "series". **Nunca** "volumen" ni
  "total levantado" (multiplicación que confunde).
- Motiva sin gritar: frases cortas, verbos de acción ("Registra", "Compara", "Dale play").
- Crédito siempre presente y discreto: **"Una idea de LUKAMON"** (landing, footer, correos, WhatsApp).

## 4. Color

La marca = **progreso**, y el progreso es **esmeralda**. Verde = mejora · rojo = retroceso · gris = igual.

### Tema claro (por defecto)
| Rol | Token | Hex |
|-----|-------|-----|
| Fondo | `--bg` | `#f6f7f6` |
| Superficie | `--surface` | `#ffffff` |
| Acento / marca / mejora | `--accent` / `--good` | `#0f7a52` |
| Acento hover | `--accent-hover` | `#0c6644` |
| Retroceso | `--bad` | `#c23b2c` |
| Texto | `--text` | `#16201c` |
| Texto secundario | `--text2` | `#566159` |
| Texto terciario | `--text3` | `#8a938d` |

### Tema oscuro (sigue al sistema; con toggle)
| Rol | Token | Hex |
|-----|-------|-----|
| Fondo | `--bg` | `#0f1512` |
| Superficie | `--surface` | `#161d19` |
| Acento / marca / mejora | `--accent` / `--good` | `#34c77b` |
| Retroceso | `--bad` | `#e8705f` |
| Texto | `--text` | `#e9ede9` |

Fuente de verdad de los tokens: `src/styles/global.css`.

## 5. Tipografía

- **Títulos / wordmark:** **Plus Jakarta Sans** (variable), peso 700–800, `letter-spacing: -0.02em`.
- **Cuerpo y datos:** **Inter** (400–700), con `tabular-nums` para números alineados.
- Self-hosted vía `@fontsource` (sin CDN). **Prohibido** Bebas Neue y las "eyebrows" mono
  (leían a plantilla de IA).

## 6. Logo / wordmark

- Wordmark "Play Back Gym" en Plus Jakarta Sans 800.
- Acento visual: **barra esmeralda** vertical antes del texto (clase `.brand::before`) — evoca el
  botón de "play" / una barra de progreso. Reutilizar en favicon y correos.
- Ícono sugerido para app/PWA: barra(s) de progreso o triángulo de play en esmeralda sobre fondo
  oscuro `#0f1512`.

## 7. Iconografía

- **FontAwesome** free, **self-hosted** (solid + brands). Sin CDN.
- Íconos recurrentes: `dumbbell`, `stopwatch`, `arrow-trend-up`, `list-check`, `whatsapp`, `play`.

## 8. Principios de UX/UI

- **Mobile-first**, se diseña y prueba primero a **390px**.
- App = columna única `max-width: 480px`. Landing más ancha (`~1000px`).
- Steppers: reps ±1, peso ±2.5. Campos opcionales marcados con `(opcional)`.
- Claro por defecto, profesional y amigable. **Sin** degradados dorados ni look "vibecodeado".

## 9. No-hacer

- No usar "Bitácora" como nombre público (era el título de trabajo; el producto es Play Back Gym).
- No usar Bebas Neue, dorados, ni jerga ("volumen", "top", "total levantado").
- No quitar el crédito "Una idea de LUKAMON".
