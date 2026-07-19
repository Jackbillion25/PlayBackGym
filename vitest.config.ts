import { defineConfig } from 'vitest/config'

// Unit tests (funciones puras) corren en Node. Los tests de integración de
// rutas Hono con @cloudflare/vitest-pool-workers se agregarán como proyecto
// aparte (vitest.workers.config.ts) cuando se prueben contra D1 en memoria.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
})
