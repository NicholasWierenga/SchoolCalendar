import { useState } from 'react'
import Modal from '../../components/Modal'
import EventImage from '../../components/EventImage'
import { useList } from '../../components/useList'
import { eventFields } from './eventFields'

const maxImageSize = 512 * 1024

function readImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > maxImageSize) {
    throw new Error('Choose a PNG, JPG or WebP image up to 512 KB.')
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('The image could not be read.'))
    reader.readAsDataURL(file)
  })
}

export default function EventForm({ event, date, user, onSave, onClose }) {
  const { items: locations, error: locationError, loading } = useList('/locations')
  const [values, setValues] = useState(() =>
    event ? eventFields(event) : eventFields({ title: '', date, time: '09:00' }),
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const set = (name, value) => setValues((previous) => ({ ...previous, [name]: value }))
  const publish = user.role === 'approver'
  const title = event ? 'Edit event' : publish ? 'New event' : 'Propose an event'
  async function upload(input) {
    const file = input.files[0]
    if (!file) return
    setReading(true)
    setError('')
    try {
      set('image', await readImage(file))
    } catch (err) {
      setError(err.message)
      input.value = ''
    } finally {
      setReading(false)
    }
  }
  async function submit(e) {
    e.preventDefault()
    if (busy || reading) return
    setError('')
    setBusy(true)
    try {
      await onSave(values)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
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
          <div className="image-fields">
            <label>
              Event image
              <select
                value={values.image?.startsWith('data:') ? 'upload' : (values.image ?? '')}
                onChange={(e) => set('image', e.target.value || null)}
              >
                <option value="">No image</option>
                <option value="football">Football</option>
                <option value="trophy">Trophy</option>
                {values.image?.startsWith('data:') && <option value="upload">Uploaded image</option>}
              </select>
            </label>
            {values.image && <EventImage image={values.image} />}
          </div>
          <label className="upload-field">
            Upload an image <span className="muted">PNG, JPG or WebP · 512 KB max</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy || reading}
              onChange={(e) => upload(e.target)}
              data-testid="event-image-input"
            />
          </label>
          {(error || locationError) && (
            <p role="alert" className="form-error">
              {error || locationError}
            </p>
          )}
        </div>
        <footer className="form-actions">
          <button type="button" onClick={close} disabled={busy} data-testid="cancel-form">
            Cancel
          </button>
          <button
            className="primary"
            disabled={busy || reading || loading || Boolean(locationError)}
            data-testid="save-form"
          >
            {busy ? 'Saving…' : event ? 'Save changes' : publish ? 'Publish event' : 'Submit for approval'}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
