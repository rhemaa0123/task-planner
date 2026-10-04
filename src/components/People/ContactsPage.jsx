import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { PlusIcon, TrashIcon, SearchIcon } from '../icons'
import { DashedOutline } from '../Dash'
import { useScrollLock } from '../../hooks/useScrollLock'

/* ============================================================
   Contacts

   Name, email, phone, and one field that stands where an address book would
   put "Organization". That field is deliberately looser than a company: it
   answers "where do I know this person from" — the place they work, the
   course they study, a club, a conference, a street. An address book that
   insists on an employer has nothing to say about half the people in it.

   No photographs. A contact here is something you typed, and an avatar would
   only ever be a coloured circle with an initial in it pretending to be one.
   ============================================================ */

const BLANK = { name: '', email: '', phone: '', from: '', note: '' }

function ContactDialog({ entry, onSave, onClose }) {
  // Holds the page still underneath; on touch a drag on the backdrop
  // would otherwise scroll the plan away behind the dialog
  useScrollLock()
  const [form, setForm] = useState({ ...BLANK, ...(entry || {}) })

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  // A name is the only thing a contact cannot do without - everything else is
  // something you may simply not have yet
  const valid = form.name.trim().length > 0

  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    onSave(form)
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal-card" role="dialog" aria-label="Contact" onSubmit={submit}>
        <div className="modal-eyebrow">{entry ? 'EDIT' : 'NEW'}</div>
        <h2 className="modal-title">{entry ? 'Edit contact' : 'Add a contact'}</h2>
        <div className="modal-divider" />

        <label className="field-label" htmlFor="ct-name">Name</label>
        <input id="ct-name" type="text" className="field-input" value={form.name}
          autoFocus placeholder="Full name" onChange={set('name')} />

        <label className="field-label" htmlFor="ct-email">Email</label>
        <input id="ct-email" type="email" className="field-input" value={form.email}
          placeholder="name@example.com" onChange={set('email')} />

        <div className="field-row">
          <div className="field-col">
            <label className="field-label" htmlFor="ct-phone">Phone</label>
            <input id="ct-phone" type="tel" className="field-input" value={form.phone}
              placeholder="Optional" onChange={set('phone')} />
          </div>
          <div className="field-col">
            <label className="field-label" htmlFor="ct-from">Where from</label>
            <input id="ct-from" type="text" className="field-input" value={form.from}
              placeholder="Work, school, a club…" onChange={set('from')} />
          </div>
        </div>

        <label className="field-label" htmlFor="ct-note">Note</label>
        <input id="ct-note" type="text" className="field-input" value={form.note}
          placeholder="Optional" onChange={set('note')} />

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={!valid}>
            {entry ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  )
}

// The three columns worth sorting by. Everything compares as a string, and an
// empty value always sorts last whichever way the arrow points - a blank is
// not "before A", it is "not filled in".
const SORTS = [
  { id: 'name', label: 'Name' },
  { id: 'email', label: 'Email' },
  { id: 'from', label: 'Where from' },
]

const compare = (a, b, key, dir) => {
  const x = (a[key] || '').trim()
  const y = (b[key] || '').trim()
  if (!x && !y) return 0
  if (!x) return 1
  if (!y) return -1
  return x.localeCompare(y, undefined, { sensitivity: 'base' }) * dir
}

export function ContactsPage() {
  const { contacts, addContact, updateContact, deleteContact } = useApp()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: 'name', dir: 1 })

  const q = query.trim().toLowerCase()
  const shown = contacts
    .filter((c) => !q || `${c.name} ${c.email} ${c.phone} ${c.from} ${c.note}`.toLowerCase().includes(q))
    .slice()
    .sort((a, b) => compare(a, b, sort.key, sort.dir))

  // Clicking the column you are already on turns the arrow round
  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }))

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-left">
          <div className="eyebrow">PEOPLE</div>
          <h1 className="page-title">Contacts</h1>
        </div>
        <button type="button" className="btn-primary with-icon" onClick={() => setAdding(true)}>
          <PlusIcon />
          Add contact
        </button>
      </div>

      {contacts.length > 0 && (
        <div className="list-tools">
          <div className="search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search name, email, where from…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search contacts"
            />
          </div>
          <span className="list-stat">
            {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
          </span>
        </div>
      )}

      {contacts.length === 0 ? (
        <button type="button" className="empty-box" onClick={() => setAdding(true)}>
          <DashedOutline r={12} />
          <b>No contacts yet</b>
          <span>Names, emails, and where you know them from</span>
        </button>
      ) : (
        <div className="table-wrap">
          <table className="ct-table">
            <thead>
              <tr>
                {SORTS.map((s) => (
                  <th key={s.id} className={sort.key === s.id ? 'sorted' : ''}>
                    <button type="button" onClick={() => toggleSort(s.id)}>
                      {s.label}
                      <span className="sort-mark" aria-hidden="true">
                        {sort.key === s.id ? (sort.dir === 1 ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  </th>
                ))}
                <th>Phone</th>
                <th className="ct-end"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id}>
                  <td className="ct-name">
                    <button type="button" onClick={() => setEditing(c)} title="Edit">
                      {c.name}
                    </button>
                    {c.note && <span className="ct-note">{c.note}</span>}
                  </td>
                  <td className="ct-email">
                    {c.email
                      ? <a href={`mailto:${c.email}`}>{c.email}</a>
                      : <span className="muted">—</span>}
                  </td>
                  <td className="ct-from">
                    {c.from ? <span className="ct-tag">{c.from}</span> : <span className="muted">—</span>}
                  </td>
                  <td className="ct-phone">{c.phone || <span className="muted">—</span>}</td>
                  <td className="ct-end">
                    <button
                      type="button"
                      className="row-del"
                      onClick={() => deleteContact(c.id)}
                      aria-label={`Remove ${c.name}`}
                    >
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {shown.length === 0 && <p className="list-none">Nobody matches “{query}”.</p>}
        </div>
      )}

      {adding && <ContactDialog onSave={addContact} onClose={() => setAdding(false)} />}
      {editing && (
        <ContactDialog
          entry={editing}
          onSave={(patch) => updateContact(editing.id, patch)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
