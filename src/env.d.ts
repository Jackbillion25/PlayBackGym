/// <reference types="astro/client" />
/// <reference types="vite-plugin-pwa/info" />

declare global {
  namespace App {
    interface Locals {
      user: import('./server/auth').User | null
      session: import('./server/auth').Session | null
    }
  }
}

export {}
