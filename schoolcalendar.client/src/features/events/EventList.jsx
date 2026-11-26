import { Check } from 'lucide-react'
import FormError from '../../components/FormError'
import RecordActions from '../../components/RecordActions'
import { formatEventSchedule } from './eventFields'
import { openEventFromRow } from './openEventFromRow'

const eventGroups = [
  { status: 'pending', title: 'Pending requests', emptyMessage: 'No events are waiting for approval.' },
  { status: 'approved', title: 'Published events', emptyMessage: 'No published events yet.' },
]

function EventActions({ event, management, busy }) {
  const { approvingId, approvalError, onApprove, onEdit, onDelete } = management
  return (
    <td className="event-actions-cell">
      <RecordActions
        name={event.title}
        disabled={busy}
        onEdit={() => onEdit(event)}
        onDelete={() => onDelete(event)}
      >
        {event.status === 'pending' && (
          <button
            type="button"
            className="approve-button"
            disabled={approvingId !== null}
            onClick={() => onApprove(event)}
            data-testid="approve-pending"
          >
            <Check size={15} aria-hidden="true" />
            {busy ? 'Approving…' : 'Approve'}
          </button>
        )}
      </RecordActions>
      {approvalError?.id === event.id && (
        <FormError className="form-error event-approval-error">{approvalError.message}</FormError>
      )}
    </td>
  )
}

function EventTable({ rows, pending, onView, management }) {
  const personLabel = pending ? 'Submitted by' : 'Approved by'
  return (
    <div className="table-wrap">
      <table className="records event-records">
        <thead>
          <tr>
            <th scope="col">Event</th>
            <th scope="col">Scheduled for</th>
            <th scope="col">{personLabel}</th>
            {management && <th scope="col" className="actions-head">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((event) => {
            const busy = management?.approvingId === event.id
            return (
              <tr key={event.id} data-testid="event-record" aria-busy={busy || undefined} onClick={openEventFromRow}>
                <th scope="row">
                  <button
                    type="button"
                    className="event-row-title"
                    data-event-details
                    data-testid="view-record"
                    aria-haspopup="dialog"
                    disabled={busy}
                    onClick={() => onView(event)}
                  >
                    <span data-testid="event-title">{event.title}</span>
                  </button>
                  {event.location && <small>{event.location}</small>}
                </th>
                <td>
                  <span className="event-mobile-label" aria-hidden="true">Scheduled for</span>
                  {formatEventSchedule(event)}
                </td>
                <td>
                  <span className="event-mobile-label" aria-hidden="true">{personLabel}</span>
                  {pending ? event.creatorName : event.approverName}
                </td>
                {management && <EventActions event={event} management={management} busy={busy} />}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function EventList({ list: { items, loading, error }, personal, onView, management, children }) {
  const listId = personal ? 'my-events' : 'events'

  return (
    <section className="content-page">
      <header className="page-heading">
        <h1>{personal ? 'My Events' : 'Events'}</h1>
      </header>
      <div className="event-groups" data-testid={personal ? 'my-event-list' : 'event-list'} aria-busy={!!loading}>
        <FormError>{error}</FormError>
        {loading && <p role="status">Loading…</p>}
        {!loading && !error &&
          eventGroups.map(({ status, title, emptyMessage }) => {
            const rows = items.filter((event) => event.status === status)
            const groupHeadingId = `${listId}-${status}`
            const pending = status === 'pending'
            return (
              <section
                key={status}
                className={pending ? 'event-group event-group--pending' : 'event-group'}
                aria-labelledby={groupHeadingId}
              >
                <header className="event-group-heading">
                  <h2 id={groupHeadingId}>{title}</h2>
                  <span className="event-group-count">{rows.length}</span>
                </header>
                {rows.length === 0 ? (
                  <p className="empty-state">{emptyMessage}</p>
                ) : (
                  <EventTable
                    rows={rows}
                    pending={pending}
                    onView={onView}
                    management={management}
                  />
                )}
              </section>
            )
          })}
      </div>
      {children}
    </section>
  )
}
