import { describe, it, expect } from 'vitest'
import { setStats, compareEntry, rowText } from '../src/server/api/logic/compare'
import { buildWhatsAppText } from '../src/server/api/logic/whatsapp'

describe('setStats', () => {
  it('top es el peso máximo y volumen es Σ peso×reps', () => {
    expect(setStats([{ reps: 10, weight: 40 }, { reps: 8, weight: 45 }])).toEqual({
      top: 45,
      volume: 40 * 10 + 45 * 8,
    })
  })
  it('redondea el volumen a 1 decimal', () => {
    expect(setStats([{ reps: 3, weight: 2.53 }]).volume).toBe(7.6)
  })
  it('trata reps/peso nulos o vacíos como 0', () => {
    expect(setStats([{ reps: null, weight: null }])).toEqual({ top: 0, volume: 0 })
  })
  it('maneja decimales de 2.5', () => {
    expect(setStats([{ reps: 10, weight: 42.5 }])).toEqual({ top: 42.5, volume: 425 })
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
    expect(r.curTop).toBe(40)
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
  it('formatea omitido', () => {
    expect(rowText({ name: 'x', status: 'skip', prevTop: null, curTop: null, prevVolume: null, curVolume: null })).toBe(
      'Omitido',
    )
  })
  it('formatea mejora legible con peso máx y total levantado', () => {
    expect(
      rowText({ name: 'x', status: 'up', prevTop: 40, curTop: 42.5, prevVolume: 1200, curVolume: 1310 }),
    ).toBe('▲ Peso máx 40→42.5 · Total levantado 1200→1310')
  })
})

describe('buildWhatsAppText', () => {
  it('incluye marca, marcas de estado y crédito LUKAMON', () => {
    const text = buildWhatsAppText({
      dayName: 'Empuje',
      finishedAt: Date.UTC(2026, 6, 19),
      rows: [
        { name: 'Press', status: 'up', prevTop: 40, curTop: 45, prevVolume: 1200, curVolume: 1400 },
        { name: 'Fondos', status: 'skip', prevTop: null, curTop: null, prevVolume: null, curVolume: null },
      ],
      completedCount: 1,
      total: 2,
    })
    expect(text).toContain('*Bitácora — Empuje*')
    expect(text).toContain('⬆️ Press:')
    expect(text).toContain('⚠️ Fondos:')
    expect(text).toContain('✅ 1/2 ejercicios completados')
    expect(text).toContain('_Bitácora — una idea de LUKAMON_')
  })
})
