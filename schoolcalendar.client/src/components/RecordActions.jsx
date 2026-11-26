import { Pencil, Trash2 } from 'lucide-react'

export default function RecordActions({ name, disabled, onEdit, onDelete, children }) {
  const actions = [
    { label: 'Edit', Icon: Pencil, testId: 'edit-record', onClick: onEdit },
    { label: 'Delete', Icon: Trash2, testId: 'delete-record', onClick: onDelete, danger: true },
  ]
  return (
    <div className="row-actions">
      {children}
      {actions.map(({ label, Icon, testId, onClick, danger }) => (
        <button
          key={testId}
          type="button"
          className={danger ? 'icon-button delete-icon' : 'icon-button'}
          aria-label={label + ' ' + name}
          disabled={disabled}
          onClick={onClick}
          data-testid={testId}
        >
          <Icon size={16} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
