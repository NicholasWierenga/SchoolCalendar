import { useState } from 'react'
import FormError from '../../components/FormError'
import Modal from '../../components/Modal'
import { useDialogAction } from '../../components/useDialogAction'
import EventImagePicker from './EventImagePicker'
import { useList } from '../../components/useList'
import { eventFields } from './eventFields'

export default function EventForm({ event, date, user, onSave, onApprove, onClose }) {
  const { items: locations, error: locationError, loading: loadingLocations } = useList('/locations')
  const [values, setValues] = useState(() => eventFields(event ?? { title: '', date, time: '09:00' }))
  const { busy, pending, error, setError, close, run } = useDialogAction(onClose)
  const [reading, setReading] = useState(false)
  const setField = (name, value) => setValues((previous) => ({ ...previous, [name]: value }))
  const isApprover = user.role === 'approver'
  const canApprove = isApprover && event?.status === 'pending'
  const submitDisabled = busy || reading || loadingLocations || Boolean(locationError)
  const title = event ? 'Edit event' : isApprover ? 'New event' : 'Propose an event'
  const saveLabel = event ? 'Save changes' : isApprover ? 'Publish event' : 'Submit for approval'

  function submit(submission) {
    submission.preventDefault()
    if (submitDisabled) return
    const approving = canApprove && submission.nativeEvent.submitter?.value === 'approve'
    return approving ? run(() => onApprove(event, values), 'approve') : run(() => onSave(values), 'save')
  }
  return (
    <Modal title={title} onClose={close}>
      <form onSubmit={submit} data-testid="event-form">
        <div className="form-body stack-form">
          <label>
            Event title
            <input
              required
              autoFocus
              value={values.title}
              onChange={(e) => setField('title', e.target.value)}
              data-testid="event-title-input"
            />
          </label>
          <div className="form-pair">
            <label>
              Date
              <input
                required
                type="date"
                value={values.date}
                onChange={(e) => setField('date', e.target.value)}
                data-testid="event-date-input"
              />
            </label>
            <label>
              Start time
              <input
                required
                type="time"
                value={values.time}
                onChange={(e) => setField('time', e.target.value)}
                data-testid="event-time-input"
              />
            </label>
          </div>
          <label>
            Location
            <select
              value={values.locationId ?? ''}
              disabled={loadingLocations}
              onChange={(e) =>
                setField('locationId', locations.find(location => String(location.id) === e.target.value)?.id ?? null)
              }
              data-testid="event-location-picker"
            >
              <option value="">No location</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <textarea
              rows={3}
              value={values.description}
              onChange={(e) => setField('description', e.target.value)}
              data-testid="event-description-input"
            />
          </label>
          <EventImagePicker
            image={values.image}
            disabled={busy || reading}
            onChange={(image) => setField('image', image)}
            onReadingChange={setReading}
            onError={setError}
          />
        </div>
        <FormError className="form-error event-form-error">{error || locationError}</FormError>
        <footer className="form-actions event-form-actions">
          <button type="button" onClick={close} disabled={busy} data-testid="cancel-form">
            Cancel
          </button>
          <button
            type="submit"
            className={canApprove ? undefined : 'primary'}
            disabled={submitDisabled}
            data-testid="save-form"
          >
            {pending === 'save' ? 'Saving…' : saveLabel}
          </button>
          {canApprove && (
            <button type="submit" value="approve" className="primary" disabled={submitDisabled}>
              {pending === 'approve' ? 'Approving…' : 'Save and approve'}
            </button>
          )}
        </footer>
      </form>
    </Modal>
  )
}
