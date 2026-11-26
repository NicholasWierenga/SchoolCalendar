import { Check } from 'lucide-react'
import FormError from '../../components/FormError'
import Modal from '../../components/Modal'
import EventImage from '../../components/EventImage'
import { useDialogAction } from '../../components/useDialogAction'
import { formatEventSchedule } from './eventFields'

const formatTimestamp = (value) => new Date(value).toLocaleString()

export default function EventDetails({ event, onClose, onApprove, onEdit, onDelete }) {
  const { busy: approving, error, close, run } = useDialogAction(onClose)
  function openAction(action) {
    onClose()
    action(event)
  }

  return (
    <Modal title={event.title} onClose={close}>
      <div className="form-body" data-testid="event-detail">
        <EventImage image={event.image} />
        {event.description && <p>{event.description}</p>}
        <dl className="detail-grid">
          <dt>When</dt>
          <dd>{formatEventSchedule(event)}</dd>
          <dt>Location</dt>
          <dd>{event.location || 'No location'}</dd>
          <dt>Status</dt>
          <dd>{event.status === 'approved' ? 'Published' : 'Pending approval'}</dd>
          <dt>Created by</dt>
          <dd data-testid="event-creator">{event.creatorName}</dd>
          <dt>Created</dt>
          <dd>{formatTimestamp(event.createdAt)}</dd>
          {event.approvedAt && (
            <>
              <dt>Approved by</dt>
              <dd data-testid="event-approver">{event.approverName}</dd>
              <dt>Approved</dt>
              <dd>{formatTimestamp(event.approvedAt)}</dd>
            </>
          )}
        </dl>
        <FormError>{error}</FormError>
        <footer className="form-actions event-detail-actions">
          {onDelete && (
            <button type="button" className="event-detail-delete" disabled={approving} onClick={() => openAction(onDelete)}>
              Delete
            </button>
          )}
          <button type="button" onClick={close} disabled={approving} data-testid="close-detail">
            Close
          </button>
          {onEdit && (
            <button type="button" className={event.status === 'approved' ? 'primary' : undefined} disabled={approving} onClick={() => openAction(onEdit)}>
              Edit
            </button>
          )}
          {event.status === 'pending' && onApprove && (
            <button
              type="button"
              className="primary"
              onClick={() => run(() => onApprove(event))}
              disabled={approving}
              data-testid="approve-detail"
            >
              <Check size={15} aria-hidden="true" />
              {approving ? 'Approving…' : 'Approve'}
            </button>
          )}
        </footer>
      </div>
    </Modal>
  )
}
