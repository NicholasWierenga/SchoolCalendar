import { useId, useRef, useState } from 'react'
import { Check, Eye, Pencil, Trash2 } from 'lucide-react'
import { api } from '../../api'
import { useList } from '../../components/useList'
import ConfirmDelete from '../../components/ConfirmDelete'
import EventDetails from './EventDetails'
import { localSchedule } from './eventFields'
import './events.css'

function EventTable({ rows, pending, queue, approving, problem, onApprove, onView, onEdit, onDelete }) {
  const personLabel = pending ? 'Submitted by' : 'Approved by'
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
              <tr key={event.id} data-testid={queue ? 'pending-event' : 'event-record'}>
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
                    {pending && (
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
                      data-testid={queue ? 'delete-pending' : 'delete-record'}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
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

export default function EventsPage({ pending: queue, revision, onEdit, onChange, onApprove }) {
  const { items, loading, error } = useList(queue ? '/events/pending' : '/events/manage', revision)
  const headingId = useId()
  const [detail, setDetail] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [approving, setApproving] = useState(null)
  const [problem, setProblem] = useState(null)
  const approvalInFlight = useRef(false)

  async function approve(event) {
    if (approvalInFlight.current) return
    approvalInFlight.current = true
    setApproving(event.id)
    setProblem(null)
    try {
      await onApprove(event)
      setDetail((current) => (current?.id === event.id ? null : current))
    } catch (err) {
      setProblem({ id: event.id, message: err.message })
    } finally {
      approvalInFlight.current = false
      setApproving(null)
    }
  }

  const groups = queue
    ? [{ status: 'pending', rows: items }]
    : [
        { status: 'pending', title: 'Pending requests', rows: items.filter((event) => event.status === 'pending') },
        { status: 'approved', title: 'Published events', rows: items.filter((event) => event.status === 'approved') },
      ]

  return (
    <section className="content-page">
      <header className="page-heading">
        <h1 id={headingId}>{queue ? 'Approval queue' : 'Events'}</h1>
      </header>
      <div className="event-groups" data-testid={queue ? 'pending-list' : 'event-list'} aria-busy={!!loading}>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loading && <p role="status">Loading…</p>}
        {!loading &&
          !error &&
          groups.map(({ rows, status, title }) => {
            const groupHeadingId = headingId + '-' + status
            const pending = status === 'pending'
            return (
              <section
                key={status}
                className={queue ? undefined : 'event-group event-group--' + status}
                aria-labelledby={queue ? headingId : groupHeadingId}
              >
                {title && (
                  <header className="event-group-heading">
                    <h2 id={groupHeadingId}>{title}</h2>
                    <span className="event-group-count">{rows.length}</span>
                  </header>
                )}
                {rows.length === 0 ? (
                  <p className="empty-state">
                    {pending ? 'No events are waiting for approval.' : 'No published events yet.'}
                  </p>
                ) : (
                  <EventTable
                    rows={rows}
                    pending={pending}
                    queue={queue}
                    approving={approving}
                    problem={problem?.id === detail?.id ? null : problem}
                    onApprove={approve}
                    onView={setDetail}
                    onEdit={onEdit}
                    onDelete={setDeleting}
                  />
                )}
              </section>
            )
          })}
      </div>
      {detail && (
        <EventDetails
          event={detail}
          onClose={() => setDetail(null)}
          onApprove={() => approve(detail)}
          approvalDisabled={approving !== null}
          approving={approving === detail.id}
          approvalError={problem?.id === detail.id ? problem.message : ''}
        />
      )}
      {deleting && (
        <ConfirmDelete
          title="Delete event"
          name={deleting.title}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api('/events/' + deleting.id + '?version=' + encodeURIComponent(deleting.version), {
              method: 'DELETE',
            })
            onChange(deleting.id, deleting.title + ' deleted.')
          }}
        />
      )}
    </section>
  )
}
