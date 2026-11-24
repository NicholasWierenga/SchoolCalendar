import { useState } from 'react'
import Modal from './Modal'

export default function ConfirmDelete({ title, name, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function remove() {
    setBusy(true)
    try {
      await onConfirm()
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
    <Modal title={title} onClose={close}>
      <div className="form-body">
        <p>
          Delete <strong>{name}</strong>?
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
      <footer className="form-actions">
        <button type="button" disabled={busy} onClick={close} autoFocus>
          Keep it
        </button>
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={remove}
          data-testid="confirm-delete"
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </footer>
    </Modal>
  )
}
