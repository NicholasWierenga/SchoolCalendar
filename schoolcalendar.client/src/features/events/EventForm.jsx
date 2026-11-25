import { useState } from 'react'
import Modal from '../../components/Modal'
import EventImagePicker from './EventImagePicker'
import { useList } from '../../components/useList'
import { eventFields } from './eventFields'

export default function EventForm({ event, date, user, onSave, onApprove, onClose }) {
  const { items: locations, error: locationError, loading } = useList('/locations')
  const [values, setValues] = useState(() =>
    event ? eventFields(event) : eventFields({ title: '', date, time: '09:00' }),
  )
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(null)
  const [reading, setReading] = useState(false)
  const set = (name, value) => setValues((previous) => ({ ...previous, [name]: value }))
  const publish = user.role === 'approver'
  const canApprove = publish && event?.status === 'pending'
  const busy = submitting !== null
  const submitDisabled = busy || reading || loading || Boolean(locationError)
  const title = event ? 'Edit event' : publish ? 'New event' : 'Propose an event'
  const saveLabel = event ? 'Save changes' : publish ? 'Publish event' : 'Submit for approval'
  async function submit(e) {
    e.preventDefault()
    if (submitDisabled) return
    const approving = canApprove && e.nativeEvent.submitter?.value === 'approve'
    setError('')
    setSubmitting(approving ? 'approve' : 'save')
    try {
      if (approving) await onApprove(event, values)
      else await onSave(values)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(null)
    }
  }
  const close = () => {
    if (!busy) onClose()
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
              onChange={(e) => set('title', e.target.value)}
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
                onChange={(e) => set('date', e.target.value)}
                data-testid="event-date-input"
              />
            </label>
            <label>
              Start time
              <input
                required
                type="time"
                value={values.time}
                onChange={(e) => set('time', e.target.value)}
                data-testid="event-time-input"
              />
            </label>
          </div>
          <label>
            Location
            <select
              value={values.locationId ?? ''}
              disabled={loading}
              onChange={(e) =>
                set('locationId', locations.find((l) => String(l.id) === e.target.value)?.id ?? null)
              }
              data-testid="event-location-picker"
            >
              <option value="">No location</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <textarea
              rows={3}
              value={values.description}
              onChange={(e) => set('description', e.target.value)}
              data-testid="event-description-input"
            />
          </label>
          <EventImagePicker
            image={values.image}
            disabled={busy || reading}
            onChange={(image) => set('image', image)}
            onReadingChange={setReading}
            onError={setError}
          />
        </div>
        {(error || locationError) && (
          <p role="alert" className="form-error event-form-error">
            {error || locationError}
          </p>
        )}
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
            {submitting === 'save' ? 'Saving…' : saveLabel}
          </button>
          {canApprove && (
            <button type="submit" value="approve" className="primary" disabled={submitDisabled}>
              {submitting === 'approve' ? 'Approving…' : 'Save and approve'}
            </button>
          )}
        </footer>
      </form>
    </Modal>
  )
}
