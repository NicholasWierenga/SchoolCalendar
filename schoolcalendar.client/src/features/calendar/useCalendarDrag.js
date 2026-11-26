import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { shiftMonth } from './calendarDates'

const moveThreshold = 7
const repeatInterval = 800

function hit(root, x, y, selector) {
  const element = document.elementFromPoint(x, y)?.closest(selector)
  return element && root.contains(element) ? element : null
}

function stopPaging(gesture) {
  window.clearInterval(gesture.timer)
  gesture.arrow = null
}

function releaseGesture(gestureRef, root) {
  const gesture = gestureRef.current
  if (!gesture) return
  gestureRef.current = null
  stopPaging(gesture)
  if (root?.hasPointerCapture(gesture.pointerId)) root.releasePointerCapture(gesture.pointerId)
}

export default function useCalendarDrag({ rootRef, enabled, month, records, onStart, onPage, onFinish }) {
  const gestureRef = useRef(null)
  const suppressClick = useRef(false)
  const [drag, setDrag] = useState(null)
  const start = useEffectEvent(onStart)
  const page = useEffectEvent(onPage)
  const finish = useEffectEvent(onFinish)

  if (!enabled && drag) setDrag(null)

  useLayoutEffect(() => {
    if (!enabled) releaseGesture(gestureRef, rootRef.current)
  }, [enabled, rootRef])

  useEffect(() => {
    const calendar = rootRef.current

    function end(gesture, date) {
      releaseGesture(gestureRef, calendar)
      if (!gesture.started) return
      setDrag(null)
      finish(gesture.event, date, gesture.originMonth, gesture.fromPopover)
    }

    function pageAt(root, gesture) {
      const arrow = hit(root, gesture.x, gesture.y, '[data-page-month]')
      if (arrow === gesture.arrow) return
      stopPaging(gesture)
      if (!arrow) return
      gesture.arrow = arrow
      const distance = Number(arrow.dataset.pageMonth)
      const advance = () => {
        if (hit(root, gesture.x, gesture.y, '[data-page-month]') !== arrow) {
          stopPaging(gesture)
          return
        }
        gesture.previewMonth = shiftMonth(gesture.previewMonth, distance)
        page(gesture.previewMonth)
      }
      advance()
      gesture.timer = window.setInterval(advance, repeatInterval)
    }

    function handleMove(event) {
      const gesture = gestureRef.current
      const root = rootRef.current
      if (!gesture || event.pointerId !== gesture.pointerId || !root) return
      if (!(event.buttons & 1)) {
        end(gesture, null)
        return
      }
      if (!gesture.started) {
        const distance = Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y)
        if (distance < moveThreshold) return
        gesture.started = true
        suppressClick.current = true
        root.setPointerCapture(event.pointerId)
        start()
      }

      if (event.cancelable) event.preventDefault()
      gesture.x = event.clientX
      gesture.y = event.clientY
      pageAt(root, gesture)
      const cell = hit(root, gesture.x, gesture.y, '[data-testid="month-day"]')
      setDrag({
        event: gesture.event,
        x: gesture.x,
        y: gesture.y,
        arrow: Number(gesture.arrow?.dataset.pageMonth) || null,
        date: cell?.dataset.date ?? null,
      })
    }

    function handleUp(event) {
      const gesture = gestureRef.current
      const root = rootRef.current
      if (!gesture || gesture.pointerId !== event.pointerId || !root) return
      const cell = gesture.started ? hit(root, event.clientX, event.clientY, '[data-testid="month-day"]') : null
      if (gesture.started && event.cancelable) event.preventDefault()
      end(gesture, cell?.dataset.date ?? null)
    }

    function handleCancel(event) {
      const gesture = gestureRef.current
      if (gesture && (event.pointerId === undefined || event.pointerId === gesture.pointerId)) end(gesture, null)
    }

    function handleEscape(event) {
      const gesture = gestureRef.current
      if (event.key !== 'Escape' || !gesture?.started) return
      event.preventDefault()
      event.stopPropagation()
      end(gesture, null)
    }

    function handleVisibility() {
      if (document.hidden) handleCancel({})
    }

    function handleCaptureLost(event) {
      if (event.target === calendar) handleCancel(event)
    }

    window.addEventListener('pointermove', handleMove, { passive: false })
    window.addEventListener('pointerup', handleUp, true)
    window.addEventListener('pointercancel', handleCancel)
    window.addEventListener('blur', handleCancel)
    window.addEventListener('keydown', handleEscape, true)
    document.addEventListener('visibilitychange', handleVisibility)
    calendar.addEventListener('lostpointercapture', handleCaptureLost)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp, true)
      window.removeEventListener('pointercancel', handleCancel)
      window.removeEventListener('blur', handleCancel)
      window.removeEventListener('keydown', handleEscape, true)
      document.removeEventListener('visibilitychange', handleVisibility)
      calendar.removeEventListener('lostpointercapture', handleCaptureLost)
      releaseGesture(gestureRef, calendar)
    }
  }, [rootRef])

  function handlePointerDown(event) {
    if (gestureRef.current) return
    suppressClick.current = false
    if (!enabled || event.button !== 0 || !event.isPrimary) return
    const source = event.target.closest('[data-drag-event]')
    const record = records.get(source?.dataset.dragEvent)
    if (!record) return
    if (event.pointerType === 'touch' && source.matches('.school-popover-summary') && !event.target.closest('.school-popover-grip')) return
    gestureRef.current = {
      event: record,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      originMonth: month,
      previewMonth: month,
      fromPopover: Boolean(source.closest('.school-datepicker-popover')),
      started: false,
      arrow: null,
      timer: null,
    }
  }

  function handleClickCapture(event) {
    if (!suppressClick.current || event.detail === 0) return
    suppressClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return { drag, handlePointerDown, handleClickCapture }
}
