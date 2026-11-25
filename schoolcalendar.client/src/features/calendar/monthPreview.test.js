import assert from 'node:assert/strict'
import test from 'node:test'
import { monthOverflowLabel, monthPreview } from './monthPreview.js'

test('keeps the earliest pending event when a single published event leaves a preview slot', () => {
  const earlyPending = { id: 1, time: '08:00', status: 'pending' }
  const laterPending = { id: 2, time: '10:00', status: 'pending' }
  const published = { id: 3, time: '15:00', status: 'approved' }
  const preview = monthPreview([earlyPending, laterPending, published])

  assert.deepEqual(preview.visible, [earlyPending, published])
  assert.deepEqual(preview.hidden, [laterPending])
  assert.equal(monthOverflowLabel(preview.hiddenPublished, preview.hiddenPending), '+1 pending')
})

test('fills both preview slots with published events and counts each hidden status', () => {
  const earlyPending = { id: 1, time: '08:00', status: 'pending' }
  const firstPublished = { id: 2, time: '09:00', status: 'approved' }
  const secondPublished = { id: 3, time: '10:00', status: 'approved' }
  const laterPending = { id: 4, time: '11:00', status: 'pending' }
  const lastPublished = { id: 5, time: '14:00', status: 'approved' }
  const preview = monthPreview([earlyPending, firstPublished, secondPublished, laterPending, lastPublished])

  assert.deepEqual(preview.visible, [firstPublished, secondPublished])
  assert.deepEqual(preview.hidden, [earlyPending, laterPending, lastPublished])
  assert.equal(monthOverflowLabel(preview.hiddenPublished, preview.hiddenPending), '1 more published · 2 pending')
  assert.equal(monthOverflowLabel(8, 0), '+8 more')
})
