import { useId, useRef, useState } from 'react'
import EventImage from '../../components/EventImage'
import { builtInImages } from './eventFields'

function readImage(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 512 * 1024) {
    throw new Error('Choose a PNG, JPG or WebP image up to 512 KB.')
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('The image could not be read.'))
    reader.readAsDataURL(file)
  })
}

export default function EventImagePicker({ image, disabled, onChange, onReadingChange, onError }) {
  const input = useRef(null)
  const helpId = useId()
  const [uploadedFile, setUploadedFile] = useState(() =>
    image?.startsWith('data:') ? { data: image, name: 'Current image' } : null,
  )

  async function upload(event) {
    const file = event.target.files[0]
    if (!file) return
    event.target.value = ''
    onReadingChange(true)
    onError('')
    try {
      const data = await readImage(file)
      setUploadedFile({ data, name: file.name })
      onChange(data)
    } catch (error) {
      onError(error.message)
    } finally {
      onReadingChange(false)
    }
  }

  return (
    <>
      <label>
        Event image
        <select
          className="event-image-select"
          value={image?.startsWith('data:') ? 'upload' : (image ?? '')}
          disabled={disabled}
          onChange={(event) => {
            const choice = event.target.value
            onChange(choice === 'upload' ? uploadedFile.data : choice || null)
          }}
        >
          <button type="button"><selectedcontent /></button>
          <option value="">No image</option>
          {Object.entries(builtInImages).map(([value, { label, symbol }]) => (
            <option key={value} value={value} aria-label={label}>{symbol} {label}</option>
          ))}
          {/* Replacing the option refreshes the browser's copy of the selected thumbnail. */}
          {uploadedFile && (
            <option key={uploadedFile.data} value="upload">
              <EventImage image={uploadedFile.data} />
              Uploaded image
            </option>
          )}
        </select>
      </label>
      <fieldset className="upload-field">
        <legend>Upload an image</legend>
        <p className="muted" id={helpId}>PNG, JPG or WebP · 512 KB max</p>
        <div className="upload-controls">
          <button type="button" disabled={disabled} aria-describedby={helpId} onClick={() => input.current.click()}>
            Choose file
          </button>
          <span role="status">{uploadedFile?.name ?? 'No file chosen'}</span>
        </div>
        <input
          ref={input}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled}
          onChange={upload}
          data-testid="event-image-input"
        />
      </fieldset>
    </>
  )
}
