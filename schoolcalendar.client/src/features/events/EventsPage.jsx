import { useRef, useState } from 'react'
import { useList } from '../../components/useList'
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

export default function EventsPage({ revision, onEdit, onDelete, onApprove }) {
  const list = useList('/events/manage', revision)
  const [selected, setSelected] = useState(null)
  const [approving, setApproving] = useState(null)
  const [problem, setProblem] = useState(null)
  const approvalInFlight = useRef(false)
  const detail = list.loading ? selected : list.items.find((event) => event.id === selected?.id)
  if (selected && !detail) setSelected(null)

  function openDetails(event) {
    setProblem(null)
    setSelected(event)
  }

  async function approve(event) {
    if (approvalInFlight.current) return
    approvalInFlight.current = true
    setApproving(event.id)
    setProblem(null)
    try {
      await onApprove(event)
    } catch (err) {
      setProblem({ id: event.id, message: err.message })
    } finally {
      approvalInFlight.current = false
      setApproving(null)
    }
  }

  const management = {
    approving,
    problem,
    onApprove: approve,
    onEdit,
    onDelete,
  }

  return (
    <EventList list={list} onView={openDetails} management={management}>
      {detail && (
        <EventDetails
          event={detail}
          onClose={() => setSelected(null)}
          onApprove={onApprove}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </EventList>
  )
}
