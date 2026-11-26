import { Check, Eye, Pencil, Trash2 } from 'lucide-react'
import { localSchedule } from './eventFields'
import './events.css'

function EventTable({ rows, pending, onView, management }) {
  const personLabel = pending ? 'Submitted by' : 'Approved by'
  const { approving, problem, onApprove, onEdit, onDelete } = management ?? {}
  return (
    <div className="table-wrap">
      <table className="records event-records">
        <thead>
          <tr>
            <th scope="col">Event</th>
            <th scope="col">Scheduled for</th>
            <th scope="col">{personLabel}</th>
            <th scope="col" className="actions-head">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((event) => {
            const busy = approving === event.id
            return (
              <tr key={event.id} data-testid="event-record">
                <th scope="row">
                  <span data-testid="event-title">{event.title}</span>
                  {event.location && <small>{event.location}</small>}
                </th>
                <td>
                  <span className="event-mobile-label" aria-hidden="true">Scheduled for</span>
                  {localSchedule(event)}
                </td>
                <td>
                  <span className="event-mobile-label" aria-hidden="true">{personLabel}</span>
                  {pending ? event.creatorName : event.approverName}
                </td>
                <td>
                  <div className="row-actions">
                    {pending && onApprove && (
                      <button
                        type="button"
                        className="approve-button"
                        disabled={approving !== null}
                        onClick={() => onApprove(event)}
                        data-testid="approve-pending"
                      >
                        <Check size={15} aria-hidden="true" />
                        {busy ? 'Approving…' : 'Approve'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={'View ' + event.title}
                      title="View details"
                      onClick={() => onView(event)}
                      data-testid="view-record"
                    >
                      <Eye size={16} aria-hidden="true" />
                    </button>
                    {management && (
                      <>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={'Edit ' + event.title}
                          disabled={busy}
                          onClick={() => onEdit(event)}
                          data-testid="edit-record"
                        >
                          <Pencil size={16} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-button delete-icon"
                          aria-label={'Delete ' + event.title}
                          disabled={busy}
                          onClick={() => onDelete(event)}
                          data-testid="delete-record"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                  {problem?.id === event.id && (
                    <p className="form-error event-approval-error" role="alert">
                      {problem.message}
                    </p>
                  )}
                </td>
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
  const groups = [
    { status: 'pending', title: 'Pending requests', rows: items.filter((event) => event.status === 'pending') },
    { status: 'approved', title: 'Published events', rows: items.filter((event) => event.status === 'approved') },
  ]

  return (
    <section className="content-page">
      <header className="page-heading">
        <h1>{personal ? 'My Events' : 'Events'}</h1>
      </header>
      <div className="event-groups" data-testid={personal ? 'my-event-list' : 'event-list'} aria-busy={!!loading}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loading && <p role="status">Loading…</p>}
        {!loading &&
          !error &&
          groups.map(({ rows, status, title }) => {
            const groupHeadingId = listId + '-' + status
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
                  <p className="empty-state">
                    {pending ? 'No events are waiting for approval.' : 'No published events yet.'}
                  </p>
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
