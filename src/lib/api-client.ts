import { hc } from 'hono/client'
import type { AppType } from '../server/api'

// Cliente Hono RPC tipado end-to-end (sin codegen). Las islas lo importan.
function baseUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:4321'
}

export const client = hc<AppType>(baseUrl())

// Handle directo al grupo /api (rpc.days.$post, rpc.routine.$get, …)
export const rpc = client.api

// Helper: desempaqueta { success, data } | { success:false, error } y lanza en error.
export async function unwrap<T>(res: Response): Promise<T> {
  const body = (await res.json()) as
    | { success: true; data: T }
    | { success: false; error: { code: string; message: string } }
  if (!body.success) throw new Error(body.error.message)
  return body.data
}
