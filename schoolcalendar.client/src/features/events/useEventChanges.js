import { useRef, useState } from 'react'
import { api } from '../../api'
import { changedEventFields, eventFields } from './eventFields'

export function useEventChanges(onChange) {
  const [lastChange, setLastChange] = useState(null)
  const writeInFlight = useRef(false)

  async function edit(before, values, { restoring = false } = {}) {
    if (writeInFlight.current) throw new Error('Please wait for the current change to finish.')
    const patch = changedEventFields(before, values)
    if (!Object.keys(patch).length) return before
    writeInFlight.current = true
    try {
      const after = await api(`/events/${before.id}`, {
        method: 'PATCH',
        body: { ...patch, version: before.version },
      })
      setLastChange(restoring ? null : { before, after })
      onChange(after, after.title + (restoring ? ' restored.' : ' saved.'))
      return after
    } finally {
      writeInFlight.current = false
    }
  }

  function move(before, date) {
    return edit(before, { date })
  }

  async function undo() {
    if (!lastChange) return
    const { before, after } = lastChange
    return edit(after, eventFields(before), { restoring: true })
  }

  function forget(id) {
    setLastChange((change) => (change?.after.id === id ? null : change))
  }

  return { lastChange, edit, move, undo, forget }
}
