import { useState } from 'react'
import { api } from '../../api'
import Modal from '../../components/Modal'

export default function DirectoryForm({ kind, record, onSaved, onClose }) {
  const isUser = kind === 'user'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault()
    if (busy) return
    const fields = Object.fromEntries(new FormData(e.currentTarget))
    if (isUser) {
      fields.role = fields.approver ? 'approver' : 'normal'
      delete fields.approver
      if (record && !fields.password) delete fields.password
    }
    setBusy(true)
    setError('')
    try {
      const path = '/' + kind + 's' + (record ? '/' + record.id : '')
      await api(path, { method: record ? 'PATCH' : 'POST', body: fields })
      onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  const close = () => {
    if (!busy) onClose()
  }
  return (
    <Modal title={(record ? 'Edit ' : 'Add ') + kind} onClose={close}>
      <form onSubmit={save} data-testid={kind + '-form'}>
        <div className="form-body stack-form">
          {isUser ? (
            <>
              <label>
                Login name
                <input
                  name="login"
                  defaultValue={record?.login}
                  autoFocus
                  required
                  pattern="[A-Za-z0-9]{4,16}"
                  title="Use 4 to 16 letters or digits"
                  autoComplete="off"
                  data-testid="user-logon-input"
                />
              </label>
              <label>
                {record ? 'New password (optional)' : 'Password'}
                <input
                  name="password"
                  type="password"
                  required={!record}
                  minLength={4}
                  maxLength={16}
                  autoComplete="new-password"
                  data-testid="user-password-input"
                />
              </label>
              <div className="form-pair">
                <label>
                  First name
                  <input
                    name="firstName"
                    defaultValue={record?.firstName}
                    required
                    data-testid="user-first-input"
                  />
                </label>
                <label>
                  Middle name
                  <input
                    name="middleName"
                    defaultValue={record?.middleName}
                    data-testid="user-middle-input"
                  />
                </label>
              </div>
              <label>
                Last name
                <input
                  name="lastName"
                  defaultValue={record?.lastName}
                  required
                  data-testid="user-last-input"
                />
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  name="approver"
                  defaultChecked={record?.role === 'approver'}
                  data-testid="user-approver-input"
                />{' '}
                Approver access
              </label>
            </>
          ) : (
            <label>
              Location name
              <input
                name="name"
                defaultValue={record?.name}
                required
                autoFocus
                data-testid="location-name-input"
              />
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <footer className="form-actions">
          <button type="button" disabled={busy} onClick={close} data-testid="cancel-form">
            Cancel
          </button>
          <button className="primary" disabled={busy} data-testid="save-form">
            {busy ? 'Saving…' : 'Save ' + kind}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
