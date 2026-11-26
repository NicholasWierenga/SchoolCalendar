import { useRef, useState } from 'react'
import { useList } from '../../components/useList'
import EventDetails from './EventDetails'
import EventList from './EventList'

export default function EventsPage({ revision, onEdit, onDelete, onApprove, personal = false }) {
  const list = useList(personal ? '/events/mine' : '/events/manage', revision, { refreshOnFocus: personal })
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [approvingId, setApprovingId] = useState(null)
  const [approvalError, setApprovalError] = useState(null)
  const rowApprovalInFlight = useRef(false)
  const detail = list.items.find((event) => event.id === selectedEvent?.id)
    ?? (list.loading && !personal ? selectedEvent : null)
  if (selectedEvent && !list.loading && !detail) setSelectedEvent(null)

  function openDetails(event) {
    setApprovalError(null)
    setSelectedEvent(event)
  }

  async function approveFromRow(event) {
    if (rowApprovalInFlight.current) return
    rowApprovalInFlight.current = true
    setApprovingId(event.id)
    setApprovalError(null)
    try {
      await onApprove(event)
    } catch (err) {
      setApprovalError({ id: event.id, message: err.message })
    } finally {
      rowApprovalInFlight.current = false
      setApprovingId(null)
    }
  }

  const management = personal ? undefined : {
    approvingId,
    approvalError,
    onApprove: approveFromRow,
    onEdit,
    onDelete,
  }

  return (
    <EventList list={list} personal={personal} onView={openDetails} management={management}>
      {detail && (
        <EventDetails
          event={detail}
          onClose={() => setSelectedEvent(null)}
          onApprove={onApprove}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </EventList>
  )
}
