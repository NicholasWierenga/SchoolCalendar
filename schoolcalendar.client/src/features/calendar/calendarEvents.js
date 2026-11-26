export const dailyCapacity = 10

export function groupEvents(events) {
  const byDate = new Map()
  for (const event of events) {
    if (!byDate.has(event.date)) byDate.set(event.date, [])
    byDate.get(event.date).push(event)
  }
  for (const day of byDate.values()) {
    day.sort((a, b) => a.time.localeCompare(b.time)
      || Number(a.status === 'pending') - Number(b.status === 'pending')
      || a.title.localeCompare(b.title) || a.id - b.id)
  }
  return byDate
}

export function publishedCount(events) {
  return events.filter(event => event.status === 'approved').length
}

export function eventOwnershipLabel(event) {
  if (event.status === 'approved' && event.isOwn === true) return 'Submitted by you'
}
