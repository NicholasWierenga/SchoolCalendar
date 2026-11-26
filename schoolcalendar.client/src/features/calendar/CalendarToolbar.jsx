import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDay, formatMonth } from './calendarDates'

const directions = [
  { name: 'previous', offset: -1, Icon: ChevronLeft },
  { name: 'next', offset: 1, Icon: ChevronRight },
]

export default function CalendarToolbar({ date, month, mode, arrow, onNavigate, onModeChange }) {
  const inDayView = mode === 'day'
  return (
    <header className="school-calendar-heading">
      <div>
        <p className="school-calendar-eyebrow">{inDayView ? 'Daily agenda' : 'School calendar'}</p>
        <h1 id="school-calendar-period" tabIndex={-1}>{inDayView ? formatDay(date) : formatMonth(month)}</h1>
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
