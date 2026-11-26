import { useEffect, useLayoutEffect, useRef } from 'react'
import { GripVertical, X } from 'lucide-react'
import EventImage from '../../components/EventImage'
import { EditButton, EventSummaryButton, PendingLabel } from './CalendarEvent'
import { formatDay, formatTime } from './calendarDates'
import { eventOwnershipLabel } from './calendarEvents'
import { monthEventLimit } from './monthPreview'

function passExcessWheelToPage(event) {
  if (!event.cancelable || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return

  const { deltaMode, deltaX, deltaY } = event
  if (deltaX || !deltaY) return

  const list = event.currentTarget
  const maxScrollTop = list.scrollHeight - list.clientHeight
  if (maxScrollTop <= 0) return

  let movement = deltaY
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
    movement *= Number.parseFloat(window.getComputedStyle(list).lineHeight)
  } else if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    movement *= list.clientHeight
  }
  if (!Number.isFinite(movement)) return

  const nextTop = list.scrollTop + movement
  const boundedTop = Math.min(maxScrollTop, Math.max(0, nextTop))
  if (nextTop === boundedTop) return

  // The browser can discard the remainder of a wheel event that reaches the list edge.
  event.preventDefault()
  list.scrollTop = boundedTop
  window.scrollBy({ top: nextTop - boundedTop, behavior: 'instant' })
}

export default function DatePopover({ popup, rootRef, events, onClose, onDay, onEvent, onChoose, onEdit }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const eventsRef = useRef(null)
  const { date, trigger, focusEventId } = popup

  useEffect(() => {
    if (events.length <= monthEventLimit) onClose(true)
  }, [events.length, onClose])

  useEffect(() => {
    const list = eventsRef.current
    list.addEventListener('wheel', passExcessWheelToPage, { passive: false })
    return () => list.removeEventListener('wheel', passExcessWheelToPage)
  }, [])

  useLayoutEffect(() => {
    const panel = panelRef.current
    const root = rootRef.current
    const note = root.querySelector('.school-calendar-note')
    const position = () => {
      const rootBox = root.getBoundingClientRect()
      const anchor = trigger.isConnected ? trigger : root.querySelector(`[data-more-date="${date}"]`)
      if (!anchor) return
      const triggerBox = anchor.getBoundingClientRect()
      const bottom = (note.dataset.visible === 'true' ? note.getBoundingClientRect().top : rootBox.bottom) - rootBox.top
      panel.style.maxHeight = Math.max(0, bottom - 16) + 'px'
      const panelBox = panel.getBoundingClientRect()
      const maxLeft = root.clientWidth - panelBox.width - 8
      const maxTop = bottom - panelBox.height - 8
      panel.style.left = `${Math.max(8, Math.min(maxLeft, triggerBox.right - rootBox.left - panelBox.width))}px`
      panel.style.top = `${Math.max(8, Math.min(maxTop, triggerBox.bottom - rootBox.top + 3))}px`
    }

    position()
    const eventRow = focusEventId ? panel.querySelector(`[data-drag-event="${focusEventId}"]`) : null
    const focusTarget = eventRow ?? closeRef.current
    focusTarget.focus({ preventScroll: true })
    trigger.setAttribute('aria-expanded', 'true')
    const observer = new ResizeObserver(position)
    observer.observe(root)
    observer.observe(panel)
    observer.observe(note)
    return () => {
      observer.disconnect()
      trigger.setAttribute('aria-expanded', 'false')
    }
  }, [date, focusEventId, rootRef, trigger])

  useEffect(() => {
    function dismissOutside(event) {
      const target = event.target
      if (panelRef.current.contains(target) || target.closest('dialog[open]')) return

      if (rootRef.current.contains(target) && target.closest('.school-month, .school-compact-summary')) {
        // Keep the list open through pointerdown so the same gesture can't select or drag a background event.
        event.preventDefault()
        event.stopPropagation()
        if (event.type === 'click') onClose(true)
      } else if (event.type === 'pointerdown') {
        onClose()
      }
    }
    const listeners = new AbortController()
    const options = { capture: true, signal: listeners.signal }
    document.addEventListener('pointerdown', dismissOutside, options)
    document.addEventListener('click', dismissOutside, options)
    return () => listeners.abort()
  }, [onClose, rootRef])

  return (
    <section ref={panelRef} id="school-date-events" className="school-datepicker-popover" role="dialog" aria-labelledby="school-date-events-title">
      <header className="school-popover-header">
        <div>
          <h3 id="school-date-events-title">{formatDay(date)}</h3>
          {onChoose && <p>Drag an event or press Space to move it. Use the pencil to edit.</p>}
        </div>
        <button type="button" ref={closeRef} className="school-popover-close" aria-label="Close event list" onClick={() => onClose(true)}>
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="school-popover-events" ref={eventsRef}>
        {events.map(event => {
          const pending = event.status === 'pending'
          const ownershipLabel = eventOwnershipLabel(event)
          const time = formatTime(event.time)
          const summary = [event.title, time, event.location, pending ? 'Pending request' : 'Published', ownershipLabel].filter(Boolean).join(', ')
          return (
            <div className={`school-popover-event${pending ? ' school-popover-pending' : ''}${ownershipLabel ? ' school-event-own' : ''}`} key={event.id} data-testid="popover-event">
              <EventSummaryButton
                event={event}
                onActivate={onEvent}
                onChoose={onChoose}
                className="school-popover-summary"
                aria-label={summary}
              >
                {onChoose && <span className="school-popover-grip" aria-hidden="true"><GripVertical /></span>}
                <time data-testid="event-time" dateTime={`${date}T${event.time}`}>{time}</time>
                <span className="school-popover-event-details">
                  <strong>
                    <EventImage image={event.image} draggable={false} className="school-event-image school-event-image-small" />
                    <span data-testid="event-title">{event.title}</span>
                  </strong>
                  {event.location && <span className="school-popover-location" data-testid="event-location">{event.location}</span>}
                  {pending && <PendingLabel />}
                </span>
              </EventSummaryButton>
              <EditButton event={event} onEdit={onEdit} />
            </div>
          )
        })}
      </div>
      <footer className="school-popover-footer">
        <button type="button" className="school-calendar-link" onClick={() => onDay(date)}>Open day agenda</button>
      </footer>
    </section>
  )
}
