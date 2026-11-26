import assert from 'node:assert/strict'
import test from 'node:test'
import { groupEvents } from './calendarEvents.js'

test('sorts a day independently and leaves the source list intact', () => {
  const date = '2027-04-16'
  const records = [
    { id: 1, date, time: '17:00', title: 'Concert' },
    { id: 2, date, time: '12:15', title: 'Mural planning' },
    { id: 3, date, time: '12:15', title: 'Chess club' },
    { id: 4, date: '2027-04-17', time: '08:00', title: 'Book swap' },
  ]
  const grouped = groupEvents(records)
  assert.deepEqual(grouped.get(date).map(event => event.id), [3, 2, 1])
  assert.deepEqual(grouped.get('2027-04-17').map(event => event.id), [4])
  assert.deepEqual(records.map(event => event.id), [1, 2, 3, 4])
})

test('orders requests by start time and puts published sessions first when starts match', () => {
  const date = '2027-04-16'
  const records = [
    { id: 1, date, time: '10:15', title: 'Art', status: 'pending' },
    { id: 2, date, time: '08:20', title: 'Poetry', status: 'pending' },
    { id: 3, date, time: '10:15', title: 'Strings', status: 'approved' },
  ]
  assert.deepEqual(groupEvents(records).get(date).map(event => event.id), [2, 3, 1])
})
