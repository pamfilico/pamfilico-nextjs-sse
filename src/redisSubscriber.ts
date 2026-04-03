import { sseEmitter } from './eventEmitter'

let initialized = false

/**
 * Start a Redis subscriber that feeds events into the local SSE emitter.
 * No-op if REDIS_URL is not set or ioredis is not installed.
 * Call once at app startup (e.g., top of /api/events route).
 *
 * Channel format: {APP_NAME}:{SSE_CHANNEL} (default: "app:sse_events")
 *
 * @example
 * // In app/api/events/route.ts:
 * import { initRedisSubscriber } from '@pamfilico/nextjs-sse'
 * initRedisSubscriber()
 */
export async function initRedisSubscriber(): Promise<void> {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl || initialized) return

  if ((globalThis as any).__redisSubInitialized) {
    initialized = true
    return
  }

  let Redis: any
  try {
    Redis = (await import('ioredis')).default
  } catch {
    console.warn(
      '[@pamfilico/nextjs-sse] ioredis not installed — Redis transport disabled. Install with: npm install ioredis'
    )
    return
  }

  const appName = process.env.APP_NAME || 'app'
  const sseChannel = process.env.SSE_CHANNEL || 'sse_events'
  const channel = `${appName}:${sseChannel}`

  const subscriber = new Redis(redisUrl)

  subscriber.subscribe(channel).then(() => {
    console.log(`[@pamfilico/nextjs-sse] Subscribed to Redis channel: ${channel}`)
  }).catch((err: Error) => {
    console.error(`[@pamfilico/nextjs-sse] Redis subscribe error:`, err)
  })

  subscriber.on('message', (_ch: string, message: string) => {
    try {
      const { eventName, payload } = JSON.parse(message)
      sseEmitter.emit('broadcast', { eventName, payload })
    } catch (err) {
      console.error('[@pamfilico/nextjs-sse] Failed to parse Redis message:', err)
    }
  })

  ;(globalThis as any).__redisSubInitialized = true
  initialized = true
}
