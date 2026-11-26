import { useRef, useState } from 'react'

export function useDialogAction(onClose, { clearErrorOnRetry = true } = {}) {
  const inFlight = useRef(false)
  const [pending, setPending] = useState(null)
  const [error, setError] = useState('')

  function close() {
    if (!inFlight.current) onClose()
  }

  async function run(action, name = 'submit') {
    if (inFlight.current) return
    inFlight.current = true
    setPending(name)
    if (clearErrorOnRetry) setError('')
    try {
      await action()
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      inFlight.current = false
      setPending(null)
    }
  }

  return { busy: pending !== null, pending, error, setError, close, run }
}
