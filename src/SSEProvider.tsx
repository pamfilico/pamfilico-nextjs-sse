"use client"

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'

type EventCallback = (payload: Record<string, unknown>) => void

interface SSEContextValue {
  subscribe: (eventName: string, callback: EventCallback) => () => void
  isConnected: boolean
}

const SSEContext = createContext<SSEContextValue | null>(null)

/**
 * SSEProvider — wrap your app (in the root layout) to maintain a single
 * EventSource connection shared by all components. Handles reconnection
 * with exponential backoff (max 30s).
 *
 * @example
 * // app/[locale]/layout.tsx
 * import { SSEProvider } from '@pamfilico/nextjs-sse'
 *
 * export default function Layout({ children }) {
 *   return <SSEProvider>{children}</SSEProvider>
 * }
 */
export function SSEProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const subscribersRef = useRef<Map<string, Set<EventCallback>>>(new Map())
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttempts = useRef(0)

  useEffect(() => {
    let isMounted = true

    const connect = () => {
      if (!isMounted) return

      const eventSource = new EventSource('/api/events')
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        setIsConnected(true)
        reconnectAttempts.current = 0
      }

      eventSource.onmessage = (event) => {
        try {
          JSON.parse(event.data)
        } catch {}
      }

      const handleCustomEvent = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          const subscribers = subscribersRef.current.get(event.type)
          subscribers?.forEach((callback) => callback(data.payload))
        } catch {}
      }

      // Register listeners for all subscribed event names
      const updateEventListeners = () => {
        subscribersRef.current.forEach((_, eventName) => {
          eventSource.removeEventListener(eventName, handleCustomEvent)
          eventSource.addEventListener(eventName, handleCustomEvent)
        })
      }

      updateEventListeners()
      ;(eventSource as any).__updateListeners = updateEventListeners

      eventSource.onerror = () => {
        setIsConnected(false)
        eventSource.close()
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
        reconnectAttempts.current++
        if (isMounted) {
          reconnectTimeoutRef.current = setTimeout(connect, delay)
        }
      }
    }

    connect()

    return () => {
      isMounted = false
      eventSourceRef.current?.close()
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      subscribersRef.current.clear()
    }
  }, [])

  const subscribe = (eventName: string, callback: EventCallback) => {
    if (!subscribersRef.current.has(eventName)) {
      subscribersRef.current.set(eventName, new Set())
    }
    subscribersRef.current.get(eventName)!.add(callback)

    // Register EventSource listener for this event
    if (eventSourceRef.current && (eventSourceRef.current as any).__updateListeners) {
      ;(eventSourceRef.current as any).__updateListeners()
    }

    return () => {
      const subs = subscribersRef.current.get(eventName)
      subs?.delete(callback)
      if (subs?.size === 0) subscribersRef.current.delete(eventName)
    }
  }

  return <SSEContext.Provider value={{ subscribe, isConnected }}>{children}</SSEContext.Provider>
}

export function useSSEContext() {
  const context = useContext(SSEContext)
  if (!context) throw new Error('useSSEContext must be used within SSEProvider')
  return context
}
