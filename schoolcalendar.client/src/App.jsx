import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { api } from './api'
import AppHeader from './components/AppHeader'
import ConfirmDelete from './components/ConfirmDelete'
import SignIn from './features/auth/SignIn'
import Calendar from './features/calendar/Calendar'
import { initialDate } from './features/calendar/calendarDates'
import DirectoryPage from './features/admin/DirectoryPage'
import EventsPage, { MyEventsPage } from './features/events/EventsPage'
import EventForm from './features/events/EventForm'
import { changedFields, eventFields } from './features/events/eventFields'
import { useEventChanges } from './features/events/useEventChanges'

function SchoolCalendar({ user, onUserChange }) {
  const sessionRequest = useRef(null)
  const [page, setPage] = useState('calendar')
  const [date, setDate] = useState(initialDate)
  const [eventDialog, setEventDialog] = useState(null)
  const [revision, setRevision] = useState(0)
  const [focusDateRequest, setFocusDateRequest] = useState(null)
  const [notice, setNotice] = useState('')
  const refresh = () => setRevision((n) => n + 1)
  function focusCalendar(date) {
    setDate(date)
    setFocusDateRequest((previous) => ({ date, nonce: (previous?.nonce ?? 0) + 1 }))
  }
  function saved(event, message) {
    refresh()
    setNotice(message)
    if (user.role === 'approver') focusCalendar(event.date)
  }
  const changes = useEventChanges(saved)
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
    if (eventDialog.event) return changes.edit(eventDialog.event, values).catch(refreshIfStale)
    const result = await api('/events', { method: 'POST', body: { ...values, expectedRole: user.role } })
    saved(result, result.title + (result.status === 'approved' ? ' published.' : ' submitted for approval.'))
    return result
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
    if (values) body.changes = changedFields(eventFields(event), values)
    const published = await api('/events/' + event.id + '/approve', { method: 'POST', body }).catch(refreshIfStale)
    eventAdminChanged(event.id, published.title + ' approved and published.')
    if (page === 'calendar') focusCalendar(published.date)
  }
  const refreshSession = useCallback(async () => {
    sessionRequest.current?.abort()
    const request = new AbortController()
    sessionRequest.current = request
    try {
      const currentUser = await api('/session', { signal: request.signal })
      if (request.signal.aborted) return
      if (currentUser.role !== user.role) setPage('calendar')
      if (currentUser.role !== 'approver') {
        setEventDialog(current => current?.event ? null : current)
      }
      onUserChange(currentUser)
    } catch (err) {
      if (request.signal.aborted) return
      if (err.status === 401) onUserChange(null)
      else setNotice(err.message)
    }
  }, [onUserChange, user.role])

  const checkRole = useEffectEvent(event => {
    if (event.detail !== user.role) void refreshSession()
  })
  useEffect(() => {
    window.addEventListener('focus', refreshSession)
    window.addEventListener('session-role', checkRole)
    return () => {
      sessionRequest.current?.abort()
      window.removeEventListener('focus', refreshSession)
      window.removeEventListener('session-role', checkRole)
    }
  }, [refreshSession])

  function directoryChanged(id) {
    refresh()
    if (page === 'users' && id === user.id) void refreshSession()
  }
  async function signOut() {
    try {
      await api('/session', { method: 'DELETE' })
      sessionRequest.current?.abort()
      onUserChange(null)
    } catch (err) {
      setNotice(err.message)
    }
  }
  return (
    <>
      <AppHeader
        user={user}
        page={page}
        onNavigate={navigate}
        onNew={() => setEventDialog({ action: 'create', date })}
        onSignOut={signOut}
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
          <MyEventsPage revision={revision} />
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

export default function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    api('/session', { signal: controller.signal })
      .then((result) => {
        setUser(result)
        setError('')
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.status === 401 ? '' : err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    const expired = () => setUser(null)
    window.addEventListener('session-expired', expired)
    return () => {
      controller.abort()
      window.removeEventListener('session-expired', expired)
    }
  }, [attempt])
  if (loading)
    return (
      <main className="startup" role="status">
        Opening SchoolCalendar…
      </main>
    )
  if (error)
    return (
      <main className="startup">
        <p role="alert">{error}</p>
        <button
          onClick={() => {
            setLoading(true)
            setAttempt((n) => n + 1)
          }}
        >
          Try again
        </button>
      </main>
    )
  return user ? (
    <SchoolCalendar key={user.id} user={user} onUserChange={setUser} />
  ) : (
    <SignIn onSignIn={setUser} />
  )
}
