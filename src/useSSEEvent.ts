"use client"

import { useEffect, useState } from 'react'
import { useSSEContext } from './SSEProvider'

/**
 * Subscribe to a named SSE event. Returns the latest payload or null.
 *
 * @example
 * const payload = useSSEEvent(`updated_favorite_${documentId}`)
 *
 * useEffect(() => {
 *   if (payload?.is_favorite !== undefined) {
 *     setIsFavorite(payload.is_favorite as boolean)
 *   }
 * }, [payload])
 */
export function useSSEEvent(eventName: string): Record<string, unknown> | null {
  const { subscribe } = useSSEContext()
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    const unsubscribe = subscribe(eventName, (newPayload) => {
      setPayload(newPayload)
    })
    return () => unsubscribe()
  }, [eventName, subscribe])

  return payload
}
