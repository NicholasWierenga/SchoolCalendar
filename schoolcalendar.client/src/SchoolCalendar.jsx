import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import AppHeader from './components/AppHeader'
import ConfirmDelete from './components/ConfirmDelete'
import Calendar from './features/calendar/Calendar'
import { initialDate } from './features/calendar/calendarDates'
import DirectoryPage from './features/admin/DirectoryPage'
import EventsPage from './features/events/EventsPage'
import EventForm from './features/events/EventForm'
import { changedEventFields } from './features/events/eventFields'
import { useEventChanges } from './features/events/useEventChanges'
import './features/events/events.css'

export default function SchoolCalendar({ user, refreshSession, onSignOut }) {
  const [page, setPage] = useState('calendar')
  const [date, setDate] = useState(initialDate)
  const [eventDialog, setEventDialog] = useState(null)
  const [revision, setRevision] = useState(0)
  const [focusDateRequest, setFocusDateRequest] = useState(null)
  const [notice, setNotice] = useState('')
  const [previousRole, setPreviousRole] = useState(user.role)

  if (previousRole !== user.role) {
    setPreviousRole(user.role)
    setPage('calendar')
    // A proposal draft can still be submitted after a role change.
    if (user.role !== 'approver' && eventDialog?.event) setEventDialog(null)
  }

  const refresh = () => setRevision((n) => n + 1)
  function focusCalendar(date) {
    setDate(date)
    setFocusDateRequest({ date })
  }
  function eventSaved(event, message) {
    refresh()
    setNotice(message)
    if (user.role === 'approver') focusCalendar(event.date)
  }
  const changes = useEventChanges(eventSaved)
  function navigate(next) {
    setPage(next)
    setNotice('')
    refresh()
  }
  const editEvent = (event) => setEventDialog({ action: 'edit', event })
  const confirmDelete = (event) => setEventDialog({ action: 'delete', event })
  const closeEventDialog = () => setEventDialog(null)
  function refreshIfStale(error) {
    if (error.status === 404 || error.code === 'conflict') refresh()
    throw error
  }
  async function saveEvent(values) {
    if (eventDialog.action === 'edit') return changes.edit(eventDialog.event, values).catch(refreshIfStale)
    const result = await api('/events', { method: 'POST', body: { ...values, expectedRole: user.role } })
    eventSaved(result, result.title + (result.status === 'approved' ? ' published.' : ' submitted for approval.'))
  }
  function eventAdminChanged(id, message) {
    changes.forget(id)
    setNotice(message)
    refresh()
  }
  async function deleteEvent(event) {
    await api('/events/' + event.id + '?version=' + encodeURIComponent(event.version), {
      method: 'DELETE',
    }).catch(refreshIfStale)
    eventAdminChanged(event.id, event.title + ' deleted.')
  }
  async function approveEvent(event, values) {
    const body = { version: event.version }
    if (values) body.changes = changedEventFields(event, values)
    const published = await api('/events/' + event.id + '/approve', { method: 'POST', body }).catch(refreshIfStale)
    eventAdminChanged(event.id, published.title + ' approved and published.')
    if (page === 'calendar') focusCalendar(published.date)
  }
  const checkSession = useCallback(() => {
    refreshSession().catch(error => setNotice(error.message))
  }, [refreshSession])

  useEffect(() => {
    function checkReportedRole(event) {
      if (event.detail !== user.role) checkSession()
    }
    window.addEventListener('focus', checkSession)
    window.addEventListener('session-role', checkReportedRole)
    return () => {
      window.removeEventListener('focus', checkSession)
      window.removeEventListener('session-role', checkReportedRole)
    }
  }, [checkSession, user.role])

  function directoryChanged(id) {
    if (page === 'users' && id === user.id) checkSession()
  }

  return (
    <>
      <AppHeader
        user={user}
        page={page}
        onNavigate={navigate}
        onNew={() => setEventDialog({ action: 'create', date })}
        onSignOut={() => onSignOut().catch(error => setNotice(error.message))}
      />
      <main className="workspace">
        {page !== 'calendar' && notice && (
          <p className="notice" role="status">
            {notice}
            {changes.lastChange && page === 'events' && (
              <button
                className="undo-link"
                type="button"
                onClick={() => changes.undo().catch((err) => setNotice(err.message))}
              >
                Undo edit to {changes.lastChange.after.title}
              </button>
            )}
          </p>
        )}
        {page === 'calendar' && (
          <Calendar
            user={user}
            onDateChange={setDate}
            onEdit={editEvent}
            onDelete={confirmDelete}
            onApprove={approveEvent}
            refreshKey={revision}
            lastChange={changes.lastChange}
            onMove={changes.move}
            onUndo={changes.undo}
            notice={notice}
            focusDateRequest={focusDateRequest}
          />
        )}
        {user.role === 'approver' && page === 'events' && (
          <EventsPage
            revision={revision}
            onEdit={editEvent}
            onDelete={confirmDelete}
            onApprove={approveEvent}
          />
        )}
        {user.role === 'normal' && page === 'my-events' && (
          <EventsPage revision={revision} personal />
        )}
        {(page === 'users' || page === 'locations') && (
          <DirectoryPage key={page} kind={page === 'users' ? 'user' : 'location'} onChange={directoryChanged} />
        )}
      </main>
      {eventDialog?.action === 'delete' && (
        <ConfirmDelete
          title="Delete event"
          name={eventDialog.event.title}
          onConfirm={() => deleteEvent(eventDialog.event)}
          onClose={closeEventDialog}
        />
      )}
      {eventDialog && eventDialog.action !== 'delete' && (
        <EventForm
          event={eventDialog.event}
          date={eventDialog.date}
          user={user}
          onSave={saveEvent}
          onApprove={approveEvent}
          onClose={closeEventDialog}
        />
      )}
    </>
  )
}
