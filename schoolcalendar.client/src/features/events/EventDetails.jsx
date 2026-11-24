import Modal from '../../components/Modal'
import EventImage from '../../components/EventImage'
import { localSchedule } from './eventFields'

const stamp = (value) => new Date(value).toLocaleString()

export default function EventDetails({ event, onClose }) {
  return (
    <Modal title={event.title} onClose={onClose}>
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
        <button onClick={onClose} data-testid="close-detail">
          Close
        </button>
      </div>
    </Modal>
  )
}
