import { Check } from 'lucide-react'
import Modal from '../../components/Modal'
import EventImage from '../../components/EventImage'
import { localSchedule } from './eventFields'

const stamp = (value) => new Date(value).toLocaleString()

export default function EventDetails({ event, onClose, onApprove, approvalDisabled, approving, approvalError }) {
  const close = () => {
    if (!approving) onClose()
  }

  return (
    <Modal title={event.title} onClose={close}>
      <div className="form-body" data-testid="event-detail">
        <EventImage image={event.image} />
        {event.description && <p className="event-description">{event.description}</p>}
        <dl className="detail-grid">
          <dt>When</dt>
          <dd>{localSchedule(event)}</dd>
          <dt>Location</dt>
          <dd>{event.location || 'No location'}</dd>
          <dt>Status</dt>
          <dd>{event.status === 'approved' ? 'Published' : 'Pending approval'}</dd>
          <dt>Created by</dt>
          <dd data-testid="event-creator">{event.creatorName}</dd>
          <dt>Created</dt>
          <dd>{stamp(event.createdAt)}</dd>
          {event.approvedAt && (
            <>
              <dt>Approved by</dt>
              <dd data-testid="event-approver">{event.approverName}</dd>
              <dt>Approved</dt>
              <dd>{stamp(event.approvedAt)}</dd>
            </>
          )}
        </dl>
        {approvalError && (
          <p className="form-error" role="alert">
            {approvalError}
          </p>
        )}
        <footer className="form-actions event-detail-actions">
          <button type="button" onClick={close} disabled={approving} data-testid="close-detail">
            Close
          </button>
          {event.status === 'pending' && onApprove && (
            <button
              type="button"
              className="primary"
              onClick={onApprove}
              disabled={approvalDisabled}
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
