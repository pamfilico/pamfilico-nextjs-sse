import { EventEmitter } from 'events'

/**
 * Singleton EventEmitter for SSE event broadcasting.
 * Used to communicate between API routes (/api/trigger -> /api/events).
 * Uses globalThis to ensure single instance across HMR reloads in development.
 */
class SSEEmitter extends EventEmitter {
  private constructor() {
    super()
    this.setMaxListeners(0) // unlimited concurrent clients
  }

  static getInstance(): SSEEmitter {
    if (!(globalThis as any).__sseEmitter) {
      ;(globalThis as any).__sseEmitter = new SSEEmitter()
    }
    return (globalThis as any).__sseEmitter
  }

  getId(): string {
    return (this as any)._emitterId || ((this as any)._emitterId = Math.random().toString(36))
  }
}

export const sseEmitter = SSEEmitter.getInstance()
