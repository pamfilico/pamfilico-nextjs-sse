/**
 * Integration tests for Redis → SSE flow.
 *
 * Flow tested:
 *   1. Connect to GET /api/events (SSE stream)
 *   2. Publish directly to Redis channel
 *   3. Verify the event arrives on the SSE stream
 *
 * This simulates: backend Redis PUBLISH → Next.js subscriber → SSE stream → browser
 *
 * Usage: node test-sse-redis-flow.mjs [base_url] [redis_url]
 */

import EventSource from 'eventsource'
import Redis from 'ioredis'

const BASE_URL = process.argv[2] || 'http://localhost:3099'
const REDIS_URL = process.argv[3] || 'redis://localhost:6399'
const CHANNEL = `${process.env.APP_NAME || 'app'}:${process.env.SSE_CHANNEL || 'sse_events'}`

let exitCode = 0
let passed = 0
let failed = 0

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

function waitForConnection(eventSource, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)
    eventSource.onmessage = () => { clearTimeout(timer); resolve() }
  })
}

// --- Tests ---

const redis = new Redis(REDIS_URL)

await test('Redis publish → SSE stream receives event', async () => {
  const es = new EventSource(`${BASE_URL}/api/events`)
  await waitForConnection(es)

  const eventPromise = waitForEvent(es, 'redis_favorite_test')
  await new Promise((r) => setTimeout(r, 200))

  await redis.publish(CHANNEL, JSON.stringify({
    eventName: 'redis_favorite_test',
    payload: { document_id: 'redis-123', is_favorite: true },
  }))

  const data = await eventPromise
  es.close()

  if (data.payload.document_id !== 'redis-123') throw new Error('Wrong document_id')
  if (data.payload.is_favorite !== true) throw new Error('Wrong is_favorite')
})

await test('HTTP trigger still works alongside Redis', async () => {
  const es = new EventSource(`${BASE_URL}/api/events`)
  await waitForConnection(es)

  const eventPromise = waitForEvent(es, 'http_test_event')
  await new Promise((r) => setTimeout(r, 200))

  const resp = await fetch(`${BASE_URL}/api/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventName: 'http_test_event', payload: { source: 'http' } }),
  })
  if (!resp.ok) throw new Error(`Trigger failed: ${resp.status}`)

  const data = await eventPromise
  es.close()

  if (data.payload.source !== 'http') throw new Error('Wrong source')
})

await test('Multiple Redis publishes all arrive', async () => {
  const es = new EventSource(`${BASE_URL}/api/events`)
  await waitForConnection(es)

  const event1Promise = waitForEvent(es, 'multi_a')
  const event2Promise = waitForEvent(es, 'multi_b')
  const event3Promise = waitForEvent(es, 'multi_c')
  await new Promise((r) => setTimeout(r, 200))

  await redis.publish(CHANNEL, JSON.stringify({ eventName: 'multi_a', payload: { n: 1 } }))
  await redis.publish(CHANNEL, JSON.stringify({ eventName: 'multi_b', payload: { n: 2 } }))
  await redis.publish(CHANNEL, JSON.stringify({ eventName: 'multi_c', payload: { n: 3 } }))

  const [d1, d2, d3] = await Promise.all([event1Promise, event2Promise, event3Promise])
  es.close()

  if (d1.payload.n !== 1) throw new Error('multi_a wrong')
  if (d2.payload.n !== 2) throw new Error('multi_b wrong')
  if (d3.payload.n !== 3) throw new Error('multi_c wrong')
})

await test('Redis publish with complex payload', async () => {
  const es = new EventSource(`${BASE_URL}/api/events`)
  await waitForConnection(es)

  const eventPromise = waitForEvent(es, 'contract_completed_xyz')
  await new Promise((r) => setTimeout(r, 200))

  await redis.publish(CHANNEL, JSON.stringify({
    eventName: 'contract_completed_xyz',
    payload: {
      contract_id: 'xyz',
      status: 'completed',
      signers: [{ email: 'a@b.com', signed: true }],
    },
  }))

  const data = await eventPromise
  es.close()

  if (data.payload.status !== 'completed') throw new Error('Wrong status')
  if (data.payload.signers.length !== 1) throw new Error('Wrong signers count')
})

// --- Cleanup ---

await redis.quit()

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(exitCode)
