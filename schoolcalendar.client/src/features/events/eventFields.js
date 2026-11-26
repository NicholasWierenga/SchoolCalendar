export const builtInImages = {
  football: { label: 'Football', symbol: '🏈' },
  trophy: { label: 'Trophy', symbol: '🏆' },
}

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

export function changedEventFields(event, values) {
  const before = eventFields(event)
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => before[key] !== value))
}

export function formatEventSchedule({ date, time }) {
  // Event dates and times are stored without a time zone.
  const schedule = new Date(`${date}T${time}:00Z`)
  return schedule.toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
