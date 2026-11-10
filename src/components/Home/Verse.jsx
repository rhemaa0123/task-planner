import React, { useState, useEffect } from 'react'
import { useToday } from '../../hooks/useToday'
import { useScrollLock } from '../../hooks/useScrollLock'
import { useVerse, listVersions, DEFAULT_VERSION } from '../../hooks/useVerse'
import { toISODate, formatShortDate } from '../../utils'

/* ---- Verse of the day ----
   The first thing on Home: bible.com's verse of the day, asked for "slightly
   large and visible every day". Until a YouVersion key has been added it is a
   one-line offer to set it up, and nothing is sent anywhere. */
export function VerseBanner() {
  const today = toISODate(useToday())
  const { setup, setSetup, verse, status, retry } = useVerse(today)
  const [editing, setEditing] = useState(false)

  return (
    <section className="home-verse" aria-label="Verse of the day">
      <div className="home-verse-head">
        <span className="eyebrow">VERSE OF THE DAY</span>
        {setup && (
          <button type="button" className="panel-link as-btn" onClick={() => setEditing(true)}>
            {setup.version || 'Version'} ↗
          </button>
        )}
      </div>

      {!setup ? (
        <button type="button" className="home-verse-setup" onClick={() => setEditing(true)}>
          <b>Show bible.com&rsquo;s verse here, every day</b>
          It needs a free YouVersion key. Nothing is sent anywhere until you add one.
        </button>
      ) : verse ? (
        <>
          <blockquote className="home-verse-text">&ldquo;{verse.text}&rdquo;</blockquote>
          <div className="home-verse-foot">
            <a
              className="home-verse-ref"
              href={`https://www.bible.com/bible/${verse.versionId}/${verse.passageId}`}
              target="_blank"
              rel="noreferrer"
            >
              {verse.reference} {verse.version}
            </a>
            {verse.date !== today && (
              <span className="home-verse-stale">from {formatShortDate(verse.date)}</span>
            )}
            <span className="home-verse-credit">{verse.credit}</span>
          </div>
        </>
      ) : (
        <p className="home-verse-note">
          {status === 'loading' ? 'Fetching today’s verse…'
            : status === 'badkey' ? 'YouVersion did not accept the key.'
            : status === 'licence' ? `Your key cannot read the ${setup.version || 'chosen version'} yet.`
            : 'Today’s verse could not be fetched.'}
          {status === 'error' && (
            <button type="button" className="panel-link as-btn" onClick={retry}>Try again</button>
          )}
          {(status === 'badkey' || status === 'licence') && (
            <button type="button" className="panel-link as-btn" onClick={() => setEditing(true)}>Change</button>
          )}
        </p>
      )}

      {editing && <VerseDialog setup={setup} onSave={setSetup} onClose={() => setEditing(false)} />}
    </section>
  )
}

/* The key, and which version to read it in. The versions offered are the ones
   the key can actually read, so a choice made here cannot fail later for
   want of a licence. */
function VerseDialog({ setup, onSave, onClose }) {
  useScrollLock()
  const [key, setKey] = useState(setup?.key || '')
  // null until the key has been checked; then the versions it may read
  const [versions, setVersions] = useState(null)
  const [versionId, setVersionId] = useState(setup?.versionId || DEFAULT_VERSION.id)
  const [state, setState] = useState('idle')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const check = async (value) => {
    const k = value.trim()
    if (!k) return
    setState('checking')
    try {
      const found = await listVersions(k)
      const options = found.length ? found : [DEFAULT_VERSION]
      setVersions(options)
      setVersionId((id) => (options.some((v) => v.id === id) ? id
        : (options.find((v) => v.id === DEFAULT_VERSION.id) || options[0]).id))
      setState('idle')
    } catch (err) {
      setVersions(null)
      setState(err.status === 401 ? 'bad' : 'offline')
    }
  }

  // A key already in use is checked as the dialog opens, so its versions are
  // there to pick from without pressing anything
  useEffect(() => {
    if (setup?.key) check(setup.key)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = (e) => {
    e.preventDefault()
    if (!versions) return
    const v = versions.find((x) => x.id === Number(versionId)) || DEFAULT_VERSION
    onSave({ key: key.trim(), versionId: v.id, version: v.abbr })
    onClose()
  }

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="modal-card" role="dialog" aria-label="Verse of the day" onSubmit={save}>
        <div className="modal-eyebrow">VERSE OF THE DAY</div>
        <h2 className="modal-title">Bible.com&rsquo;s verse, every day</h2>
        <div className="modal-divider" />

        <p className="modal-copy">
          Bible.com hands out its verse of the day through YouVersion&rsquo;s developer
          API, which asks for a free key:
        </p>
        <ol className="verse-steps">
          <li>
            Sign in at{' '}
            <a href="https://platform.youversion.com" target="_blank" rel="noreferrer">platform.youversion.com</a>{' '}
            with your Bible App account.
          </li>
          <li>Add a new app, marked non-commercial.</li>
          <li>Copy its App Key and paste it here.</li>
        </ol>

        <label className="field-label" htmlFor="verse-key">App key</label>
        <div className="verse-key-row">
          <input
            id="verse-key"
            type="text"
            className="field-input verse-key"
            value={key}
            placeholder="Paste the key"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => { setKey(e.target.value); setVersions(null); setState('idle') }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || versions) return
              e.preventDefault()
              check(key)
            }}
          />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => check(key)}
            disabled={!key.trim() || state === 'checking'}
          >
            {state === 'checking' ? 'Checking…' : 'Check'}
          </button>
        </div>
        {state === 'bad' && <p className="verse-msg warn">YouVersion did not accept that key.</p>}
        {state === 'offline' && (
          <p className="verse-msg warn">Could not reach YouVersion - check the connection and try again.</p>
        )}

        {versions && (
          <>
            <label className="field-label" htmlFor="verse-version">Version</label>
            <select
              id="verse-version"
              className="field-input verse-version"
              value={versionId}
              onChange={(e) => setVersionId(Number(e.target.value))}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.title ? `${v.abbr} - ${v.title}` : v.abbr}</option>
              ))}
            </select>
            <p className="verse-msg">
              Bible.com shows the NIV. It is listed here once you accept Biblica&rsquo;s
              licence in the portal; the BSB needs nothing.
            </p>
          </>
        )}

        <p className="verse-msg">
          The key stays in this browser. Once a day Home sends it to YouVersion to ask
          for that day&rsquo;s verse, and nothing else of yours goes with it.
        </p>

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          {setup && (
            <button type="button" className="btn-ghost" onClick={() => { onSave(null); onClose() }}>
              Turn off
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={!versions}>Save</button>
        </div>
      </form>
    </div>
  )
}
