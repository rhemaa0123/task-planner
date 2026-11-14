import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../../context/AppContext'
import { useScrollLock } from '../../hooks/useScrollLock'
import { AccountIcon } from '../icons'

/* ============================================================
   Google sign-in, Nov 2026: the sidebar row, the account dialog, and the
   dialog that asks what to do when this device and the account both hold a
   planner. The work itself is in src/sync/useCloudSync.js.

   The dialogs are portalled to <body>. On a phone the sidebar is a drawer
   moved with `transform`, and a transformed ancestor captures
   `position: fixed` - inside it, the overlay would cover the drawer and
   not the screen.
   ============================================================ */

const STATUS = {
  'signed-out': 'Not signed in',
  connecting: 'Connecting…',
  waiting: 'Waiting for a connection…',
  choosing: 'Waiting for your choice…',
  syncing: 'Syncing…',
  synced: 'Synced',
  offline: 'Offline · saved here',
  expired: 'Signed out · sign in again',
  error: 'Sync problem',
}

const signedInWith = (cloud) => Boolean(cloud.account) && cloud.status !== 'signed-out'

const initialOf = (account) =>
  (String(account?.name || account?.email || '?').trim()[0] || '?').toUpperCase()

// Google's own mark, in its own colours - the one place the brand asks to be
// shown as it is
const GoogleMark = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z" />
    <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
  </svg>
)

/* ---- The sidebar row ----
   Above About and Settings. Signed out it is an invitation; signed in it is
   who you are and whether the account has everything. On the rail it is the
   icon alone, with a dot for the state. */
export function AccountRow({ collapsed, onOpen }) {
  const { cloud } = useApp()
  const inside = signedInWith(cloud)
  const name = inside ? (cloud.account.email || cloud.account.name || 'Signed in') : 'Sign in with Google'
  const state = STATUS[cloud.status] || ''

  return (
    <button
      type="button"
      className={`nav-row as-button account-row is-${cloud.status}`}
      onClick={onOpen}
      title={collapsed ? (inside ? `${name} · ${state}` : name) : undefined}
    >
      <span className="nav-icon account-icon">
        {inside ? <span className="account-initial">{initialOf(cloud.account)}</span> : <AccountIcon />}
        {inside && <span className="account-dot" aria-hidden="true" />}
      </span>
      <span className="nav-label account-text">
        <span className="account-name">{name}</span>
        {inside && <span className="account-state">{state}</span>}
      </span>
    </button>
  )
}

function Overlay({ label, onDismiss, children, wide = false }) {
  useScrollLock()
  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => { if (onDismiss && e.target === e.currentTarget) onDismiss() }}
    >
      <div className={`modal-card account-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

/* ---- The account dialog ---- */
export function AccountDialog({ onClose }) {
  const { cloud } = useApp()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const inside = signedInWith(cloud)
  // Only a linked device is cleared at sign-out; one whose first sign-in
  // never finished keeps its data, and the confirm says which
  const linked = cloud.linked

  // Escape closes, unless the merge dialog is open over this one - that one
  // needs an answer
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !cloud.merge) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, cloud.merge])

  const signIn = async () => {
    setBusy(true)
    await cloud.signIn()
    setBusy(false)
  }

  const signOut = async () => {
    setBusy(true)
    await cloud.signOut()
    setBusy(false)
    onClose()
  }

  if (!inside) {
    return (
      <Overlay label="Account" onDismiss={onClose}>
        <div className="modal-eyebrow">ACCOUNT</div>
        <h2 className="modal-title">Keep it in your Google account</h2>
        <p className="modal-copy">
          Signing in copies this planner into your Google account and keeps it the
          same on every device you sign in on. Signed out, everything stays on this
          machine, as it does now.
        </p>
        {!cloud.configured && (
          <p className="account-note">Accounts are not set up on this copy of the planner.</p>
        )}
        {cloud.error && <p className="account-error" role="alert">{cloud.error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>Not now</button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="btn-primary with-icon google-btn"
            onClick={signIn}
            disabled={busy || !cloud.configured}
          >
            <GoogleMark />
            Continue with Google
          </button>
        </div>
      </Overlay>
    )
  }

  const pending = cloud.unsynced
  return (
    <Overlay label="Account" onDismiss={confirming ? null : onClose}>
      <div className="modal-eyebrow">ACCOUNT</div>
      <div className="account-who">
        <span className="account-initial big">{initialOf(cloud.account)}</span>
        <div className="account-who-text">
          <h2 className="modal-title">{cloud.account.name || 'Signed in'}</h2>
          {cloud.account.email && <div className="account-email">{cloud.account.email}</div>}
        </div>
      </div>

      <div className={`account-status is-${cloud.status}`}>
        <span className="account-dot" aria-hidden="true" />
        {STATUS[cloud.status]}
        {pending > 0 && cloud.status !== 'synced' && (
          <span> · {pending} {pending === 1 ? 'change' : 'changes'} not sent yet</span>
        )}
      </div>
      {cloud.error && <p className="account-error" role="alert">{cloud.error}</p>}

      {confirming ? (
        <>
          <p className="modal-copy account-confirm">
            {linked
              ? 'Signing out clears this device’s copy. Everything stays in your account and comes back when you sign in again.'
              : 'This device’s planner was not copied into the account yet, so it stays here as it is.'}
            {linked && pending > 0 && (
              <strong> {pending} {pending === 1 ? 'change has' : 'changes have'} not reached the account yet and would be lost.</strong>
            )}
          </p>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>Cancel</button>
            <span style={{ flex: 1 }} />
            <button type="button" className="btn-danger" onClick={signOut} disabled={busy}>Sign out</button>
          </div>
        </>
      ) : (
        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={() => setConfirming(true)}>Sign out</button>
          {cloud.status === 'expired' && (
            <button type="button" className="btn-ghost with-icon google-btn" onClick={signIn} disabled={busy}>
              <GoogleMark />
              Sign in again
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      )}
    </Overlay>
  )
}

/* ---- Both sides hold a planner ----
   Opened by useCloudSync while it waits for an answer. No Escape and no
   backdrop click: nothing is decided by accident. */
export function MergeDialog() {
  const { cloud } = useApp()
  const ask = cloud.merge
  if (!ask) return null

  const side = (title, lines) => (
    <div className="merge-side">
      <div className="merge-side-title">{title}</div>
      {lines.length
        ? <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
        : <p className="merge-empty">Nothing yet</p>}
    </div>
  )

  return (
    <Overlay label="Choose which planner to keep" wide>
      <div className="modal-eyebrow">SIGNING IN</div>
      <h2 className="modal-title">This device and your account both have a planner</h2>
      <div className="merge-sides">
        {side('This device', ask.device)}
        {side('Your account', ask.account)}
      </div>

      <div className="merge-options">
        <button type="button" className="merge-option" onClick={() => cloud.resolveMerge('combine')}>
          <span className="merge-option-title">Combine both</span>
          <span className="merge-option-copy">
            Everything from both is kept. Where the same item was changed in both
            places, the account’s version wins.
          </span>
        </button>
        <button type="button" className="merge-option" onClick={() => cloud.resolveMerge('account')}>
          <span className="merge-option-title">Use the account’s</span>
          <span className="merge-option-copy">This device’s planner is replaced by the one in your account.</span>
        </button>
        <button type="button" className="merge-option" onClick={() => cloud.resolveMerge('device')}>
          <span className="merge-option-title">Replace the account with this device’s</span>
          <span className="merge-option-copy">The planner in your account is replaced by this one.</span>
        </button>
      </div>

      <p className="account-note">Whichever planner is replaced is backed up in your account first.</p>

      <div className="modal-actions">
        <button type="button" className="btn-ghost" onClick={() => cloud.resolveMerge('cancel')}>
          Cancel and sign out
        </button>
      </div>
    </Overlay>
  )
}
