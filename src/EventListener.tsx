"use client"

import { useEffect, useState, useRef, ReactNode } from 'react'

export interface EventListenerProps {
  /** The SSE event name to listen for (e.g., "document_processed") */
  eventName: string
  /** Auto-dismiss the payload after displaying (default: true) */
  autoDismiss?: boolean
  /** Delay in ms before auto-dismissing (default: 5000) */
  dismissDelay?: number
  /** Delay in ms before reconnecting after error (default: 1000) */
  reconnectDelay?: number
  /** Render prop — receives the latest payload */
  children?: (payload: Record<string, unknown> | null) => ReactNode
  /** Show connection status text (default: false) */
  showStatus?: boolean
}

/**
 * Standalone SSE event listener component. Creates its own EventSource
 * connection (independent of SSEProvider). Use for isolated listeners
 * or components that need their own connection lifecycle.
 *
 * @example
 * // Render prop pattern
 * <EventListener eventName="contract_updated_123">
 *   {(payload) => payload ? <Alert>Updated!</Alert> : null}
 * </EventListener>
 */
export default function EventListener({
  eventName,
  autoDismiss = true,
  dismissDelay = 5000,
  reconnectDelay = 1000,
  children,
  showStatus = false,
}: EventListenerProps) {
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    let isMounted = true

    const connect = () => {
      if (!isMounted) return

      const eventSource = new EventSource('/api/events')
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setConnected(true)
        setError(null)
      }

      eventSource.onmessage = (event) => {
        try {
          JSON.parse(event.data)
        } catch {}
      }

      eventSource.addEventListener(eventName, (event: any) => {
        try {
          const data = JSON.parse(event.data)
          setPayload(data.payload)
          if (autoDismiss) {
            setTimeout(() => setPayload(null), dismissDelay)
          }
        } catch {}
      })

      eventSource.onerror = () => {
        setError('Reconnecting...')
        setConnected(false)
        eventSource.close()
        if (isMounted) setTimeout(connect, reconnectDelay)
      }
    }

    connect()

    return () => {
      isMounted = false
      eventSourceRef.current?.close()
    }
  }, [eventName, autoDismiss, dismissDelay, reconnectDelay])

  if (children) return <>{children(payload)}</>

  return (
    <>
      {showStatus && (
        <span>
          Listening: <strong>{eventName}</strong>
          {connected && ' (connected)'}
          {error && ` (${error})`}
        </span>
      )}
      {payload && <span>{JSON.stringify(payload)}</span>}
    </>
  )
}
