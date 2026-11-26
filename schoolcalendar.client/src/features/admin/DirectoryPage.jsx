import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { api } from '../../api'
import { useList } from '../../components/useList'
import ConfirmDelete from '../../components/ConfirmDelete'
import DirectoryForm from './DirectoryForm'

export default function DirectoryPage({ kind, onChange }) {
  const [revision, setRevision] = useState(0)
  const [form, setForm] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const directoryPath = '/' + kind + 's'
  const { items, loading, error } = useList(directoryPath, revision)
  const latestRecord = form?.record && items.find(item => item.id === form.record.id)
  const isUser = kind === 'user'
  const nameOf = (item) =>
    isUser ? [item.lastName + ',', item.firstName, item.middleName].filter(Boolean).join(' ') : item.name
  const refresh = () => setRevision(n => n + 1)

  async function writeRecord(method, record, fields) {
    let path = record ? directoryPath + '/' + record.id : directoryPath
    if (method === 'DELETE') path += '?version=' + encodeURIComponent(record.version)
    const body = method === 'PATCH' ? { ...fields, version: record.version } : fields
    try {
      await api(path, { method, body })
    } catch (err) {
      // Keep the open dialog's draft, but let the next edit start with the latest record.
      if (err.status === 409 || err.status === 404) refresh()
      throw err
    }
    refresh()
    onChange(record?.id)
  }
  return (
    <section className="content-page">
      <header className="page-heading">
        <h1>{isUser ? 'Users' : 'Locations'}</h1>
        <button className="primary" onClick={() => setForm({})} data-testid={'new-' + kind}>
          <Plus size={17} />
          Add {kind}
        </button>
      </header>
      <div data-testid={kind + '-list'} aria-busy={!!loading}>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
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
                {items.map((item) => (
                  <tr key={item.id} data-testid={kind + '-record'}>
                    <th scope="row" data-testid={isUser ? undefined : 'location-name'}>
                      {nameOf(item)}
                    </th>
                    {isUser && (
                      <>
                        <td data-testid="user-logon">{item.login}</td>
                        <td>{item.role === 'approver' ? 'Approver' : 'Standard'}</td>
                      </>
                    )}
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={'Edit ' + nameOf(item)}
                          onClick={() => setForm({ record: item })}
                          data-testid="edit-record"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          className="icon-button delete-icon"
                          aria-label={'Delete ' + nameOf(item)}
                          onClick={() => setDeleting(item)}
                          data-testid="delete-record"
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
      {form && (
        <DirectoryForm
          key={form.record?.version}
          kind={kind}
          record={form.record}
          onSave={fields => writeRecord(form.record ? 'PATCH' : 'POST', form.record, fields)}
          onReload={latestRecord && latestRecord.version !== form.record.version
            ? () => setForm({ record: latestRecord }) : undefined}
          onClose={() => setForm(null)}
        />
      )}
      {deleting && (
        <ConfirmDelete
          title={'Delete ' + kind}
          name={nameOf(deleting)}
          onClose={() => setDeleting(null)}
          onConfirm={() => writeRecord('DELETE', deleting)}
        />
      )}
    </section>
  )
}
