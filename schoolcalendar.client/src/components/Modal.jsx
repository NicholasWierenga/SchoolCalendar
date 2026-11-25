import { useId, useLayoutEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, children, onClose }) {
  const dialog = useRef(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="app-dialog"
      closedby="any"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Canceling a file chooser also sends a bubbling cancel event.
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onClose()
      }}
    >
      <header className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  )
}
