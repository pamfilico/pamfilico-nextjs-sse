import { sseEmitter } from '@/lib/eventEmitter'

export const dynamic = 'force-dynamic'

/**
 * GET /api/events
 * Server-Sent Events endpoint. Each connected browser tab gets its own stream.
 * Events are broadcast from /api/trigger via the shared sseEmitter singleton.
 */
export async function GET(request: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Connection confirmation
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ connected: true })}\n\n`))

      // Forward broadcast events to this client
      const handleBroadcast = (data: { eventName: string; payload: any }) => {
        const message = `event: ${data.eventName}\ndata: ${JSON.stringify({ payload: data.payload })}\n\n`
        try {
          controller.enqueue(encoder.encode(message))
        } catch {}
      }

      sseEmitter.on('broadcast', handleBroadcast)

      // Keep-alive ping every 15 seconds
      const keepAlive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'))
        } catch {}
      }, 15000)

      // Cleanup on disconnect
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
