import { describe, it, expect } from 'vitest'
import { setStats, compareEntry, rowText } from '../src/server/api/logic/compare'
import { buildWhatsAppText } from '../src/server/api/logic/whatsapp'

describe('setStats', () => {
  it('top es el peso máximo, totalReps la suma y volumen Σ peso×reps', () => {
    expect(setStats([{ reps: 10, weight: 40 }, { reps: 8, weight: 45 }])).toEqual({
      top: 45,
      totalReps: 18,
      setCount: 2,
      volume: 40 * 10 + 45 * 8,
    })
  })
  it('redondea el volumen a 1 decimal', () => {
    expect(setStats([{ reps: 3, weight: 2.53 }]).volume).toBe(7.6)
  })
  it('trata reps/peso nulos o vacíos como 0 y no cuenta la serie', () => {
    expect(setStats([{ reps: null, weight: null }])).toEqual({
      top: 0,
      totalReps: 0,
      setCount: 0,
      volume: 0,
    })
  })
  it('maneja decimales de 2.5', () => {
    expect(setStats([{ reps: 10, weight: 42.5 }])).toEqual({
      top: 42.5,
      totalReps: 10,
      setCount: 1,
      volume: 425,
    })
  })
})

describe('compareEntry', () => {
  const base = { name: 'Press', curSets: [{ reps: 10, weight: 40 }] }

  it('skip cuando no está completado', () => {
    expect(compareEntry({ ...base, completed: false, prevSets: null }).status).toBe('skip')
  })
  it('first cuando no hay registro previo', () => {
    const r = compareEntry({ ...base, completed: true, prevSets: null })
    expect(r.status).toBe('first')
    expect(r.cur?.top).toBe(40)
  })
  it('up cuando el top sube', () => {
    const r = compareEntry({
      name: 'Press',
      completed: true,
      curSets: [{ reps: 10, weight: 45 }],
      prevSets: [{ reps: 10, weight: 40 }],
    })
    expect(r.status).toBe('up')
  })
  it('up cuando top igual pero volumen mayor', () => {
    const r = compareEntry({
      name: 'Press',
      completed: true,
      curSets: [{ reps: 12, weight: 40 }],
      prevSets: [{ reps: 10, weight: 40 }],
    })
    expect(r.status).toBe('up')
  })
  it('down cuando top igual pero volumen menor', () => {
    const r = compareEntry({
      name: 'Press',
      completed: true,
      curSets: [{ reps: 8, weight: 40 }],
      prevSets: [{ reps: 10, weight: 40 }],
    })
    expect(r.status).toBe('down')
  })
  it('down cuando el top baja', () => {
    const r = compareEntry({
      name: 'Press',
      completed: true,
      curSets: [{ reps: 10, weight: 35 }],
      prevSets: [{ reps: 10, weight: 40 }],
    })
    expect(r.status).toBe('down')
  })
  it('same cuando top y volumen son idénticos', () => {
    const r = compareEntry({
      name: 'Press',
      completed: true,
      curSets: [{ reps: 10, weight: 40 }],
      prevSets: [{ reps: 10, weight: 40 }],
    })
    expect(r.status).toBe('same')
  })
})

describe('rowText', () => {
  const stats = (top: number, totalReps: number, setCount: number, volume: number) => ({
    top,
    totalReps,
    setCount,
    volume,
  })
  it('formatea omitido sin jerga', () => {
    expect(rowText({ name: 'x', status: 'skip', prev: null, cur: null })).toBe('No lo registraste')
  })
  it('mejora por peso: dice "Mejoraste" y el peso máx, sin "total levantado"', () => {
    const text = rowText({ name: 'x', status: 'up', prev: stats(40, 30, 3, 1200), cur: stats(42.5, 30, 3, 1275) })
    expect(text).toBe('Mejoraste · peso máx 40→42.5')
    expect(text).not.toContain('levantado')
  })
  it('mejora por reps: mismo peso, más repeticiones', () => {
    expect(
      rowText({ name: 'x', status: 'up', prev: stats(40, 28, 3, 1120), cur: stats(40, 32, 3, 1280) }),
    ).toBe('Mejoraste · reps 28→32')
  })
  it('bajaste cuando bajan las reps', () => {
    expect(
      rowText({ name: 'x', status: 'down', prev: stats(40, 30, 3, 1200), cur: stats(40, 24, 3, 960) }),
    ).toBe('Bajaste · reps 30→24')
  })
  it('primer registro muestra series, reps y peso máx', () => {
    expect(rowText({ name: 'x', status: 'first', prev: null, cur: stats(40, 30, 3, 1200) })).toBe(
      'Primer registro · 3 series · 30 reps · 40 máx',
    )
  })
})

describe('buildWhatsAppText', () => {
  it('incluye marca, marcas de estado y crédito LUKAMON', () => {
    const text = buildWhatsAppText({
      dayName: 'Empuje',
      finishedAt: Date.UTC(2026, 6, 19),
      rows: [
        {
          name: 'Press',
          status: 'up',
          prev: { top: 40, totalReps: 30, setCount: 3, volume: 1200 },
          cur: { top: 45, totalReps: 30, setCount: 3, volume: 1350 },
        },
        { name: 'Fondos', status: 'skip', prev: null, cur: null },
      ],
      completedCount: 1,
      total: 2,
    })
    expect(text).toContain('*Play Back Gym — Empuje*')
    expect(text).toContain('⬆️ Press:')
    expect(text).toContain('⚠️ Fondos:')
    expect(text).toContain('✅ 1/2 ejercicios completados')
    expect(text).toContain('_Play Back Gym — una idea de LUKAMON_')
  })
})
