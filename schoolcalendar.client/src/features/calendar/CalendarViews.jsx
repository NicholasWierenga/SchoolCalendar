import { useEffect, useLayoutEffect, useRef } from 'react'
import { Clock, GripVertical, MapPin, Pencil, X } from 'lucide-react'
import EventImage from '../../components/EventImage'
import { openEventFromRow } from '../events/openEventFromRow'
import { dailyCapacity, formatDay, formatTime, formatTimeParts, monthEventLimit, publishedCount } from './calendarDates'
import { monthOverflowLabel, monthPreview } from './monthPreview'

const ownershipLabel = 'Submitted by you'

function isOwnPublishedEvent(event) {
  return event.status === 'approved' && event.isOwn === true
}

function EditButton({ event, onEdit, small = false }) {
  if (!onEdit) return null
  return (
    <button
      type="button"
      className={`school-edit-event${small ? ' school-edit-small' : ''}`}
      aria-label={`Edit ${event.title}`}
      aria-haspopup="dialog"
      data-testid="event-edit"
      data-edit-event={event.id}
      onClick={() => onEdit(event)}
    >
      <Pencil aria-hidden="true" />
    </button>
  )
}

function EventSummaryButton({ event, onActivate, onChoose, title, children, ...props }) {
  const moveHint = onChoose ? 'Press Space to move this event.' : undefined
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-description={moveHint}
      title={[title, moveHint].filter(Boolean).join(' · ') || undefined}
      aria-keyshortcuts={onChoose ? 'Space' : undefined}
      data-drag-event={onChoose ? event.id : undefined}
      onClick={() => onActivate(event)}
      onKeyDown={keyEvent => {
        if (keyEvent.key !== ' ' || !onChoose) return
        keyEvent.preventDefault()
        if (!keyEvent.repeat) onChoose(event)
      }}
      {...props}
    >
      {children}
    </button>
  )
}

export function MonthEvent({ event, single, onActivate, onChoose, onEdit }) {
  const pending = event.status === 'pending'
  const own = isOwnPublishedEvent(event)
  const time = formatTime(event.time)
  const status = pending ? 'Pending approval' : 'Published'
  const summary = [time, event.title, event.location, status, own && ownershipLabel].filter(Boolean).join(' · ')
  return (
    <div className={`school-month-item${pending ? ' school-month-pending' : ''}${own ? ' school-event-own' : ''}`} data-testid="calendar-event">
      <EventSummaryButton
        event={event}
        onActivate={onActivate}
        onChoose={onChoose}
        className={`school-month-summary${single ? ' school-month-single' : ''}`}
        title={summary}
        aria-label={summary}
        data-testid={onChoose ? 'event-drag-handle' : undefined}
      >
        <span className="school-month-line">
          <time data-testid="event-time" dateTime={`${event.date}T${event.time}`}>
            {pending && <Clock className="school-month-pending-clock" aria-hidden="true" />}
            {time}
          </time>
          <span className="school-month-title">
            <EventImage image={event.image} draggable={false} className="school-event-image school-event-image-small" />
            <span data-testid="event-title">{event.title}</span>
          </span>
        </span>
        <span className="school-month-location" data-testid="event-location">{event.location}</span>
      </EventSummaryButton>
      <EditButton event={event} onEdit={onEdit} small />
    </div>
  )
}

function PendingLabel() {
  return <span className="school-pending-label"><Clock aria-hidden="true" />Pending request</span>
}

export function DayAgenda({ date, events, isApprover, onEvent, onEdit, loading }) {
  const published = publishedCount(events)
  const countLabel = isApprover
    ? `${published} of ${dailyCapacity} published · ${events.length - published} pending`
    : `${events.length} scheduled ${events.length === 1 ? 'event' : 'events'}`
  return (
    <section className="school-agenda" aria-label="Daily agenda" aria-busy={loading} data-testid={loading ? undefined : 'day-view'} data-date={date}>
      <p className="school-agenda-count">{!loading && countLabel}</p>
      {events.map((event, index) => {
        const { clock, period } = formatTimeParts(event.time)
        const pending = event.status === 'pending'
        const own = isOwnPublishedEvent(event)
        const repeatedStart = isApprover && events[index - 1]?.time === event.time
        const moreAtStart = isApprover && events[index + 1]?.time === event.time
        return (
          <article
            className="school-agenda-event"
            key={event.id}
            data-testid="calendar-event"
            data-more-at-start={moreAtStart || undefined}
            onClick={openEventFromRow}
          >
            <time className={`school-agenda-time${repeatedStart ? ' school-agenda-time-repeated' : ''}`} data-testid="event-time" dateTime={`${event.date}T${event.time}`}>
              {clock} <small>{period}</small>
            </time>
            <div className={`school-agenda-card${pending ? ' school-agenda-pending' : ''}${own ? ' school-event-own' : ''}`}>
              <div className="school-agenda-description">
                <h3>
                  <button type="button" className="school-agenda-title" data-event-details aria-haspopup="dialog" onClick={() => onEvent(event)}>
                    <EventImage image={event.image} draggable={false} className="school-event-image" />
                    <span data-testid="event-title">{event.title}</span>
                  </button>
                </h3>
                {pending && <PendingLabel />}
                {event.description && <p data-testid="event-description">{event.description}</p>}
              </div>
              <div className="school-agenda-meta">
                {event.location && <div className="school-agenda-location"><MapPin aria-hidden="true" /><span data-testid="event-location">{event.location}</span></div>}
                <p className="school-agenda-creator">Created by <span data-testid="event-creator">{event.creatorName}</span></p>
                {own && <span className="school-agenda-ownership">{ownershipLabel}</span>}
              </div>
              <EditButton event={event} onEdit={onEdit} />
            </div>
          </article>
        )
      })}
      {!events.length && !loading && <p className="school-empty-day">No events scheduled.</p>}
    </section>
  )
}

export function CompactSummary({ date, events, onDay, onEvent, onEdit, onChoose, onMore, expanded, loading }) {
  const { visible, hidden, hiddenPublished, hiddenPending } = monthPreview(events)
  return (
    <section className="school-compact-summary" aria-label={`Events for ${formatDay(date)}`}>
      <h3>{formatDay(date)}</h3>
      {visible.map(event => (
        <MonthEvent key={event.id} event={event} onActivate={onEvent} onChoose={onChoose} onEdit={onEdit} />
      ))}
      {!events.length && !loading && <p>No events scheduled.</p>}
      {hidden.length ? (
        <button
          type="button"
          className="school-compact-action"
          aria-haspopup="dialog"
          aria-controls="school-date-events"
          aria-expanded={expanded}
          data-more-date={date}
          data-testid="month-more"
          onClick={event => onMore(date, event.currentTarget)}
        >
          {monthOverflowLabel(hiddenPublished, hiddenPending)}
        </button>
      ) : <button type="button" className="school-compact-action" onClick={() => onDay(date)}>Open day agenda</button>}
    </section>
  )
}

export function DatePopover({ popup, rootRef, events, onClose, onDay, onEvent, onChoose, onEdit }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const { date, trigger, focusEvent } = popup

  useEffect(() => {
    if (events.length <= monthEventLimit) onClose(true)
  }, [events.length, onClose])

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
    const eventRow = focusEvent ? panel.querySelector(`[data-drag-event="${focusEvent}"]`) : null
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
  }, [date, focusEvent, rootRef, trigger])

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
    document.addEventListener('pointerdown', dismissOutside, true)
    document.addEventListener('click', dismissOutside, true)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true)
      document.removeEventListener('click', dismissOutside, true)
    }
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
      <div className="school-popover-events">
        {events.map(event => {
          const pending = event.status === 'pending'
          const own = isOwnPublishedEvent(event)
          const time = formatTime(event.time)
          const summary = [event.title, time, event.location, pending ? 'Pending request' : 'Published', own && ownershipLabel].filter(Boolean).join(', ')
          return (
            <div className={`school-popover-event${pending ? ' school-popover-pending' : ''}${own ? ' school-event-own' : ''}`} key={event.id} data-testid="popover-event">
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
