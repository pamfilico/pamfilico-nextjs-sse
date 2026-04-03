/**
 * Integration test for the SSE flow.
 *
 * Flow tested:
 *   1. Connect to GET /api/events (SSE stream)
 *   2. POST to /api/trigger with {eventName, payload}
 *   3. Verify the event arrives on the SSE stream
 *
 * This simulates: backend emit_event() -> /api/trigger -> /api/events -> browser
 *
 * Usage: node test-sse-flow.mjs [base_url]
 */

import EventSource from 'eventsource'

const BASE_URL = process.argv[2] || 'http://localhost:3099'
const TIMEOUT = 10000
let exitCode = 0
let passed = 0
let failed = 0

function log(msg) {
  console.log(`  ${msg}`)
}

async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`PASS  ${name}`)
  } catch (err) {
    failed++
    exitCode = 1
    console.log(`FAIL  ${name}`)
    console.log(`      ${err.message}`)
  }
}

function waitForEvent(eventSource, eventName, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event "${eventName}" after ${timeoutMs}ms`))
    }, timeoutMs)

    eventSource.addEventListener(eventName, (event) => {
      clearTimeout(timer)
      resolve(JSON.parse(event.data))
    })
  })
}

async function triggerEvent(eventName, payload) {
  const resp = await fetch(`${BASE_URL}/api/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventName, payload }),
  })
  if (!resp.ok) throw new Error(`Trigger failed: ${resp.status}`)
  return resp.json()
}

// --- Tests ---

await test('POST /api/trigger returns success', async () => {
  const result = await triggerEvent('test_hello', { message: 'world' })
  if (!result.success) throw new Error(`Expected success, got: ${JSON.stringify(result)}`)
  if (result.eventName !== 'test_hello') throw new Error(`Expected eventName test_hello`)
})

await test('POST /api/trigger rejects missing eventName', async () => {
  const resp = await fetch(`${BASE_URL}/api/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload: {} }),
  })
  if (resp.status !== 400) throw new Error(`Expected 400, got ${resp.status}`)
})

await test('SSE stream: connect and receive connection confirmation', async () => {
  const es = new EventSource(`${BASE_URL}/api/events`)

  const data = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      es.close()
      reject(new Error('Timeout waiting for connection confirmation'))
    }, 5000)

    es.onmessage = (event) => {
      clearTimeout(timer)
      es.close()
      resolve(JSON.parse(event.data))
    }
  })

  if (!data.connected) throw new Error('Expected {connected: true}')
})

await test('SSE flow: trigger event -> receive on stream (favorite toggle)', async () => {
  const es = new EventSource(`${BASE_URL}/api/events`)

  // Wait for connection
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timeout')), 5000)
    es.onmessage = () => { clearTimeout(timer); resolve() }
  })

  // Listen for the specific event
  const eventPromise = waitForEvent(es, 'updated_favorite_abc123')

  // Small delay to ensure listener is registered
  await new Promise((r) => setTimeout(r, 100))

  // Trigger the event (simulates backend emit_event)
  await triggerEvent('updated_favorite_abc123', {
    document_id: 'abc123',
    is_favorite: true,
    updated_at: '2024-06-15T14:30:00Z',
  })

  const data = await eventPromise
  es.close()

  if (data.payload.document_id !== 'abc123') throw new Error('Wrong document_id')
  if (data.payload.is_favorite !== true) throw new Error('Wrong is_favorite')
})

await test('SSE flow: trigger event -> receive on stream (table refresh)', async () => {
  const es = new EventSource(`${BASE_URL}/api/events`)

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timeout')), 5000)
    es.onmessage = () => { clearTimeout(timer); resolve() }
  })

  const eventPromise = waitForEvent(es, 'updated_favorites_table')
  await new Promise((r) => setTimeout(r, 100))

  await triggerEvent('updated_favorites_table', { status: 'ok' })

  const data = await eventPromise
  es.close()

  if (data.payload.status !== 'ok') throw new Error('Wrong status')
})

await test('SSE flow: trigger event -> receive on stream (contract completed)', async () => {
  const es = new EventSource(`${BASE_URL}/api/events`)

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timeout')), 5000)
    es.onmessage = () => { clearTimeout(timer); resolve() }
  })

  const eventPromise = waitForEvent(es, 'contract_updated_xyz456')
  await new Promise((r) => setTimeout(r, 100))

  await triggerEvent('contract_updated_xyz456', {
    contract_id: 'xyz456',
    status: 'completed',
  })

  const data = await eventPromise
  es.close()

  if (data.payload.contract_id !== 'xyz456') throw new Error('Wrong contract_id')
  if (data.payload.status !== 'completed') throw new Error('Wrong status')
})

await test('SSE flow: multiple events on same stream', async () => {
  const es = new EventSource(`${BASE_URL}/api/events`)

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timeout')), 5000)
    es.onmessage = () => { clearTimeout(timer); resolve() }
  })

  const event1Promise = waitForEvent(es, 'event_a')
  const event2Promise = waitForEvent(es, 'event_b')
  await new Promise((r) => setTimeout(r, 100))

  await triggerEvent('event_a', { value: 1 })
  await triggerEvent('event_b', { value: 2 })

  const [data1, data2] = await Promise.all([event1Promise, event2Promise])
  es.close()

  if (data1.payload.value !== 1) throw new Error('event_a wrong value')
  if (data2.payload.value !== 2) throw new Error('event_b wrong value')
})

// --- Summary ---

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(exitCode)
