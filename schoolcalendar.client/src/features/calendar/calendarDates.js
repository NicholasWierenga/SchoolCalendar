const monthOptions = { month: 'long', year: 'numeric' }
const dayOptions = { weekday: 'long', month: 'long', day: 'numeric' }
const shortDayOptions = { weekday: 'short', month: 'short', day: 'numeric' }

export const initialDate = '2027-04-16'
export const monthEventLimit = 2
export const dailyCapacity = 10

function dateObject(date) {
  return new Date(`${date}T12:00:00Z`)
}

export function dateKey(date) {
  return date.toISOString().slice(0, 10)
}

export function monthStart(date) {
  return `${date.slice(0, 7)}-01`
}

export function shiftMonth(date, distance) {
  const month = dateObject(monthStart(date))
  month.setUTCMonth(month.getUTCMonth() + distance)
  return dateKey(month)
}

export function shiftDay(date, distance) {
  const day = dateObject(date)
  day.setUTCDate(day.getUTCDate() + distance)
  return dateKey(day)
}

export function monthGridRange(month) {
  const first = monthStart(month)
  const last = shiftDay(shiftMonth(first, 1), -1)
  return {
    from: shiftDay(first, -dateObject(first).getUTCDay()),
    to: shiftDay(last, 6 - dateObject(last).getUTCDay()),
  }
}

function formatDate(date, options) {
  return dateObject(date).toLocaleDateString('en-US', { ...options, timeZone: 'UTC' })
}

export const formatMonth = date => formatDate(date, monthOptions)
export const formatDay = date => formatDate(date, dayOptions)
export const formatShortDay = date => formatDate(date, shortDayOptions)

export function formatTimeParts(time) {
  const [hour, minute] = time.split(':')
  const hours = Number(hour)
  return { clock: `${hours % 12 || 12}:${minute}`, period: hours < 12 ? 'AM' : 'PM' }
}

export function formatTime(time) {
  const { clock, period } = formatTimeParts(time)
  return `${clock} ${period}`
}

export function groupEvents(events) {
  const byDate = new Map()
  for (const event of events) {
    if (!byDate.has(event.date)) byDate.set(event.date, [])
    byDate.get(event.date).push(event)
  }
  for (const day of byDate.values()) {
    day.sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title) || a.id - b.id)
  }
  return byDate
}
