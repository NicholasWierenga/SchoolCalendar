import assert from 'node:assert/strict'
import test from 'node:test'
import { formatTime, monthGridRange, shiftDay, shiftMonth } from './calendarDates.js'

test('requests every date rendered in the Sunday-first month grid', () => {
  assert.deepEqual(monthGridRange('2027-04-16'), { from: '2027-03-28', to: '2027-05-01' })
  assert.deepEqual(monthGridRange('2026-02-01'), { from: '2026-02-01', to: '2026-02-28' })
  assert.deepEqual(monthGridRange('2024-02-29'), { from: '2024-01-28', to: '2024-03-02' })
})

test('navigates date boundaries without using the browser time zone', () => {
  assert.equal(shiftDay('2024-02-28', 1), '2024-02-29')
  assert.equal(shiftDay('2024-02-29', 1), '2024-03-01')
  assert.equal(shiftMonth('2027-12-31', 1), '2028-01-01')
  assert.equal(shiftMonth('2027-01-31', -1), '2026-12-01')
  assert.equal(formatTime('00:00'), '12:00 AM')
  assert.equal(formatTime('12:00'), '12:00 PM')
  assert.equal(formatTime('23:59'), '11:59 PM')
})
