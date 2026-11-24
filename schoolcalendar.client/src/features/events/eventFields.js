export function eventFields(event) {
  return {
    title: event.title,
    date: event.date,
    time: event.time,
    locationId: event.locationId ?? null,
    description: event.description ?? '',
    image: event.image ?? null,
  }
}

export function changedFields(before, after) {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) => before[key] !== value))
}

export function localSchedule(event) {
  const date = new Date(event.date + 'T' + event.time + ':00Z')
  return date.toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
