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

export function useMonthEvents(month, refreshKey, isApprover) {
  const [response, setResponse] = useState(null)
  const { from, to } = monthGridRange(month)
  const path = `${isApprover ? '/events/manage' : '/events'}?from=${from}&to=${to}`
  const current = response?.path === path ? response : null
  useEffect(() => {
    const controller = new AbortController()
    api(path, { signal: controller.signal })
      .then(events => {
        if (!controller.signal.aborted) setResponse({ path, events, error: null })
      })
      .catch(error => {
        if (!controller.signal.aborted) setResponse({ path, error: error.message, events: noEvents })
      })
    return () => controller.abort()
  }, [path, refreshKey])
  return { events: current?.events ?? noEvents, loading: !current, error: current?.error }
}
