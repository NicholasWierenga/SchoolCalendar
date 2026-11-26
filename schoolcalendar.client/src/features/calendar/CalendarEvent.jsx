import { Clock, Pencil } from 'lucide-react'
import EventImage from '../../components/EventImage'
import { formatTime } from './calendarDates'
import { eventOwnershipLabel } from './calendarEvents'

export function EditButton({ event, onEdit, small = false }) {
  if (!onEdit) return null
  return (
    <button
      type="button"
      className={`school-edit-event${small ? ' school-edit-small' : ''}`}
      aria-label={`Edit ${event.title}`}
      aria-haspopup="dialog"
      data-testid="event-edit"
      onClick={() => onEdit(event)}
    >
      <Pencil aria-hidden="true" />
    </button>
  )
}

export function EventSummaryButton({ event, onActivate, onChoose, title, children, ...props }) {
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

export function PendingLabel() {
  return <span className="school-pending-label"><Clock aria-hidden="true" />Pending request</span>
}

export function MonthEvent({ event, single, onActivate, onChoose, onEdit }) {
  const pending = event.status === 'pending'
  const ownershipLabel = eventOwnershipLabel(event)
  const time = formatTime(event.time)
  const status = pending ? 'Pending approval' : 'Published'
  const summary = [time, event.title, event.location, status, ownershipLabel].filter(Boolean).join(' · ')
  return (
    <div className={`school-month-item${pending ? ' school-month-pending' : ''}${ownershipLabel ? ' school-event-own' : ''}`} data-testid="calendar-event">
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
