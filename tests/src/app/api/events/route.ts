import { sseEmitter } from '@/lib/eventEmitter'
import { initRedisSubscriber } from '@/lib/redisSubscriber'

// Initialize Redis subscriber if REDIS_URL is set
initRedisSubscriber()

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ connected: true })}\n\n`))

      const handleBroadcast = (data: { eventName: string; payload: any }) => {
        const message = `event: ${data.eventName}\ndata: ${JSON.stringify({ payload: data.payload })}\n\n`
        try {
          controller.enqueue(encoder.encode(message))
        } catch {}
      }

      sseEmitter.on('broadcast', handleBroadcast)

      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'))
        } catch {}
      }, 15000)

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        sseEmitter.removeListener('broadcast', handleBroadcast)
        try {
          controller.close()
        } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
