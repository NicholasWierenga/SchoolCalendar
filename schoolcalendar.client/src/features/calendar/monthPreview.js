import { monthEventLimit } from './calendarDates.js'

export function monthPreview(orderedEvents) {
  const published = orderedEvents.filter(event => event.status !== 'pending')
  const pending = orderedEvents.filter(event => event.status === 'pending')
  const visiblePublished = published.slice(0, monthEventLimit)
  const visiblePending = pending.slice(0, monthEventLimit - visiblePublished.length)
  const selected = new Set([...visiblePublished, ...visiblePending])

  return {
    visible: orderedEvents.filter(event => selected.has(event)),
    hidden: orderedEvents.filter(event => !selected.has(event)),
    publishedCount: published.length,
    pendingCount: pending.length,
    hiddenPublished: published.length - visiblePublished.length,
    hiddenPending: pending.length - visiblePending.length,
  }
}

export function monthOverflowLabel(hiddenPublished, hiddenPending) {
  if (!hiddenPending) return `+${hiddenPublished} more`
  if (!hiddenPublished) return `+${hiddenPending} pending`
  return `${hiddenPublished} more published · ${hiddenPending} pending`
}
