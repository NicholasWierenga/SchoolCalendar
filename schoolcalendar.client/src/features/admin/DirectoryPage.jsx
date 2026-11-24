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
  const { items, loading, error } = useList('/' + kind + 's', revision)
  const isUser = kind === 'user'
  const nameOf = (item) =>
    isUser ? [item.lastName + ',', item.firstName, item.middleName].filter(Boolean).join(' ') : item.name
  function saved(id) {
    setRevision((n) => n + 1)
    onChange(id)
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
        <DirectoryForm kind={kind} record={form.record} onSaved={() => saved(form.record?.id)} onClose={() => setForm(null)} />
      )}
      {deleting && (
        <ConfirmDelete
          title={'Delete ' + kind}
          name={nameOf(deleting)}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api('/' + kind + 's/' + deleting.id, { method: 'DELETE' })
            saved(deleting.id)
          }}
        />
      )}
    </section>
  )
}
