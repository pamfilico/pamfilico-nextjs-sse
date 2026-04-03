# Pamfilico Next.js SSE

SSE infrastructure for Next.js frontends. Provides the `SSEProvider`, `useSSEEvent` hook, `EventListener` component, and the two API routes (`/api/trigger` + `/api/events`) that receive events from a Python backend and stream them to all connected browser tabs.

**Used by:** Coming soon

## Installation

```bash
npm install git+https://github.com/pamfilico/pamfilico-nextjs-sse.git
```

---

## Quick Start

### 1. Add SSEProvider to your layout

Wrap your app so all components share a single EventSource connection:

```tsx
// app/[locale]/layout.tsx
import { SSEProvider } from '@pamfilico/nextjs-sse'

export default function LocaleLayout({ children }) {
  return (
    <SSEProvider>
      {children}
    </SSEProvider>
  )
}
```

### 2. Create the API routes

**`app/api/trigger/route.ts`** — webhook that receives events from the Python backend:

```typescript
import { NextResponse } from 'next/server'
import { sseEmitter } from '@/lib/eventEmitter'

export async function POST(request: Request) {
  const { eventName, payload } = await request.json()
  if (!eventName) {
    return NextResponse.json({ error: 'eventName is required' }, { status: 400 })
  }
  sseEmitter.emit('broadcast', { eventName, payload })
  return NextResponse.json({ success: true, eventName })
}
```

**`app/api/events/route.ts`** — SSE stream endpoint:

```typescript
import { sseEmitter } from '@/lib/eventEmitter'

export async function GET(request: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ connected: true })}\n\n`))

      const handleBroadcast = (data: { eventName: string; payload: any }) => {
        const message = `event: ${data.eventName}\ndata: ${JSON.stringify({ payload: data.payload })}\n\n`
        try { controller.enqueue(encoder.encode(message)) } catch {}
      }

      sseEmitter.on('broadcast', handleBroadcast)

      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': keep-alive\n\n')) } catch {}
      }, 15000)

      request.signal.addEventListener('abort', () => {
        clearInterval(keepAlive)
        sseEmitter.removeListener('broadcast', handleBroadcast)
        try { controller.close() } catch {}
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
```

**`lib/eventEmitter.ts`** — re-export the singleton:

```typescript
export { sseEmitter } from '@pamfilico/nextjs-sse'
```

### 3. Use in components

**Button with SSE (FavoriteToggle pattern):**

```tsx
import { useSSEEvent } from '@pamfilico/nextjs-sse'

function FavoriteToggle({ documentId, currentValue }) {
  const [isFavorite, setIsFavorite] = useState(currentValue ?? false)

  // Subscribe to SSE events for this specific document
  const ssePayload = useSSEEvent(`updated_favorite_${documentId}`)

  // Update state when SSE event arrives
  useEffect(() => {
    if (ssePayload?.is_favorite !== undefined) {
      setIsFavorite(ssePayload.is_favorite as boolean)
    }
  }, [ssePayload])

  const handleToggle = async () => {
    const newState = !isFavorite
    setIsFavorite(newState) // optimistic update
    try {
      await axios.patch(`/api/v1/document/${documentId}/favorite`, { is_favorite: newState })
    } catch {
      setIsFavorite(!newState) // revert on error
    }
  }

  return (
    <IconButton onClick={handleToggle}>
      {isFavorite ? <Star color="warning" /> : <StarBorder />}
    </IconButton>
  )
}
```

**Chip with SSE (LegalReferenceChip pattern):**

```tsx
import { useSSEEvent } from '@pamfilico/nextjs-sse'

function LegalReferenceChip({ documentId, currentValue }) {
  const [ref, setRef] = useState(currentValue ?? null)
  const ssePayload = useSSEEvent(`updated_legal_reference_${documentId}`)

  useEffect(() => {
    if (ssePayload?.legal_document_reference !== undefined) {
      setRef(ssePayload.legal_document_reference as string | null)
    }
  }, [ssePayload])

  return ref ? <Chip icon={<Gavel />} label={ref} /> : <span>No reference</span>
}
```

**Refetch on event (ContractDetail pattern):**

```tsx
import { EventListener } from '@pamfilico/nextjs-sse'

function ContractDetail({ contractId }) {
  const [data, setData] = useState(null)
  const fetchAll = () => { /* refetch contract data */ }

  return (
    <>
      <EventListener eventName={`contract_updated_${contractId}`}>
        {(payload) => { if (payload) fetchAll(); return null; }}
      </EventListener>
      {/* ... render contract ... */}
    </>
  )
}
```

---

## Generate project scaffolding

```bash
cookiecutter packages/pamfilico-nextjs-sse/cookiecutter/
```

Generates:

```
frontend/src/
├── lib/eventEmitter.ts              # Singleton emitter
├── hooks/useSSEEvent.ts             # Hook re-export
├── components/EventListener.tsx     # Component re-export
├── app/
│   ├── api/trigger/route.ts         # POST webhook (backend -> emitter)
│   ├── api/events/route.ts          # GET SSE stream endpoint
│   └── [locale]/layout.tsx          # Layout with SSEProvider
```

---

## API reference

| Export | Type | Description |
|--------|------|-------------|
| `SSEProvider` | Component | Context provider — wrap your layout |
| `useSSEEvent(eventName)` | Hook | Subscribe to a named event, returns payload or null |
| `EventListener` | Component | Standalone SSE listener with render-prop |
| `sseEmitter` | EventEmitter | Singleton for API route communication |
| `initRedisSubscriber()` | Function | Start Redis subscriber (no-op if no REDIS_URL) |
| `useSSEContext()` | Hook | Access `{ subscribe, isConnected }` |

---

## How it works

**Default (no Redis):**

```
Python backend → POST /api/trigger → sseEmitter → /api/events → Browser
```

**With Redis (`REDIS_URL` set):**

```
Python backend → Redis PUBLISH "{APP_NAME}:sse_events"
    ↓
Next.js initRedisSubscriber() → sseEmitter → /api/events → Browser
```

Both HTTP trigger and Redis work simultaneously — existing `/api/trigger` still works alongside Redis.

---

## Redis mode

Install ioredis:

```bash
npm install ioredis
```

Call `initRedisSubscriber()` once in your `/api/events` route:

```typescript
// app/api/events/route.ts
import { sseEmitter } from '@/lib/eventEmitter'
import { initRedisSubscriber } from '@pamfilico/nextjs-sse'

initRedisSubscriber()

export const dynamic = 'force-dynamic'
// ... rest of route
```

Set environment variables:

```bash
REDIS_URL=redis://localhost:6379
APP_NAME=docufast        # channel prefix (default: "app")
```

Add to `next.config.ts`:

```typescript
const nextConfig = {
  serverExternalPackages: ['ioredis'],
}
```

That's it. The subscriber feeds Redis messages into the same `sseEmitter` — no other changes needed.

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | (unset) | If set, subscribes to Redis for events |
| `APP_NAME` | `app` | Redis channel prefix |
| `SSE_CHANNEL` | `sse_events` | Redis channel suffix |

---

## Testing

```bash
./run-tests.sh     # Docker: builds Next.js + Redis, runs all tests
```

Tests verify:
- **HTTP flow (7 tests):** trigger → SSE stream (favorite, table refresh, contract, multiple events)
- **Redis flow (4 tests):** Redis publish → SSE stream, HTTP still works alongside, multiple publishes, complex payloads

---

## Backend counterpart

Install [`pamfilico-python-sse`](../pamfilico-python-sse/) for the Flask side (`emit_event()` — supports both HTTP and Redis modes).

---

## License

MIT
