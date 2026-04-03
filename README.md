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
| `useSSEContext()` | Hook | Access `{ subscribe, isConnected }` |

---

## How it works

```
Python backend
    ↓ requests.post(NEXTAUTH_URL + "/api/trigger", {eventName, payload})
    ↓
POST /api/trigger
    ↓ sseEmitter.emit('broadcast', {eventName, payload})
    ↓
GET /api/events (SSE ReadableStream)
    ↓ event: updated_favorite_123
    ↓ data: {"payload": {"is_favorite": true}}
    ↓
Browser EventSource (managed by SSEProvider)
    ↓ eventSource.addEventListener("updated_favorite_123", handler)
    ↓
useSSEEvent("updated_favorite_123") → sets state → component re-renders
```

---

## Testing

```bash
./run-tests.sh     # Docker: builds Next.js app, runs SSE flow tests
```

Tests verify:
- POST /api/trigger returns success
- POST /api/trigger rejects missing eventName
- SSE stream connects and sends confirmation
- Trigger event → receive on SSE stream (favorite toggle flow)
- Trigger event → receive on SSE stream (table refresh flow)
- Trigger event → receive on SSE stream (contract completion flow)
- Multiple events on same stream

---

## Backend counterpart

Install [`pamfilico-python-sse`](../pamfilico-python-sse/) for the Flask side (`emit_event()` function).

---

## Scaling

The current design uses an **in-memory `EventEmitter`** to bridge `/api/trigger` and `/api/events`. This works perfectly with a single Next.js instance.

### When it breaks

With 2+ Next.js instances behind a load balancer, a user's SSE connection may be on instance 1 while the backend POSTs the event to instance 2. The in-memory emitter only broadcasts within its own process, so the user never receives the event.

### Fix: Redis Pub/Sub between instances

Replace the in-memory `EventEmitter` with Redis pub/sub:

```
Flask → POST /api/trigger (any instance)
    ↓
Redis PUBLISH "{app_name}:sse_events" channel
    ↓
All Next.js instances SUBSCRIBE to "{app_name}:sse_events"
    ↓
Each instance broadcasts to its own connected SSE clients
```

The channel name must include the app name (e.g., `docufast:sse_events`) so multiple apps sharing the same Redis don't cross-contaminate events.

### When do you need this?

| Setup | Current design works? |
|-------|----------------------|
| 1 Next.js process | Yes |
| 2+ instances + sticky sessions | Yes, but fragile |
| 2+ instances + round-robin LB | No — need Redis |

### TODO

- [ ] Add Redis pub/sub adapter as an option (`REDIS_URL` env var)
- [ ] Support configurable transport (in-memory for dev, Redis for prod)
- [ ] Add health endpoint for SSE connection count monitoring

---

## License

MIT
