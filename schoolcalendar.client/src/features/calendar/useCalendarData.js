import { useLayoutEffect, useState } from 'react'
import { useList } from '../../components/useList'

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

export function useMonthEvents({ from, to }, refreshKey, isApprover) {
  const path = `${isApprover ? '/events/manage' : '/events'}?from=${from}&to=${to}`
  return useList(path, refreshKey, { keepItemsOnRefresh: true })
}
