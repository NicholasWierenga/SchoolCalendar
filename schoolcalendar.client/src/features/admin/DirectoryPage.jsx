import { useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '../../api'
import { useList } from '../../components/useList'
import ConfirmDelete from '../../components/ConfirmDelete'
import FormError from '../../components/FormError'
import RecordActions from '../../components/RecordActions'
import DirectoryForm from './DirectoryForm'

export default function DirectoryPage({ kind, onChange }) {
  const [revision, setRevision] = useState(0)
  const [dialog, setDialog] = useState(null)
  const directoryPath = `/${kind}s`
  const { items, loading, error } = useList(directoryPath, revision)
  const record = dialog?.record
  const latestRecord = dialog?.action === 'edit' && items.find(item => item.id === record.id)
  const canReload = latestRecord && latestRecord.version !== record.version
  const isUser = kind === 'user'
  const nameOf = (item) =>
    isUser ? [item.lastName + ',', item.firstName, item.middleName].filter(Boolean).join(' ') : item.name
  const refresh = () => setRevision(previous => previous + 1)
  const closeDialog = () => setDialog(null)

  async function changeDirectory(path, request, id) {
    try {
      await api(path, request)
    } catch (err) {
      // Refresh the list while the edit dialog keeps its draft.
      if (err.status === 409 || err.status === 404) refresh()
      throw err
    }
    refresh()
    onChange(id)
  }

  function saveRecord(fields) {
    if (!record) return changeDirectory(directoryPath, { method: 'POST', body: fields })
    return changeDirectory(`${directoryPath}/${record.id}`, {
      method: 'PATCH',
      body: { ...fields, version: record.version },
    }, record.id)
  }

  function deleteRecord() {
    const path = `${directoryPath}/${record.id}?version=${encodeURIComponent(record.version)}`
    return changeDirectory(path, { method: 'DELETE' }, record.id)
  }

  return (
    <section className="content-page">
      <header className="page-heading">
        <h1>{isUser ? 'Users' : 'Locations'}</h1>
        <button className="primary" onClick={() => setDialog({ action: 'add' })} data-testid={'new-' + kind}>
          <Plus size={17} />
          Add {kind}
        </button>
      </header>
      <div data-testid={kind + '-list'} aria-busy={!!loading}>
        <FormError>{error}</FormError>
        {loading && <p role="status">Loading…</p>}
        {!loading && !error && !items.length && <p className="empty-state">No {kind}s yet.</p>}
        {items.length > 0 && (
          <div className="table-wrap">
            <table className="records">
              <thead>
                <tr>
                  <th>Name</th>
                  {isUser && (
                    <>
                      <th>Login name</th>
                      <th>Access</th>
                    </>
                  )}
                  <th className="actions-head">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const name = nameOf(item)
                  return (
                    <tr key={item.id} data-testid={kind + '-record'}>
                      <th scope="row" data-testid={isUser ? undefined : 'location-name'}>
                        {name}
                      </th>
                      {isUser && (
                        <>
                          <td data-testid="user-logon">{item.login}</td>
                          <td>{item.role === 'approver' ? 'Approver' : 'Standard'}</td>
                        </>
                      )}
                      <td>
                        <RecordActions
                          name={name}
                          onEdit={() => setDialog({ action: 'edit', record: item })}
                          onDelete={() => setDialog({ action: 'delete', record: item })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {dialog && dialog.action !== 'delete' && (
        <DirectoryForm
          key={record?.version}
          kind={kind}
          record={record}
          onSave={saveRecord}
          onReload={canReload ? () => setDialog({ action: 'edit', record: latestRecord }) : undefined}
          onClose={closeDialog}
        />
      )}
      {dialog?.action === 'delete' && (
        <ConfirmDelete
          title={'Delete ' + kind}
          name={nameOf(record)}
          onClose={closeDialog}
          onConfirm={deleteRecord}
        />
      )}
    </section>
  )
}
