import { useState } from 'react'
import { Check, Eye, Pencil, Trash2 } from 'lucide-react'
import { api } from '../../api'
import { useList } from '../../components/useList'
import ConfirmDelete from '../../components/ConfirmDelete'
import EventDetails from './EventDetails'
import { localSchedule } from './eventFields'

export default function EventsPage({ pending, revision, onEdit, onChange }) {
  const { items, loading, error } = useList(pending ? '/events/pending' : '/events/manage', revision)
  const [detail, setDetail] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [approving, setApproving] = useState(null)
  const [problem, setProblem] = useState('')
  async function approve(event) {
    setApproving(event.id)
    setProblem('')
    try {
      await api('/events/' + event.id + '/approve', { method: 'POST', body: { version: event.version } })
      onChange(event.id, event.title + ' approved.')
    } catch (err) {
      setProblem(err.message)
    } finally {
      setApproving(null)
    }
  }
  return (
    <section className="content-page">
      <header className="page-heading">
        <h1>{pending ? 'Approval queue' : 'Events'}</h1>
      </header>
      <div data-testid={pending ? 'pending-list' : 'event-list'} aria-busy={!!loading}>
        {(error || problem) && (
          <p className="form-error" role="alert">
            {error || problem}
          </p>
        )}
        {loading && <p role="status">Loading…</p>}
        {!loading && !error && !items.length && (
          <p className="empty-state">{pending ? 'No events are waiting for approval.' : 'No events yet.'}</p>
        )}
        {items.length > 0 && (
          <div className="table-wrap">
            <table className="records">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Scheduled for</th>
                  <th>{pending ? 'Submitted by' : 'Status'}</th>
                  <th className="actions-head">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((event) => (
                  <tr key={event.id} data-testid={pending ? 'pending-event' : 'event-record'}>
                    <th scope="row">
                      <span data-testid="event-title">{event.title}</span>
                      {event.location && <small>{event.location}</small>}
                    </th>
                    <td>{localSchedule(event)}</td>
                    <td>
                      {pending
                        ? event.creatorName
                        : event.status === 'approved'
                          ? 'Published'
                          : 'Pending approval'}
                    </td>
                    <td>
                      <div className="row-actions">
                        {pending && (
                          <button
                            className="approve-button"
                            disabled={approving !== null}
                            onClick={() => approve(event)}
                            data-testid="approve-pending"
                          >
                            <Check size={15} />
                            Approve
                          </button>
                        )}
                        <button
                          className="icon-button"
                          aria-label={'View ' + event.title}
                          onClick={() => setDetail(event)}
                          data-testid="view-record"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={'Edit ' + event.title}
                          onClick={() => onEdit(event)}
                          data-testid="edit-record"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button delete-icon"
                          aria-label={'Delete ' + event.title}
                          onClick={() => setDeleting(event)}
                          data-testid={pending ? 'delete-pending' : 'delete-record'}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {detail && <EventDetails event={detail} onClose={() => setDetail(null)} />}
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
