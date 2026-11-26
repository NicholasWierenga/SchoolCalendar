import assert from 'node:assert/strict'
import test from 'node:test'
import { api } from './api.js'

test('accepts the empty 200 response from the health endpoint', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 200 }))
  assert.equal(await api('/health'), null)
})
