import FormError from '../../components/FormError'
import Modal from '../../components/Modal'
import { useDialogAction } from '../../components/useDialogAction'

function NameField({ part, label, record, required = false }) {
  const name = part + 'Name'
  return (
    <label>
      {label}
      <input name={name} defaultValue={record?.[name]} required={required} data-testid={`user-${part}-input`} />
    </label>
  )
}

export default function DirectoryForm({ kind, record, onSave, onReload, onClose }) {
  const isUser = kind === 'user'
  const { busy, error, close, run } = useDialogAction(onClose)
  function save(event) {
    event.preventDefault()
    if (busy) return
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    if (isUser) {
      fields.role = fields.approver ? 'approver' : 'normal'
      delete fields.approver
      if (record && !fields.password) delete fields.password
    }
    return run(() => onSave(fields))
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
                <NameField part="first" label="First name" record={record} required />
                <NameField part="middle" label="Middle name" record={record} />
              </div>
              <NameField part="last" label="Last name" record={record} required />
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
          <FormError>{error}</FormError>
          {onReload && (
            <button type="button" disabled={busy} onClick={onReload}>
              Discard my edits and load latest
            </button>
          )}
        </div>
        <footer className="form-actions">
          <button type="button" disabled={busy} onClick={close} data-testid="cancel-form">
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy} data-testid="save-form">
            {busy ? 'Saving…' : 'Save ' + kind}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
