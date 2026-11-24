import { useRef, useState } from 'react'
import { api } from '../../api'
import { changedFields, eventFields } from './eventFields'

export function useEventChanges(onChange) {
  const [lastChange, setLastChange] = useState(null)
  const writing = useRef(false)

  async function write(before, patch, undo) {
    if (writing.current) throw new Error('Please wait for the current change to finish.')
    if (!Object.keys(patch).length) return before
    writing.current = true
    try {
      const after = await api('/events/' + before.id, {
        method: 'PATCH',
        body: { ...patch, version: before.version },
      })
      setLastChange(undo ? null : { before, after })
      onChange(after, after.title + (undo ? ' restored.' : ' saved.'))
      return after
    } finally {
      writing.current = false
    }
  }

  function edit(before, values) {
    return write(before, changedFields(eventFields(before), values), false)
  }
  function move(before, date) {
    return edit(before, { date })
  }
  async function undo() {
    if (!lastChange) return
    const { before, after } = lastChange
    return write(after, changedFields(eventFields(after), eventFields(before)), true)
  }
  function forget(id) {
    setLastChange((change) => (change?.after.id === id ? null : change))
  }
  return { lastChange, edit, move, undo, forget }
}
