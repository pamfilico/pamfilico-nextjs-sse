import { EventEmitter } from 'events'

class SSEEmitter extends EventEmitter {
  private constructor() {
    super()
    this.setMaxListeners(0)
  }

  static getInstance(): SSEEmitter {
    if (!(globalThis as any).__sseEmitter) {
      ;(globalThis as any).__sseEmitter = new SSEEmitter()
    }
    return (globalThis as any).__sseEmitter
  }
}

export const sseEmitter = SSEEmitter.getInstance()
