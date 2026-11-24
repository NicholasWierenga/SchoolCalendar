import { memo, useMemo } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import classicTheme from '@fullcalendar/react/themes/classic'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import '@fullcalendar/react/themes/classic/palette.css'
import { MonthEvent } from './CalendarViews'
import { dateKey, formatDay, monthEventLimit } from './calendarDates'

const plugins = [dayGridPlugin, classicTheme]
const dayHeaderFormat = { weekday: 'short' }
const eventOrder = 'start,title,id'

function markDay({ el }) {
  el.dataset.testid = 'month-day'
  el.querySelector('.school-date-number')?.setAttribute('data-testid', 'open-day')
}

function markMore({ el }) {
  el.dataset.testid = 'month-more'
  const date = el.closest('[data-date]')?.dataset.date
  if (date) el.dataset.moreDate = date
  el.setAttribute('aria-controls', 'school-date-events')
}

export default memo(function MonthGrid({
  month, selectedDate, events, byDate, compact, loading, dropDate, dropFull,
  onDate, onEvent, onEdit, onChoose, onMore,
}) {
  const calendarEvents = useMemo(() => compact ? [] : events.map(event => ({
    id: String(event.id),
    title: event.title,
    start: `${event.date}T${event.time}`,
    interactive: false,
    extendedProps: { record: event },
  })), [compact, events])

  function openMore(event) {
    const trigger = event.target.closest('[data-more-date]')
    if (!trigger) return
    event.preventDefault()
    event.stopPropagation()
    if (!event.repeat) onMore(trigger.dataset.moreDate, trigger)
  }

  return (
    <div
      className={`school-month${compact ? ' school-month-compact' : ''}`}
      aria-label="Month calendar"
      aria-busy={loading}
      data-testid={loading ? undefined : 'month-view'}
      data-month={month.slice(0, 7)}
      onClickCapture={openMore}
      onKeyDownCapture={event => {
        if (event.key === 'Enter' || event.key === ' ') openMore(event)
      }}
      onClick={event => {
        const target = event.target
        if (target.closest('button, [role="button"], [role="link"]')) return
        const cell = target.closest('[data-testid="month-day"]')
        if (cell) onDate(cell.dataset.date)
      }}
    >
      <FullCalendar
        key={month}
        plugins={plugins}
        initialView="dayGridMonth"
        initialDate={month}
        timeZone="UTC"
        firstDay={0}
        fixedWeekCount={false}
        showNonCurrentDates
        height="auto"
        headerToolbar={false}
        navLinks
        navLinkDayClick={date => onDate(dateKey(date))}
        navLinkHint={(_, date) => {
          const key = dateKey(date)
          const count = byDate.get(key)?.length ?? 0
          return `${formatDay(key)}, ${count} ${count === 1 ? 'event' : 'events'}`
        }}
        dayHeaderFormat={dayHeaderFormat}
        dayHeaderClass="school-weekday"
        dayRowClass="school-week"
        dayCellClass={({ date, dow, isOther }) => {
          const key = dateKey(date)
          return [
            'school-month-cell',
            (dow === 0 || dow === 6) && 'school-month-weekend',
            isOther && 'school-month-other',
            key === selectedDate && 'school-month-selected',
            key === dropDate && (dropFull ? 'school-drop-full' : 'school-drop-ready'),
            byDate.has(key) && 'school-month-has-events',
          ].filter(Boolean).join(' ')
        }}
        dayCellTopClass="school-date-heading"
        dayCellTopInnerClass="school-date-number"
        dayCellDidMount={markDay}
        dayMaxEvents={monthEventLimit}
        eventOrder={eventOrder}
        eventOrderStrict
        eventClass="school-fc-event"
        eventInnerClass="school-fc-event-content"
        listItemEventBeforeClass="school-fc-event-marker"
        moreLinkClass="school-more-link"
        moreLinkContent={({ num }) => `+${num} more`}
        moreLinkDidMount={markMore}
        events={calendarEvents}
        eventContent={({ event }) => {
          const record = event.extendedProps.record
          return (
            <MonthEvent
              event={record}
              single={byDate.get(record.date)?.length === 1}
              onActivate={onEvent}
              onChoose={onChoose}
              onEdit={onEdit}
            />
          )
        }}
      />
    </div>
  )
})
