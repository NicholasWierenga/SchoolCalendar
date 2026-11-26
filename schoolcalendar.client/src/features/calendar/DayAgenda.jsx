import { MapPin } from 'lucide-react'
import EventImage from '../../components/EventImage'
import { openEventFromRow } from '../events/openEventFromRow'
import { EditButton, PendingLabel } from './CalendarEvent'
import { formatTimeParts } from './calendarDates'
import { dailyCapacity, eventOwnershipLabel, publishedCount } from './calendarEvents'

export default function DayAgenda({ date, events, isApprover, onEvent, onEdit, loading }) {
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
        const ownershipLabel = eventOwnershipLabel(event)
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
            <div className={`school-agenda-card${pending ? ' school-agenda-pending' : ''}${ownershipLabel ? ' school-event-own' : ''}`}>
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
                {ownershipLabel && <span className="school-agenda-ownership">{ownershipLabel}</span>}
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
