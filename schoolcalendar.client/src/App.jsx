import { useEffect, useState } from 'react'
import { api } from './api'
import AppHeader from './components/AppHeader'
import SignIn from './features/auth/SignIn'
import Calendar from './features/calendar/Calendar'
import { initialDate } from './features/calendar/calendarDates'
import DirectoryPage from './features/admin/DirectoryPage'
import EventsPage from './features/events/EventsPage'
import EventForm from './features/events/EventForm'
import { changedFields, eventFields } from './features/events/eventFields'
import { useEventChanges } from './features/events/useEventChanges'

function SchoolCalendar({ user, onSignedOut, onUserChange }) {
  const [page, setPage] = useState('calendar')
  const [date, setDate] = useState(initialDate)
  const [editor, setEditor] = useState(null)
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
  async function saveEvent(values) {
    if (editor.event) return changes.edit(editor.event, values)
    const result = await api('/events', { method: 'POST', body: values })
    saved(result, result.title + (result.status === 'approved' ? ' published.' : ' submitted for approval.'))
    return result
  }
  function eventAdminChanged(id, message) {
    changes.forget(id)
    setNotice(message)
    refresh()
  }
  async function approveEvent(event, values) {
    const body = { version: event.version }
    if (values) body.changes = changedFields(eventFields(event), values)
    const published = await api('/events/' + event.id + '/approve', { method: 'POST', body })
    eventAdminChanged(event.id, published.title + ' approved and published.')
    if (page === 'calendar') focusCalendar(published.date)
  }
  async function directoryChanged(id) {
    refresh()
    if (page !== 'users' || id !== user.id) return
    try {
      const currentUser = await api('/session')
      if (currentUser.role !== 'approver') navigate('calendar')
      onUserChange(currentUser)
    } catch (err) {
      if (err.status === 401) onSignedOut()
      else setNotice(err.message)
    }
  }
  async function signOut() {
    try {
      await api('/session', { method: 'DELETE' })
      onSignedOut()
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
        onNew={() => setEditor({ date })}
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
            onEdit={(event) => setEditor({ event })}
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
            onEdit={(event) => setEditor({ event })}
            onApprove={approveEvent}
            onChange={eventAdminChanged}
          />
        )}
        {(page === 'users' || page === 'locations') && (
          <DirectoryPage key={page} kind={page === 'users' ? 'user' : 'location'} onChange={directoryChanged} />
        )}
      </main>
      {editor && (
        <EventForm
          event={editor.event}
          date={editor.date}
          user={user}
          onSave={saveEvent}
          onApprove={approveEvent}
          onClose={() => setEditor(null)}
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
    <SchoolCalendar key={user.id} user={user} onUserChange={setUser} onSignedOut={() => setUser(null)} />
  ) : (
    <SignIn onSignIn={setUser} />
  )
}
