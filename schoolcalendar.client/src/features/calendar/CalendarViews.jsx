import { useEffect, useLayoutEffect, useRef } from 'react'
import { Clock, GripVertical, MapPin, Pencil, X } from 'lucide-react'
import EventImage from '../../components/EventImage'
import { dailyCapacity, formatDay, formatTime, formatTimeParts, publishedCount } from './calendarDates'
import { monthOverflowLabel, monthPreview } from './monthPreview'

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

export function MonthEvent({ event, single, onActivate, onChoose, onEdit }) {
  const pending = event.status === 'pending'
  const time = formatTime(event.time)
  const summary = [time, event.title, event.location, pending ? 'Pending approval' : 'Published'].filter(Boolean).join(' · ')
  return (
    <div className={`school-month-item${pending ? ' school-month-pending' : ''}`} data-testid="calendar-event">
      <button
        type="button"
        className={`school-month-summary${single ? ' school-month-single' : ''}`}
        onClick={() => onActivate(event)}
        title={summary}
        aria-label={summary}
        aria-keyshortcuts={onChoose ? 'Space' : undefined}
        onKeyDown={keyEvent => {
          if (keyEvent.key !== ' ' || !onChoose) return
          keyEvent.preventDefault()
          if (!keyEvent.repeat) onChoose(event)
        }}
        data-drag-event={onEdit ? event.id : undefined}
        data-testid={onEdit ? 'event-drag-handle' : undefined}
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
      </button>
      <EditButton event={event} onEdit={onEdit} small />
    </div>
  )
}

function PendingLabel() {
  return <span className="school-pending-label"><Clock aria-hidden="true" />Pending request</span>
}

export function DayAgenda({ date, events, isApprover, onEdit, loading }) {
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
        const repeatedStart = isApprover && events[index - 1]?.time === event.time
        const moreAtStart = isApprover && events[index + 1]?.time === event.time
        return (
          <article className="school-agenda-event" key={event.id} data-testid="calendar-event" data-more-at-start={moreAtStart || undefined}>
            <time className={`school-agenda-time${repeatedStart ? ' school-agenda-time-repeated' : ''}`} data-testid="event-time" dateTime={`${event.date}T${event.time}`}>
              {clock} <small>{period}</small>
            </time>
            <div className={`school-agenda-card${pending ? ' school-agenda-pending' : ''}`}>
              <div className="school-agenda-description">
                <h3>
                  <EventImage image={event.image} className="school-event-image" />
                  <span data-testid="event-title">{event.title}</span>
                </h3>
                {pending && <PendingLabel />}
                {event.description && <p data-testid="event-description">{event.description}</p>}
              </div>
              <div className="school-agenda-meta">
                {event.location && <div className="school-agenda-location"><MapPin aria-hidden="true" /><span data-testid="event-location">{event.location}</span></div>}
                <p className="school-agenda-creator">Created by <span data-testid="event-creator">{event.creatorName}</span></p>
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

export function DatePopover({ popup, rootRef, events, onClose, onDay, onMove, onEdit }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const { date, trigger, focusEvent } = popup

  useLayoutEffect(() => {
    const panel = panelRef.current
    const root = rootRef.current
    const note = root.querySelector('.school-calendar-note')
    const position = () => {
      const rootBox = root.getBoundingClientRect()
      const triggerBox = trigger.getBoundingClientRect()
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
  }, [focusEvent, rootRef, trigger])

  useEffect(() => {
    function dismissOutside(event) {
      if (!panelRef.current.contains(event.target) && !event.target.closest('[data-more-date], dialog[open]')) onClose()
    }
    document.addEventListener('pointerdown', dismissOutside)
    return () => document.removeEventListener('pointerdown', dismissOutside)
  }, [onClose])

  return (
    <section ref={panelRef} id="school-date-events" className="school-datepicker-popover" role="dialog" aria-labelledby="school-date-events-title">
      <header className="school-popover-header">
        <div>
          <h3 id="school-date-events-title">{formatDay(date)}</h3>
          {onEdit && <p>Drag to reschedule. Use the pencil to edit.</p>}
        </div>
        <button type="button" ref={closeRef} className="school-popover-close" aria-label="Close event list" onClick={() => onClose(true)}>
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="school-popover-events">
        {events.map(event => {
          const pending = event.status === 'pending'
          const time = formatTime(event.time)
          const summary = [onMove ? `Move ${event.title}` : event.title, time, event.location, pending ? 'Pending request' : 'Published'].filter(Boolean).join(', ')
          return (
            <div className={`school-popover-event${pending ? ' school-popover-pending' : ''}`} key={event.id} data-testid="popover-event">
              <button
                type="button"
                className="school-popover-summary"
                onClick={() => onMove ? onMove(event) : onDay(date)}
                aria-label={summary}
                data-drag-event={onMove ? event.id : undefined}
              >
                {onMove && <span className="school-popover-grip" aria-hidden="true"><GripVertical /></span>}
                <time data-testid="event-time" dateTime={`${date}T${event.time}`}>{time}</time>
                <span className="school-popover-event-details">
                  <strong>
                    <EventImage image={event.image} draggable={false} className="school-event-image school-event-image-small" />
                    <span data-testid="event-title">{event.title}</span>
                  </strong>
                  {event.location && <span className="school-popover-location" data-testid="event-location">{event.location}</span>}
                  {pending && <PendingLabel />}
                </span>
              </button>
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
