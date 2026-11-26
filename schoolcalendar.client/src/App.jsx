import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import SchoolCalendar from './SchoolCalendar'
import SignIn from './features/auth/SignIn'

export default function App() {
  // undefined while restoring the cookie, null once we know the visitor is signed out.
  const [user, setUser] = useState(undefined)
  const [startupError, setStartupError] = useState('')
  const pending = useRef(null)

  const refreshSession = useCallback(() => {
    pending.current?.abort()
    const request = new AbortController()
    pending.current = request
    return api('/session', { signal: request.signal })
      .then(currentUser => {
        if (!request.signal.aborted) setUser(currentUser)
      })
      .catch(error => {
        if (request.signal.aborted) return
        if (error.status !== 401) throw error
        setUser(null)
      })
  }, [])

  const clearSession = useCallback(() => {
    pending.current?.abort()
    setUser(null)
  }, [])

  useEffect(() => {
    refreshSession().catch(error => setStartupError(error.message))
    window.addEventListener('session-expired', clearSession)
    return () => {
      pending.current?.abort()
      window.removeEventListener('session-expired', clearSession)
    }
  }, [clearSession, refreshSession])

  function retry() {
    setStartupError('')
    refreshSession().catch(error => setStartupError(error.message))
  }

  async function signOut() {
    await api('/session', { method: 'DELETE' })
    clearSession()
  }

  if (user === undefined) {
    return startupError ? (
      <main className="startup">
        <p role="alert">{startupError}</p>
        <button onClick={retry}>Try again</button>
      </main>
    ) : (
      <main className="startup" role="status">Opening SchoolCalendar…</main>
    )
  }

  return user ? (
    <SchoolCalendar key={user.id} user={user} refreshSession={refreshSession} onSignOut={signOut} />
  ) : (
    <SignIn onSignIn={setUser} />
  )
}
