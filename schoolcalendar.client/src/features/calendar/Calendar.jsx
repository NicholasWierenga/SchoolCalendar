import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import EventDetails from '../events/EventDetails'
import CalendarToolbar from './CalendarToolbar'
import DatePopover from './DatePopover'
import DayAgenda from './DayAgenda'
import MonthGrid, { CompactSummary } from './MonthGrid'
import { formatShortDay, initialDate, monthGridRange, monthStart, shiftDay, shiftMonth } from './calendarDates'
import { dailyCapacity, groupEvents, publishedCount } from './calendarEvents'
import { noEvents, useCompactCalendar, useMonthEvents } from './useCalendarData'
import useCalendarDrag from './useCalendarDrag'
import './calendar.css'

function periodSelection(date, mode) {
  return { date, month: monthStart(date), mode }
}

export default function Calendar({
  user, onApprove, onDelete, onEdit, refreshKey, lastChange, onMove, onUndo, notice, focusDateRequest, onDateChange,
}) {
  const rootRef = useRef(null)
  const focusRef = useRef(null)
  const [period, setPeriod] = useState(() => periodSelection(initialDate, 'month'))
  const [handledFocusRequest, setHandledFocusRequest] = useState(null)
  const [popup, setPopup] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [keyboardMove, setKeyboardMove] = useState(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const { date, month, mode } = period
  const inDayView = mode === 'day'
  const gridRange = monthGridRange(month)
  const visibleSelectedDate = date >= gridRange.from && date <= gridRange.to
  const activeDate = visibleSelectedDate ? date : month
  const compact = useCompactCalendar(rootRef)
  const isApprover = user.role === 'approver'
  const { items: events, loading = false, error } = useMonthEvents(gridRange, refreshKey, isApprover)
  const byDate = useMemo(() => groupEvents(events), [events])
  const records = useMemo(() => new Map(events.map(event => [String(event.id), event])), [events])
  const detailEvent = records.get(detailId)
  const selectedEvents = byDate.get(date) ?? noEvents

  if (!isApprover && keyboardMove) setKeyboardMove(null)
  if (detailId !== null && !detailEvent) setDetailId(null)

  if (focusDateRequest && focusDateRequest !== handledFocusRequest) {
    setHandledFocusRequest(focusDateRequest)
    setPeriod(periodSelection(focusDateRequest.date, mode))
    if (popup && popup.date !== focusDateRequest.date) setPopup(null)
  }

  useEffect(() => { onDateChange?.(activeDate) }, [activeDate, onDateChange])

  useLayoutEffect(() => {
    // A shorter view only needs enough document height to keep the current scroll offset.
    function preserveScrollPosition() {
      const offset = window.scrollY
      document.body.style.minHeight = offset > 0 ? `calc(100dvh + ${offset}px)` : ''
    }

    preserveScrollPosition()
    window.addEventListener('scroll', preserveScrollPosition, { passive: true })
    return () => {
      window.removeEventListener('scroll', preserveScrollPosition)
      document.body.style.removeProperty('min-height')
    }
  }, [])

  const closePopup = useCallback((restoreFocus = false) => {
    if (restoreFocus && popup) {
      const root = rootRef.current
      const target = root?.querySelector(`[data-more-date="${popup.date}"]`)
        ?? root?.querySelector(`.school-month-cell[data-date="${popup.date}"] .school-date-number`)
      target?.focus({ preventScroll: true })
    }
    setPopup(null)
  }, [popup])

  function openPopup(key, trigger) {
    if (busy || keyboardMove) return
    if (popup?.trigger === trigger) closePopup(true)
    else setPopup({ date: key, trigger })
  }

  function queueFocus(key, eventId) {
    focusRef.current = { date: key, eventId }
  }

  useLayoutEffect(() => {
    const request = focusRef.current
    if (!request) return
    const frame = window.requestAnimationFrame(() => {
      if (inDayView) {
        rootRef.current?.querySelector('#school-calendar-period')?.focus({ preventScroll: true })
        focusRef.current = null
        return
      }
      if (request.eventId && !loading) {
        const trigger = rootRef.current?.querySelector(`[data-more-date="${request.date}"]`)
        if (trigger) {
          focusRef.current = null
          setPopup({ date: request.date, trigger, focusEventId: request.eventId })
          return
        }
      }
      if (!request.eventId || !loading) focusRef.current = null
      rootRef.current?.querySelector(`.school-month-cell[data-date="${request.date}"] .school-date-number`)
        ?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  })

  function showFeedback(message) {
    setFeedback({ message, notice })
  }

  function restoreMove({ event, originMonth, fromPopover }, message) {
    queueFocus(event.date, fromPopover ? event.id : null)
    setPeriod(current => ({ ...current, month: originMonth }))
    showFeedback(message)
  }

  async function completeMove(move, destination) {
    const { event } = move
    setKeyboardMove(null)
    if (!destination || event.date === destination) {
      restoreMove(move, 'Move canceled.')
      return
    }

    setBusy(true)
    showFeedback('Moving event…')
    try {
      const updated = await onMove(event, destination)
      queueFocus(updated.date)
      setPeriod(periodSelection(updated.date, 'month'))
      setFeedback(null)
    } catch (moveError) {
      restoreMove(move, moveError.message || 'The event could not be moved.')
    } finally {
      setBusy(false)
    }
  }

  const { drag, handlePointerDown, handleClickCapture } = useCalendarDrag({
    rootRef,
    enabled: isApprover && !inDayView && !keyboardMove && !busy,
    month,
    records,
    onStart() {
      closePopup()
      setFeedback(null)
    },
    onPage(nextMonth) {
      setPeriod(current => ({ ...current, month: nextMonth }))
    },
    onFinish: completeMove,
  })

  function selectDate(key, nextMode = 'day') {
    if (nextMode === 'day') queueFocus(key)
    closePopup()
    setPeriod(periodSelection(key, nextMode))
  }

  function startKeyboardMove(event) {
    if (busy || drag) return
    queueFocus(event.date)
    setKeyboardMove({ event, originMonth: month, fromPopover: Boolean(popup) })
    closePopup()
  }

  function activateDate(key) {
    if (drag || busy) return
    if (keyboardMove) {
      void completeMove(keyboardMove, key)
    } else {
      selectDate(key, compact ? 'month' : 'day')
    }
  }

  function activateEvent(event) {
    if (!busy && !keyboardMove && !drag) setDetailId(String(event.id))
  }

  function navigate(distance) {
    if (drag || busy) return
    closePopup()
    if (inDayView) setPeriod(periodSelection(shiftDay(date, distance), 'day'))
    else setPeriod({ ...period, month: shiftMonth(month, distance) })
  }

  function changeMode(nextMode) {
    if (nextMode === mode || busy || drag || keyboardMove) return
    closePopup()
    setPeriod(periodSelection(activeDate, nextMode))
  }

  function cancelKeyboardMove() {
    if (keyboardMove) void completeMove(keyboardMove, null)
  }

  async function undoChange() {
    if (busy || drag || keyboardMove) return
    setBusy(true)
    try {
      const updated = await onUndo()
      if (updated && !inDayView) queueFocus(updated.date)
      setFeedback(null)
    } catch (undoError) {
      showFeedback(undoError.message || 'The change could not be undone.')
    } finally {
      setBusy(false)
    }
  }

  function handleEscape(event) {
    if (event.key !== 'Escape') return
    if (keyboardMove) cancelKeyboardMove()
    else if (popup) closePopup(true)
    else return
    event.stopPropagation()
    event.preventDefault()
  }

  const dropDate = drag?.date
  const dropFull = dropDate && drag.event.status === 'approved' && dropDate !== drag.event.date
    && publishedCount(byDate.get(dropDate) ?? noEvents) >= dailyCapacity
  const moveAction = isApprover ? startKeyboardMove : undefined
  const editAction = isApprover ? onEdit : undefined
  const changeNotice = feedback && feedback.notice === notice ? feedback.message : notice
  const liveNotice = keyboardMove
    ? `Choose a date for ${keyboardMove.event.title}.`
    : changeNotice || error || (loading ? 'Loading events…' : '')
  const showUndo = Boolean(isApprover && lastChange && !drag && !keyboardMove)

  return (
    <>
      <section
        ref={rootRef}
        className={`school-calendar${drag ? ' school-calendar-dragging' : ''}`}
        aria-labelledby="school-calendar-period"
        onPointerDownCapture={handlePointerDown}
        onClickCapture={handleClickCapture}
        onKeyDown={handleEscape}
      >
        <CalendarToolbar
          date={date} month={month} mode={mode} arrow={drag?.arrow}
          onNavigate={navigate} onModeChange={changeMode}
        />

        {inDayView ? (
          <DayAgenda
            date={date} events={selectedEvents} isApprover={isApprover} loading={loading}
            onEvent={activateEvent} onEdit={editAction}
          />
        ) : (
          <>
            <MonthGrid
              month={month} selectedDate={date} byDate={byDate} compact={compact} loading={loading}
              dropDate={dropDate} dropFull={dropFull} onDate={activateDate} onEvent={activateEvent}
              onEdit={editAction} onChoose={moveAction} onMore={openPopup}
            />
            {compact && visibleSelectedDate && !drag && (
              <CompactSummary
                date={date} events={selectedEvents} loading={loading} expanded={Boolean(popup)}
                onDay={selectDate} onEvent={activateEvent} onEdit={editAction} onChoose={moveAction} onMore={openPopup}
              />
            )}
          </>
        )}

        <div className="school-calendar-note" data-visible={Boolean(liveNotice || showUndo)}>
          <span role="status" data-testid="calendar-feedback">{liveNotice}</span>
          {showUndo && (
            <button type="button" className="school-calendar-link" data-testid="undo-event-change" disabled={busy} onClick={undoChange}>
              Undo
            </button>
          )}
          {keyboardMove && (
            <button type="button" className="school-calendar-link" onClick={cancelKeyboardMove}>Cancel move</button>
          )}
        </div>

        {popup && !drag && !inDayView && (
          <DatePopover
            popup={popup} rootRef={rootRef} events={byDate.get(popup.date) ?? noEvents}
            onClose={closePopup} onDay={selectDate} onEvent={activateEvent} onChoose={moveAction} onEdit={editAction}
          />
        )}

        {drag && (
          <span
            className="school-drag-preview"
            aria-hidden="true"
            style={{ left: `clamp(4px, ${drag.x + 12}px, calc(100vw - 14rem))`, top: Math.min(drag.y + 12, window.innerHeight - 38) }}
          >
            {drag.event.title}{drag.arrow ? ' · Release here to cancel' : ''}
            {dropDate && ` · ${dropFull ? 'Day full' : formatShortDay(dropDate)}`}
          </span>
        )}
      </section>
      {detailEvent && (
        <EventDetails
          event={detailEvent}
          onClose={() => setDetailId(null)}
          onApprove={isApprover ? onApprove : undefined}
          onDelete={isApprover ? onDelete : undefined}
          onEdit={editAction}
        />
      )}
    </>
  )
}
