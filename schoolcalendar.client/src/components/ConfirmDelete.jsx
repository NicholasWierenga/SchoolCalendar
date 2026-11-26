import FormError from './FormError'
import Modal from './Modal'
import { useDialogAction } from './useDialogAction'

export default function ConfirmDelete({ title, name, onConfirm, onClose }) {
  const { busy, error, close, run } = useDialogAction(onClose, { clearErrorOnRetry: false })
  return (
    <Modal title={title} onClose={close}>
      <div className="form-body">
        <p>
          Delete <strong>{name}</strong>?
        </p>
        <FormError>{error}</FormError>
      </div>
      <footer className="form-actions">
        <button type="button" disabled={busy} onClick={close} autoFocus>
          Keep it
        </button>
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={() => run(onConfirm)}
          data-testid="confirm-delete"
        >
          {busy ? 'Deleting…' : 'Delete'}
        </button>
      </footer>
    </Modal>
  )
}
