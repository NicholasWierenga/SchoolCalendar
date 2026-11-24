import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { api } from '../../api'
import SchoolBrand from '../../components/SchoolBrand'

export default function SignIn({ onSignIn }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const { login, password } = Object.fromEntries(new FormData(e.currentTarget))
    try {
      onSignIn(await api('/session', { method: 'POST', body: { login, password } }))
    } catch (err) {
      setError(err.status === 401 ? 'Check your login name and password.' : err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="login-page">
      <header className="masthead">
        <div className="masthead-inner">
          <SchoolBrand />
        </div>
      </header>
      <main className="login-main">
        <section className="login-panel" aria-labelledby="login-heading">
          <p className="eyebrow">School calendar</p>
          <h1 id="login-heading">Sign in</h1>
          <p className="lead">Use your school account to view the calendar and submit events.</p>
          <form className="stack-form" data-testid="sign-in-form" onSubmit={submit}>
            <label>
              Login name
              <input
                name="login"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck="false"
                required
                data-testid="sign-in-logon"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                data-testid="sign-in-password"
              />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary login-submit" disabled={busy} data-testid="sign-in-submit">
              {busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={17} />
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
