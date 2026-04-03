import { NextResponse } from 'next/server'
import { sseEmitter } from '@/lib/eventEmitter'

export const dynamic = 'force-dynamic'

/**
 * POST /api/trigger
 * Receives events from Python backend and broadcasts to SSE listeners.
 *
 * Body: { "eventName": "updated_favorite_123", "payload": {...} }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { eventName, payload } = body

    if (!eventName) {
      return NextResponse.json({ error: 'eventName is required' }, { status: 400 })
    }

    sseEmitter.emit('broadcast', { eventName, payload })

    return NextResponse.json({ success: true, eventName })
  } catch (error) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
