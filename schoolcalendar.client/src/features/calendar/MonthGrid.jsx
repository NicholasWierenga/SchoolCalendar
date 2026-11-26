import { memo, useCallback, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import classicTheme from '@fullcalendar/react/themes/classic'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/classic/theme.css'
import '@fullcalendar/react/themes/classic/palette.css'
import { MonthEvent } from './CalendarViews'
import { dateKey, formatDay, monthEventLimit } from './calendarDates'
import { monthOverflowLabel, monthPreview } from './monthPreview'

const plugins = [dayGridPlugin, classicTheme]
const dayHeaderFormat = { weekday: 'short' }
const shortWeekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })
const narrowWeekday = new Intl.DateTimeFormat('en-US', { weekday: 'narrow', timeZone: 'UTC' })
const eventOrder = 'previewOrder,start,title,id'

function weekdayLabel({ date }) {
  return (
    <>
      <span className="school-weekday-short">{shortWeekday.format(date)}</span>
      <span className="school-weekday-narrow">{narrowWeekday.format(date)}</span>
    </>
  )
}

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

function MonthMoreLabel({ count, previews }) {
  const [date, setDate] = useState()
  // FullCalendar supplies the overflow count to its content hook, but the date is on the cell.
  const locateCell = useCallback(element => {
    if (element) setDate(element.closest('[data-date]')?.dataset.date)
  }, [])
  const preview = previews.get(date)
  const label = preview ? monthOverflowLabel(preview.hiddenPublished, preview.hiddenPending) : `+${count} more`
  const mixed = preview?.hiddenPublished && preview.hiddenPending
  return (
    <span ref={locateCell} className={preview?.hiddenPending ? 'school-more-breakdown' : undefined}>
      {mixed ? (
        <>
          <span className="school-more-count">{preview.hiddenPublished} <span className="school-more-word">more </span>published</span>
          <span className="school-more-separator"> · </span>
          <span className="school-more-count">{preview.hiddenPending} pending</span>
        </>
      ) : label}
    </span>
  )
}

export default memo(function MonthGrid({
  month, selectedDate, byDate, compact, loading, dropDate, dropFull,
  onDate, onEvent, onEdit, onChoose, onMore,
}) {
  const previews = useMemo(() => new Map(Array.from(byDate, ([date, events]) => [date, monthPreview(events)])), [byDate])
  const calendarEvents = useMemo(() => {
    if (compact) return []
    return Array.from(previews.values()).flatMap(({ visible, hidden }) => (
      [...visible, ...hidden].map((event, previewOrder) => ({
        id: String(event.id),
        title: event.title,
        start: `${event.date}T${event.time}`,
        interactive: false,
        extendedProps: { record: event, previewOrder },
      }))
    ))
  }, [compact, previews])

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
          const preview = previews.get(key)
          if (preview?.pendingCount) return `${formatDay(key)}, ${preview.publishedCount} published, ${preview.pendingCount} pending`
          const count = preview?.publishedCount ?? 0
          return `${formatDay(key)}, ${count} ${count === 1 ? 'event' : 'events'}`
        }}
        dayHeaderFormat={dayHeaderFormat}
        dayHeaderClass="school-weekday"
        dayHeaderInnerClass="school-weekday-caption"
        dayHeaderContent={weekdayLabel}
        dayRowClass="school-week"
        dayCellClass={({ date, dow, isOther }) => {
          const key = dateKey(date)
          const preview = previews.get(key)
          return [
            'school-month-cell',
            (dow === 0 || dow === 6) && 'school-month-weekend',
            isOther && 'school-month-other',
            key === selectedDate && 'school-month-selected',
            key === dropDate && (dropFull ? 'school-drop-full' : 'school-drop-ready'),
            preview?.publishedCount && 'school-month-has-published',
            preview?.pendingCount && 'school-month-has-pending',
            preview?.hiddenPublished && preview.hiddenPending && 'school-month-mixed-overflow',
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
        moreLinkInnerClass="school-more-link-content"
        moreLinkContent={({ num }) => <MonthMoreLabel count={num} previews={previews} />}
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
