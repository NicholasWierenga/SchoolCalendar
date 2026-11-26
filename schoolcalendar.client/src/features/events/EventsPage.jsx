import { useRef, useState } from 'react'
import { api } from '../../api'
import { useList } from '../../components/useList'
import ConfirmDelete from '../../components/ConfirmDelete'
import EventDetails from './EventDetails'
import EventList from './EventList'

export function MyEventsPage({ revision }) {
  const list = useList('/events/mine', revision, { refreshOnFocus: true })
  const [detailId, setDetailId] = useState(null)
  const detail = list.items.find((event) => event.id === detailId)
  if (!list.loading && detailId !== null && !detail) setDetailId(null)

  return (
    <EventList list={list} personal onView={(event) => setDetailId(event.id)}>
      {detail && <EventDetails event={detail} onClose={() => setDetailId(null)} />}
    </EventList>
  )
}

export default function EventsPage({ revision, onEdit, onChange, onApprove }) {
  const list = useList('/events/manage', revision)
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

  const management = {
    approving,
    problem: problem?.id === detail?.id ? null : problem,
    onApprove: approve,
    onEdit,
    onDelete: setDeleting,
  }

  return (
    <EventList list={list} onView={setDetail} management={management}>
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
    </EventList>
  )
}
