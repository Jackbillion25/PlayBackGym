import { describe, it, expect } from 'vitest'
import { setStats, compareEntry, buildSetLines, verdictText, formatSetLine, rowText } from '../src/server/api/logic/compare'
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
    const r = compareEntry({ ...base, completed: false, prevSets: null })
    expect(r.status).toBe('skip')
    expect(r.sets).toEqual([])
  })
  it('first cuando no hay registro previo', () => {
    const r = compareEntry({ ...base, completed: true, prevSets: null })
    expect(r.status).toBe('first')
    expect(r.cur?.top).toBe(40)
    expect(r.sets).toEqual([
      { index: 0, curReps: 10, curWeight: 40, prevReps: null, prevWeight: null, repsStatus: 'new', weightStatus: 'new' },
    ])
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

describe('buildSetLines', () => {
  it('compara serie por serie por posición: peso sube (up) y reps bajan (down)', () => {
    const lines = buildSetLines([{ reps: 8, weight: 60 }], [{ reps: 10, weight: 50 }])
    expect(lines).toEqual([
      { index: 0, curReps: 8, curWeight: 60, prevReps: 10, prevWeight: 50, repsStatus: 'down', weightStatus: 'up' },
    ])
  })
  it('ignora series vacías (sin reps ni peso) al filtrar series reales', () => {
    const lines = buildSetLines(
      [{ reps: 10, weight: 40 }, { reps: null, weight: null }],
      [{ reps: 10, weight: 40 }],
    )
    expect(lines).toHaveLength(1)
  })
  it('marca una serie nueva (sin equivalente previo) como new', () => {
    const lines = buildSetLines(
      [{ reps: 10, weight: 40 }, { reps: 8, weight: 40 }],
      [{ reps: 10, weight: 40 }],
    )
    expect(lines[1]).toMatchObject({ prevReps: null, repsStatus: 'new', weightStatus: 'new' })
  })
  it('marca una serie que ya no se registró como removed', () => {
    const lines = buildSetLines(
      [{ reps: 10, weight: 40 }],
      [{ reps: 10, weight: 40 }, { reps: 8, weight: 40 }],
    )
    expect(lines[1]).toMatchObject({ curReps: null, repsStatus: 'removed', weightStatus: 'removed' })
  })
  it('sin sesión previa, todas las series son new', () => {
    const lines = buildSetLines([{ reps: 10, weight: 40 }], null)
    expect(lines[0].repsStatus).toBe('new')
  })
})

describe('formatSetLine / rowText — detalle completo, sin comprimir', () => {
  it('formatea la transición completa de una serie: "de X a Y"', () => {
    const [line] = buildSetLines([{ reps: 8, weight: 60 }], [{ reps: 10, weight: 50 }])
    expect(formatSetLine(line)).toBe('Serie 1: de 10 reps 50 kg a 8 reps 60 kg')
  })
  it('primer registro: serie sin comparación previa', () => {
    const [line] = buildSetLines([{ reps: 10, weight: 40 }], null)
    expect(formatSetLine(line)).toBe('Serie 1: 10 reps, 40 kg')
  })
  it('verdictText nunca menciona "total levantado"', () => {
    for (const s of ['up', 'down', 'same', 'first', 'skip'] as const) {
      expect(verdictText(s)).not.toContain('levantado')
    }
    expect(verdictText('up')).toBe('Mejoraste')
    expect(verdictText('down')).toBe('Bajaste')
  })
  it('rowText incluye el veredicto y CADA serie completa, no un resumen', () => {
    const row = compareEntry({
      name: 'Press',
      completed: true,
      curSets: [{ reps: 8, weight: 60 }, { reps: 6, weight: 55 }],
      prevSets: [{ reps: 10, weight: 50 }, { reps: 8, weight: 45 }],
    })
    const text = rowText(row)
    expect(text).toContain('Serie 1: de 10 reps 50 kg a 8 reps 60 kg')
    expect(text).toContain('Serie 2: de 8 reps 45 kg a 6 reps 55 kg')
    expect(text).not.toMatch(/máx/)
  })
  it('skip', () => {
    expect(rowText({ name: 'x', status: 'skip', prev: null, cur: null, sets: [] })).toBe('No lo registraste')
  })
})

describe('buildWhatsAppText', () => {
  it('incluye marca, veredicto y el detalle COMPLETO serie por serie (sin comprimir)', () => {
    const text = buildWhatsAppText({
      dayName: 'Empuje',
      finishedAt: Date.UTC(2026, 6, 19),
      rows: [
        compareEntry({
          name: 'Press',
          completed: true,
          curSets: [{ reps: 8, weight: 60 }],
          prevSets: [{ reps: 10, weight: 50 }],
        }),
        { name: 'Fondos', status: 'skip', prev: null, cur: null, sets: [] },
      ],
      completedCount: 1,
      total: 2,
    })
    expect(text).toContain('*Play Back Gym — Empuje*')
    expect(text).toContain('⬆️ *Press* — Mejoraste')
    expect(text).toContain('Serie 1: de 10 reps 50 kg a 8 reps 60 kg')
    expect(text).toContain('⚠️ *Fondos* — No lo registraste')
    expect(text).toContain('✅ 1/2 ejercicios completados')
    expect(text).toContain('_Play Back Gym — una idea de LUKAMON_')
  })
})
