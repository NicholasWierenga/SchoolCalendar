import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { dailyCapacity, formatDay, formatMonth, publishedCount } from './calendarDates'

const directions = [
  { name: 'previous', offset: -1, Icon: ChevronLeft },
  { name: 'next', offset: 1, Icon: ChevronRight },
]

export default function CalendarToolbar({ date, month, mode, arrow, events, isApprover, loading, onNavigate, onModeChange }) {
  const inDayView = mode === 'day'
  const published = publishedCount(events)
  return (
    <header className="school-calendar-heading">
      <div>
        <p className="school-calendar-eyebrow">{inDayView ? 'Daily agenda' : 'School calendar'}</p>
        <h1 id="school-calendar-period" tabIndex={-1}>{inDayView ? formatDay(date) : formatMonth(month)}</h1>
        {!inDayView && isApprover && (
          <div className="school-month-key" aria-label="Event status key" role="group">
            <span>Published</span>
            <span className="school-month-key-pending"><Clock size={12} aria-hidden="true" />Pending request</span>
          </div>
        )}
        {inDayView && !loading && (
          <p className="school-day-total">
            {isApprover ? `${published} of ${dailyCapacity} published · ${events.length - published} pending`
              : `${events.length} scheduled ${events.length === 1 ? 'event' : 'events'}`}
          </p>
        )}
      </div>
      <div className="school-calendar-tools">
        <div className="school-calendar-arrows" role="group" aria-label={`${inDayView ? 'Day' : 'Month'} navigation`}>
          {directions.map(({ name, offset, Icon }) => (
            <button
              key={name}
              type="button"
              className={arrow === offset ? 'school-arrow-paging' : undefined}
              data-page-month={!inDayView ? offset : undefined}
              data-testid={`${mode}-${name}`}
              aria-label={`${name === 'previous' ? 'Previous' : 'Next'} ${mode}`}
              onClick={() => onNavigate(offset)}
            >
              <Icon aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="school-calendar-toggle" role="group" aria-label="Calendar view">
          <button type="button" aria-pressed={!inDayView} data-testid="show-month" onClick={() => onModeChange('month')}>Month</button>
          <button type="button" aria-pressed={inDayView} data-testid="show-day" onClick={() => onModeChange('day')}>Day</button>
        </div>
      </div>
    </header>
  )
}
