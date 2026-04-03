import { sseEmitter } from './eventEmitter'

let initialized = false

export async function initRedisSubscriber(): Promise<void> {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl || initialized) return

  if ((globalThis as any).__redisSubInitialized) {
    initialized = true
    return
  }

  const Redis = (await import('ioredis')).default
  const appName = process.env.APP_NAME || 'app'
  const sseChannel = process.env.SSE_CHANNEL || 'sse_events'
  const channel = `${appName}:${sseChannel}`

  const subscriber = new Redis(redisUrl)

  subscriber.subscribe(channel).then(() => {
    console.log(`Subscribed to Redis channel: ${channel}`)
  }).catch((err: Error) => {
    console.error(`Redis subscribe error:`, err)
  })

  subscriber.on('message', (_ch: string, message: string) => {
    try {
      const { eventName, payload } = JSON.parse(message)
      sseEmitter.emit('broadcast', { eventName, payload })
    } catch (err) {
      console.error('Failed to parse Redis message:', err)
    }
  })

  ;(globalThis as any).__redisSubInitialized = true
  initialized = true
}
