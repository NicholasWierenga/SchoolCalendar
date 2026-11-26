import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import EventDetails from '../events/EventDetails'
import CalendarToolbar from './CalendarToolbar'
import MonthGrid from './MonthGrid'
import { CompactSummary, DatePopover, DayAgenda } from './CalendarViews'
import { noEvents, useCompactCalendar, useMonthEvents } from './useCalendarData'
import useCalendarDrag from './useCalendarDrag'
import { dailyCapacity, formatShortDay, groupEvents, initialDate, monthGridRange, monthStart, publishedCount, shiftDay, shiftMonth } from './calendarDates'
import './calendar.css'

function periodSelection(date, mode) {
  return { date, month: monthStart(date), mode }
}

export default function Calendar({ user, onApprove, onDelete, onEdit, refreshKey, lastChange, onMove, onUndo, notice, focusDateRequest, onDateChange }) {
  const rootRef = useRef(null)
  const focusRef = useRef(null)
  const [period, setPeriod] = useState(() => periodSelection(initialDate, 'month'))
  const [handledRequest, setHandledRequest] = useState(null)
  const [popup, setPopup] = useState(null)
  const [detailId, setDetailId] = useState(null)
  const [choosing, setChoosing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const { date, month, mode } = period
  const compact = useCompactCalendar(rootRef)
  const isApprover = user.role === 'approver'
  const { events, loading, error } = useMonthEvents(month, refreshKey, isApprover)
  const byDate = useMemo(() => groupEvents(events), [events])
  const records = useMemo(() => new Map(events.map(event => [String(event.id), event])), [events])
  const detailEvent = records.get(detailId)
  const eventsToday = byDate.get(date) ?? noEvents
  const inDayView = mode === 'day'
  const gridRange = monthGridRange(month)
  const visibleSelectedDate = date >= gridRange.from && date <= gridRange.to

  if (!isApprover && choosing) setChoosing(null)
  if (detailId !== null && !detailEvent) setDetailId(null)

  if (focusDateRequest && focusDateRequest.nonce !== handledRequest) {
    setHandledRequest(focusDateRequest.nonce)
    setPeriod(periodSelection(focusDateRequest.date, mode))
    if (popup && popup.date !== focusDateRequest.date) setPopup(null)
  }

  useEffect(() => { onDateChange?.(date) }, [date, onDateChange])

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
        ?? root?.querySelector(`[data-date="${popup.date}"] [data-testid="open-day"]`)
      target?.focus({ preventScroll: true })
    }
    setPopup(null)
  }, [popup])

  const openPopup = useCallback((key, trigger) => {
    if (busy || choosing) return
    if (popup?.trigger === trigger) closePopup(true)
    else setPopup({ date: key, trigger })
  }, [busy, choosing, closePopup, popup])

  const queueFocus = useCallback((key, focusEvent) => {
    focusRef.current = { date: key, event: focusEvent }
  }, [])

  useLayoutEffect(() => {
    const request = focusRef.current
    if (!request) return
    const frame = window.requestAnimationFrame(() => {
      if (inDayView) {
        rootRef.current?.querySelector('#school-calendar-period')?.focus({ preventScroll: true })
        focusRef.current = null
        return
      }
      const cell = rootRef.current?.querySelector(`[data-testid="month-day"][data-date="${request.date}"]`)
      if (request.event && !loading) {
        const trigger = rootRef.current?.querySelector(`[data-more-date="${request.date}"]`)
        if (trigger) {
          focusRef.current = null
          setPopup({ date: request.date, trigger, focusEvent: request.event })
          return
        }
      }
      if (!request.event || !loading) focusRef.current = null
      cell?.querySelector('[data-testid="open-day"]')?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  })

  function showFeedback(message) {
    setFeedback({ message, notice })
  }

  function restoreMove(event, originMonth, fromPopover, message) {
    queueFocus(event.date, fromPopover ? event.id : null)
    setPeriod(current => ({ ...current, month: originMonth }))
    showFeedback(message)
  }

  async function completeMove(event, destination, originMonth, fromPopover) {
    setChoosing(null)
    if (!destination || event.date === destination) {
      restoreMove(event, originMonth, fromPopover, 'Move canceled.')
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
      restoreMove(event, originMonth, fromPopover, moveError.message || 'The event could not be moved.')
    } finally {
      setBusy(false)
    }
  }

  const dragControls = useCalendarDrag({
    rootRef,
    enabled: isApprover && !inDayView && !choosing && !busy,
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
  const { drag, handlePointerDown, handleClickCapture } = dragControls

  const openDay = useCallback(key => {
    queueFocus(key)
    setPopup(null)
    setPeriod(periodSelection(key, 'day'))
  }, [queueFocus])

  function chooseDate(event) {
    if (busy || drag) return
    queueFocus(event.date)
    setChoosing({ event, originMonth: month, fromPopover: Boolean(popup) })
    closePopup()
  }

  function activateDate(key) {
    if (drag || busy) return
    if (choosing) {
      void completeMove(choosing.event, key, choosing.originMonth, choosing.fromPopover)
    } else if (compact) {
      closePopup()
      setPeriod(periodSelection(key, 'month'))
    } else {
      openDay(key)
    }
  }

  function activateEvent(event) {
    if (!busy && !choosing && !drag) setDetailId(String(event.id))
  }

  function navigate(distance) {
    if (drag || busy) return
    closePopup()
    if (inDayView) setPeriod(periodSelection(shiftDay(date, distance), 'day'))
    else setPeriod({ ...period, month: shiftMonth(month, distance) })
  }

  function changeMode(nextMode) {
    if (nextMode === mode || busy || drag || choosing) return
    closePopup()
    setPeriod(periodSelection(visibleSelectedDate ? date : month, nextMode))
  }

  function cancelKeyboardMove() {
    if (!choosing) return
    void completeMove(choosing.event, null, choosing.originMonth, choosing.fromPopover)
  }

  async function undoChange() {
    if (busy || drag || choosing) return
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
    if (choosing) cancelKeyboardMove()
    else if (popup) closePopup(true)
    else return
    event.stopPropagation()
    event.preventDefault()
  }

  const dropDate = drag?.date
  const dropFull = dropDate && drag.event.status === 'approved' && dropDate !== drag.event.date
    && publishedCount(byDate.get(dropDate) ?? noEvents) >= dailyCapacity
  const moveAction = isApprover ? chooseDate : undefined
  const editAction = isApprover ? onEdit : undefined
  const liveNotice = choosing
    ? `Choose a date for ${choosing.event.title}.`
    : (feedback && feedback.notice === notice ? feedback.message : notice) || error || (loading ? 'Loading events…' : '')
  const showUndo = Boolean(isApprover && lastChange && !drag && !choosing)

  const calendar = (
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

      {inDayView ? <DayAgenda date={date} events={eventsToday} isApprover={isApprover} onEvent={activateEvent} onEdit={editAction} loading={loading} /> : (
        <>
          <MonthGrid
            month={month} selectedDate={date} byDate={byDate} compact={compact} loading={loading}
            dropDate={dropDate} dropFull={dropFull} onDate={activateDate} onEvent={activateEvent}
            onEdit={editAction} onChoose={moveAction} onMore={openPopup}
          />
          {compact && visibleSelectedDate && !drag && (
            <CompactSummary
              date={date} events={eventsToday} loading={loading} expanded={Boolean(popup)}
              onDay={openDay} onEvent={activateEvent} onEdit={editAction} onChoose={moveAction} onMore={openPopup}
            />
          )}
        </>
      )}

      <div className="school-calendar-note" data-visible={Boolean(liveNotice || showUndo)}>
        <span role="status" data-testid="calendar-feedback">{liveNotice}</span>
        {showUndo && <button type="button" className="school-calendar-link" data-testid="undo-event-change" disabled={busy} onClick={undoChange}>Undo</button>}
        {choosing && <button type="button" className="school-calendar-link" onClick={cancelKeyboardMove}>Cancel move</button>}
      </div>

      {popup && !drag && !inDayView && (
        <DatePopover
          popup={popup} rootRef={rootRef} events={byDate.get(popup.date) ?? noEvents}
          onClose={closePopup} onDay={openDay} onEvent={activateEvent} onChoose={moveAction} onEdit={editAction}
        />
      )}

      {drag && (
        <span
          className="school-drag-preview" aria-hidden="true"
          style={{ left: `clamp(4px, ${drag.x + 12}px, calc(100vw - 14rem))`, top: Math.min(drag.y + 12, window.innerHeight - 38) }}
        >
          {drag.event.title}{drag.arrow ? ' · Release here to cancel' : ''}
          {dropDate && ` · ${dropFull ? 'Day full' : formatShortDay(dropDate)}`}
        </span>
      )}
    </section>
  )

  return (
    <>
      {calendar}
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
