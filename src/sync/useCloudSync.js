import { useEffect, useRef, useState } from 'react'
import { cloudConfigured, getFirebase, usingEmulator } from '../firebase'
import { readAll, writeAll, backup, userRef, groupByWeek } from './cloudStore'
import { hasContent, summarize, combine } from './merge'

/* ============================================================
   Google sign-in, and keeping the account's copy in step with this browser.

   localStorage stays the working copy - every page reads it exactly as it
   did before accounts existed. Signed in, every write that reaches
   `persist()` is also sent here (`push`), and a listener on the account
   brings in what other devices and tabs write (`applyRemote`).

   Signing in on a device that is not yet linked to the account reconciles
   the two sides once, from the server:
     account empty   -> this device's data is uploaded (the migration)
     device empty    -> the account's data comes down
     both hold data  -> the merge dialog asks: use the account's, replace the
                        account with this device's, or combine both. The side
                        that loses is backed up into the account first.
   After that the device is *linked* (`task-planner-account`), and later
   sign-ins on it just catch up and listen.

   Signing out of a linked device clears its copy - the data stays in the
   account. A device that was never linked keeps its data: it was never
   uploaded, so clearing it would lose it.

   Writes are last-write-wins per document. The plan is one document per week
   (see cloudStore.js), which keeps two devices from colliding unless they
   edit the same week at once.
   ============================================================ */

const ACCOUNT_KEY = 'task-planner-account'
// Writes made locally that the server has not confirmed yet - "store:months",
// "week:2026-11-09". They are re-sent on the next start, which covers a
// browser where Firestore could not keep its own offline queue
const DIRTY_KEY = 'task-planner-sync-dirty'

// Which tab wrote a document, so a listener can skip its own echo
const TAB = typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2)

const readJSON = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}
const writeJSON = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage blocked - the app already says so
  }
}
const readMarker = () => {
  const m = readJSON(ACCOUNT_KEY, null)
  return m && typeof m.uid === 'string' ? m : null
}

const MESSAGES = {
  'auth/popup-blocked': 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.',
  'auth/unauthorized-domain': "This address is not on the Firebase project's authorized domains.",
  'auth/network-request-failed': 'No connection. Try again once you are online.',
  'auth/operation-not-allowed': 'Google sign-in is not turned on in the Firebase project.',
  'permission-denied': 'The account refused the connection. Check the Firestore rules.',
}
// Closing the Google window is a choice, not an error
const SILENT = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'])
const describe = (err) => MESSAGES[err?.code] || err?.message || 'Something went wrong.'

const weekJson = (projects) => {
  const m = new Map()
  for (const [iso, list] of Object.entries(groupByWeek(projects))) m.set(iso, JSON.stringify(list))
  return m
}

// Back online, or five seconds - whichever comes first
const waitForNetwork = () => new Promise((resolve) => {
  const done = () => {
    clearTimeout(timer)
    window.removeEventListener('online', done)
    resolve()
  }
  const timer = setTimeout(done, 5000)
  window.addEventListener('online', done)
})

/**
 * @param projectsKey  the localStorage key of the plan (sharded by week)
 * @param storeNames   { [localStorage key]: name in the account }
 * @param readLocalAll () => { projects, stores: { [name]: value } }
 * @param applyLocalAll (data) => void   - replace everything, no push
 * @param applyRemote  (kind, id, value) => void - one store or one week, no push
 */
export function useCloudSync({ projectsKey, storeNames, readLocalAll, applyLocalAll, applyRemote }) {
  const io = useRef(null)
  io.current = { readLocalAll, applyLocalAll, applyRemote }
  const names = Object.values(storeNames)

  const markerRef = useRef(readMarker())
  const [account, setAccount] = useState(markerRef.current)
  const [linked, setLinked] = useState(Boolean(markerRef.current))
  const [status, setStatus] = useState(markerRef.current && cloudConfigured ? 'connecting' : 'signed-out')
  const [error, setError] = useState('')
  const [merge, setMerge] = useState(null)
  const [unsynced, setUnsynced] = useState(() => readJSON(DIRTY_KEY, []).length)

  const fbRef = useRef(null)
  // While linked and listening: { uid, stores: Map name->json, weeks: Map iso->json, unsubs }
  // - the account's copy as far as this tab knows it
  const live = useRef(null)
  const dirty = useRef(null)
  if (dirty.current === null) dirty.current = new Map(readJSON(DIRTY_KEY, []).map((e) => [e, 0]))
  // The plan per week as last written here, to tell which weeks an offline
  // edit touched
  const localWeeks = useRef(null)
  if (localWeeks.current === null) localWeeks.current = weekJson(readLocalAll().projects)
  const inflight = useRef(0)
  const failed = useRef(false)
  const handling = useRef(null)
  const booted = useRef(false)
  const bootOnce = useRef(null)
  const answer = useRef(null)

  const refresh = () => {
    if (!live.current) return
    if (failed.current) setStatus('error')
    else if (!navigator.onLine) setStatus('offline')
    else setStatus(inflight.current > 0 ? 'syncing' : 'synced')
  }

  const saveDirty = () => {
    writeJSON(DIRTY_KEY, dirty.current.size ? [...dirty.current.keys()] : null)
    setUnsynced(dirty.current.size)
  }
  const markDirty = (entry) => {
    const seq = (dirty.current.get(entry) || 0) + 1
    dirty.current.set(entry, seq)
    saveDirty()
    return seq
  }
  const fail = (err) => {
    failed.current = true
    setError(describe(err))
    setStatus('error')
  }

  // A write's promise settles when the server has it - only then is its
  // entry no longer dirty, and only if nothing newer was written since
  const track = (promise, entries) => {
    inflight.current += 1
    refresh()
    promise
      .then(() => {
        let changed = false
        for (const [entry, seq] of entries) {
          if (dirty.current.get(entry) === seq) {
            dirty.current.delete(entry)
            changed = true
          }
        }
        if (changed) saveDirty()
      }, fail)
      .finally(() => {
        inflight.current -= 1
        refresh()
      })
  }

  // Linked, or in the middle of linking: a write that cannot go yet is
  // remembered so it goes once it can
  const wantsSync = () => Boolean(markerRef.current || handling.current)

  const pushStore = (name, value, force = false) => {
    const L = live.current
    if (!L) {
      if (wantsSync()) markDirty(`store:${name}`)
      return
    }
    const json = JSON.stringify(value ?? null)
    if (!force && L.stores.get(name) === json) return
    L.stores.set(name, json)
    const entry = `store:${name}`
    const seq = markDirty(entry)
    const fb = fbRef.current
    const ref = fb.fs.doc(userRef(fb, L.uid), 'stores', name)
    track(fb.fs.setDoc(ref, { json, writer: TAB, updatedAt: fb.fs.serverTimestamp() }), [[entry, seq]])
  }

  const pushWeeks = (projects, force = []) => {
    const now = weekJson(projects)
    const L = live.current
    if (!L) {
      if (wantsSync()) {
        const before = localWeeks.current
        for (const iso of new Set([...before.keys(), ...now.keys()])) {
          if (before.get(iso) !== now.get(iso)) markDirty(`week:${iso}`)
        }
      }
      localWeeks.current = now
      return
    }
    localWeeks.current = now
    const changed = [...new Set([...L.weeks.keys(), ...now.keys(), ...force])]
      .filter((iso) => force.includes(iso) || L.weeks.get(iso) !== now.get(iso))
    if (!changed.length) return

    const fb = fbRef.current
    const base = userRef(fb, L.uid)
    // Weeks that changed together are written together: a move across two
    // weeks lands whole or not at all
    for (let i = 0; i < changed.length; i += 450) {
      const batch = fb.fs.writeBatch(fb.db)
      const entries = []
      for (const iso of changed.slice(i, i + 450)) {
        const ref = fb.fs.doc(base, 'weeks', iso)
        const json = now.get(iso)
        if (json == null) {
          batch.delete(ref)
          L.weeks.delete(iso)
        } else {
          batch.set(ref, { json, writer: TAB, updatedAt: fb.fs.serverTimestamp() })
          L.weeks.set(iso, json)
        }
        entries.push([`week:${iso}`, markDirty(`week:${iso}`)])
      }
      track(batch.commit(), entries)
    }
  }

  // Called from persist() - every write in the app comes through here
  const push = (key, value) => {
    if (key === projectsKey) pushWeeks(value)
    else if (storeNames[key]) pushStore(storeNames[key], value)
  }

  const subscribe = (fb, L) => {
    const { fs } = fb
    const base = userRef(fb, L.uid)

    L.unsubs.push(fs.onSnapshot(fs.collection(base, 'stores'), (snap) => {
      if (live.current !== L) return
      for (const change of snap.docChanges()) {
        const d = change.doc
        const name = d.id
        if (change.type === 'removed' || d.metadata.hasPendingWrites || !names.includes(name)) continue
        const json = d.get('json')
        if (L.stores.get(name) === json) continue
        // Our own echo, or something newer is on its way from here
        if (d.get('writer') === TAB || dirty.current.has(`store:${name}`)) continue
        let value
        try { value = JSON.parse(json) } catch { continue }
        L.stores.set(name, json)
        io.current.applyRemote('store', name, value)
      }
    }, fail))

    L.unsubs.push(fs.onSnapshot(fs.collection(base, 'weeks'), (snap) => {
      if (live.current !== L) return
      for (const change of snap.docChanges()) {
        const d = change.doc
        const iso = d.id
        if (dirty.current.has(`week:${iso}`)) continue
        if (change.type === 'removed') {
          // A week this tab deleted is already gone from L.weeks
          if (!L.weeks.has(iso)) continue
          L.weeks.delete(iso)
          io.current.applyRemote('week', iso, null)
          continue
        }
        if (d.metadata.hasPendingWrites) continue
        const json = d.get('json')
        if (L.weeks.get(iso) === json || d.get('writer') === TAB) continue
        let value
        try { value = JSON.parse(json) } catch { continue }
        if (!Array.isArray(value)) continue
        L.weeks.set(iso, json)
        io.current.applyRemote('week', iso, value)
      }
    }, fail))
  }

  /* `baseline` is what the account holds right now. Anything local that
     differs from it - edits made while connecting, or writes left dirty by
     an earlier visit - is sent before the listeners start. */
  const goLive = (fb, uid, baseline) => {
    const L = { uid, stores: new Map(), weeks: weekJson(baseline.projects), unsubs: [] }
    for (const name of names) {
      if (baseline.stores[name] !== undefined) L.stores.set(name, JSON.stringify(baseline.stores[name]))
    }
    live.current = L
    failed.current = false
    const local = io.current.readLocalAll()
    const forced = [...dirty.current.keys()]
    pushWeeks(local.projects, forced.filter((e) => e.startsWith('week:')).map((e) => e.slice(5)))
    for (const name of names) pushStore(name, local.stores[name], forced.includes(`store:${name}`))
    subscribe(fb, L)
    refresh()
  }

  const stopLive = () => {
    const L = live.current
    if (!L) return
    L.unsubs.forEach((u) => u())
    live.current = null
    localWeeks.current = weekJson(io.current.readLocalAll().projects)
  }

  const ask = (device, cloud) => new Promise((resolve) => {
    answer.current = resolve
    setStatus('choosing')
    setMerge({ device: summarize(device), account: summarize(cloud) })
  })

  const resolveMerge = (choice) => {
    const resolve = answer.current
    answer.current = null
    setMerge(null)
    resolve?.(choice)
  }

  const link = (user) => {
    const marker = { uid: user.uid, email: user.email || '', name: user.displayName || '' }
    writeJSON(ACCOUNT_KEY, marker)
    markerRef.current = marker
    setAccount(marker)
    setLinked(true)
  }

  const reconcile = async (fb, user) => {
    const uid = user.uid
    const base = userRef(fb, uid)
    setAccount({ uid, email: user.email || '', name: user.displayName || '' })
    setStatus('connecting')

    let cloud
    for (;;) {
      try {
        cloud = await readAll(fb, base)
        break
      } catch (err) {
        if (err?.code !== 'unavailable' && navigator.onLine) throw err
        setStatus('waiting')
        await waitForNetwork()
        setStatus('connecting')
      }
    }

    const local = io.current.readLocalAll()
    const deviceHas = hasContent(local)
    const accountHas = hasContent(cloud)
    let result = local
    let upload = null

    if (!accountHas) {
      upload = local
    } else if (!deviceHas) {
      // A name typed here before signing in is kept if the account has none
      const keepName = !cloud.stores.profile?.name?.trim() && local.stores.profile?.name?.trim()
      result = keepName ? { ...cloud, stores: { ...cloud.stores, profile: local.stores.profile } } : cloud
    } else {
      const choice = await ask(local, cloud)
      if (choice === 'cancel') {
        dirty.current.clear()
        saveDirty()
        setAccount(null)
        await fb.authMod.signOut(fb.auth)
        return
      }
      setStatus('syncing')
      if (choice === 'account') {
        await backup(fb, uid, local, 'device', 'use-account', TAB)
        result = cloud
      } else if (choice === 'device') {
        await backup(fb, uid, cloud, 'account', 'replace-account', TAB)
        upload = local
      } else {
        await backup(fb, uid, cloud, 'account', 'combine', TAB)
        result = combine(cloud, local)
        upload = result
      }
    }

    if (upload) {
      setStatus('syncing')
      const keep = new Set(Object.keys(groupByWeek(upload.projects)))
      const fresh = !cloud.weekIds.length && !Object.keys(cloud.stores).length
      await writeAll(fb, base, upload, TAB, {
        dropWeeks: cloud.weekIds.filter((iso) => !keep.has(iso)),
        meta: {
          schema: 1,
          updatedAt: fb.fs.serverTimestamp(),
          ...(fresh ? { createdAt: fb.fs.serverTimestamp() } : {}),
        },
      })
    }
    if (result !== local) io.current.applyLocalAll(result)
    link(user)
    goLive(fb, uid, upload || cloud)
  }

  const handleUser = async (fb, user) => {
    if (!user) {
      stopLive()
      handling.current = null
      // Linked but the session is gone: the data stays, and signing in again
      // with the same account picks up where it left off
      setStatus(markerRef.current ? 'expired' : 'signed-out')
      if (!markerRef.current) setAccount(null)
      return
    }
    if (live.current?.uid === user.uid || handling.current === user.uid) return
    handling.current = user.uid
    setError('')
    failed.current = false
    try {
      if (markerRef.current?.uid === user.uid) {
        link(user)
        goLive(fb, user.uid, io.current.readLocalAll())
      } else {
        await reconcile(fb, user)
      }
    } catch (err) {
      fail(err)
    } finally {
      handling.current = null
    }
  }

  /* Loads the SDK and starts listening for the session - once, however many
     callers ask at the same moment (the startup restore and a click on Sign
     in can overlap).

     A session left by a sign-in that never finished linking - the tab closed
     while the merge dialog waited - is dropped before anything listens.
     Resumed silently, it would race the popup the user is about to answer,
     and two sign-ins could reconcile at once. Starting again from the popup
     means the account used is always the one just chosen. */
  const boot = () => {
    bootOnce.current ||= (async () => {
      try {
        const fb = await getFirebase()
        if (!fb) throw new Error('Firebase did not start')
        await fb.auth.authStateReady()
        const leftover = fb.auth.currentUser
        if (leftover && markerRef.current?.uid !== leftover.uid) {
          try { await fb.authMod.signOut(fb.auth) } catch { /* nothing to drop */ }
        }
        fbRef.current = fb
        fb.authMod.onAuthStateChanged(fb.auth, (user) => { handleUser(fb, user) })
        return fb
      } catch (err) {
        console.error(err)
        bootOnce.current = null // the next click tries again
        return null
      }
    })()
    return bootOnce.current
  }

  // A linked device restores its session on load; a guest never loads the SDK
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    if (usingEmulator) {
      // Tests only: the Auth emulator takes an unsigned token in place of
      // Google's, so a headless browser can sign in without the popup
      window.__testSignIn = async (email, name = email) => {
        const fb = await boot()
        return fb.authMod.signInWithCredential(
          fb.auth,
          fb.authMod.GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, email_verified: true, name })),
        )
      }
    }
    if (markerRef.current && cloudConfigured) {
      boot().then((fb) => { if (!fb) fail(new Error('Could not reach the account.')) })
    }
    const onNetwork = () => refresh()
    window.addEventListener('online', onNetwork)
    window.addEventListener('offline', onNetwork)
  }, [])

  const signIn = async () => {
    setError('')
    const fb = await boot()
    if (!fb) {
      setError('Accounts are not set up on this copy of the planner.')
      return
    }
    try {
      const provider = new fb.authMod.GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await fb.authMod.signInWithPopup(fb.auth, provider)
    } catch (err) {
      if (!SILENT.has(err?.code)) setError(describe(err))
    }
  }

  const signOut = async () => {
    const fb = fbRef.current
    const linked = Boolean(markerRef.current)
    stopLive()
    if (fb) {
      try { await fb.authMod.signOut(fb.auth) } catch { /* already out */ }
    }
    setError('')
    if (!linked) {
      dirty.current.clear()
      saveDirty()
      setAccount(null)
      setStatus('signed-out')
      return
    }
    // Firestore's own offline copy goes too, or the data would still be
    // sitting in this browser's IndexedDB
    if (fb) {
      try {
        await fb.fs.terminate(fb.db)
        await fb.fs.clearIndexedDbPersistence(fb.db)
      } catch { /* another tab still holds it; it is cleared with that tab */ }
    }
    for (const key of [projectsKey, ...Object.keys(storeNames), ACCOUNT_KEY, DIRTY_KEY]) {
      try { localStorage.removeItem(key) } catch { /* nothing kept */ }
    }
    window.location.reload()
  }

  return {
    configured: cloudConfigured,
    account,
    linked,
    status,
    error,
    unsynced,
    merge,
    signIn,
    signOut,
    resolveMerge,
    push,
  }
}
