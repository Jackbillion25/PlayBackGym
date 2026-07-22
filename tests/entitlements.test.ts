import { describe, it, expect } from 'vitest'
import { PRODUCTS, isProductKey } from '../src/server/api/logic/entitlements'

// grantEntitlement/expireEntitlement/revokeEntitlement escriben a D1 vía queries.ts —
// se prueban contra D1 real cuando exista el proyecto de tests de integración con
// @cloudflare/vitest-pool-workers (ver comentario en vitest.config.ts). Aquí solo
// cubrimos el catálogo, que es lógica pura.
describe('isProductKey', () => {
  it('acepta cada key del catálogo', () => {
    for (const key of Object.keys(PRODUCTS)) {
      expect(isProductKey(key)).toBe(true)
    }
  })

  it('rechaza keys fuera del catálogo', () => {
    expect(isProductKey('theme_gold')).toBe(false)
    expect(isProductKey('')).toBe(false)
  })
})
