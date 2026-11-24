import { useEffect, useLayoutEffect, useState } from 'react'
import { api } from '../../api'
import { monthGridRange } from './calendarDates'

export const noEvents = []

export function useCompactCalendar(rootRef) {
  const [compact, setCompact] = useState(false)
  useLayoutEffect(() => {
    const root = rootRef.current
    const observer = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width <= 600))
    observer.observe(root)
    return () => observer.disconnect()
  }, [rootRef])
  return compact
}

export function useMonthEvents(month, refreshKey) {
  const [response, setResponse] = useState(null)
  const current = response?.month === month ? response : null
  useEffect(() => {
    const { from, to } = monthGridRange(month)
    const controller = new AbortController()
    api(`/events?from=${from}&to=${to}`, { signal: controller.signal })
      .then(events => {
        if (!controller.signal.aborted) setResponse({ month, events, error: null })
      })
      .catch(error => {
        if (!controller.signal.aborted) setResponse({ month, error: error.message, events: noEvents })
      })
    return () => controller.abort()
  }, [month, refreshKey])
  return { events: current?.events ?? noEvents, loading: !current, error: current?.error }
}
