/* ============================================================
   The account's copy of the planner, as Firestore documents.

     users/{uid}                    { schema, createdAt, updatedAt }
     users/{uid}/stores/{name}      { json, writer, updatedAt }
     users/{uid}/weeks/{mondayIso}  { json: that week's projects, writer, updatedAt }
     users/{uid}/backups/{stamp}    { at, from, reason }  + the same two
                                    sub-collections, holding what a choice
                                    in the merge dialog threw away

   - **One document per localStorage key**, except the plan. The plan is every
     week there has ever been in one array, and would one day outgrow
     Firestore's 1 MiB document; split by week it never will, and an edit
     rewrites only the week it touched.
   - **`json` is the value as a string**, exactly as localStorage holds it.
     Nothing ever queries by field, and a string round-trips exactly: no
     `undefined` refused, no arrays-in-arrays rule, no map keys re-ordered.
   - **`writer` is the tab that wrote it**, so a listener can tell its own
     echo from another device's change.

   Everything here is plain I/O; when to call it is useCloudSync's business.
   ============================================================ */

export const docData = (fb, value, writer) => ({
  json: JSON.stringify(value),
  writer,
  updatedAt: fb.fs.serverTimestamp(),
})

export const parseDoc = (snap) => {
  try {
    return JSON.parse(snap.get('json'))
  } catch {
    return undefined
  }
}

export const userRef = (fb, uid) => fb.fs.doc(fb.db, 'users', uid)

// A project with no week (only ever a hand-edited store) still needs a home
export const weekOf = (project) => String(project?.week_start || 'no-week')

export const groupByWeek = (projects) => {
  const out = {}
  for (const p of projects || []) (out[weekOf(p)] ||= []).push(p)
  return out
}

/* Everything under one root - an account, or one of its backups. From the
   server, never the cache: deciding whether an account is empty from a stale
   cache is how a migration overwrites real data. Throws when offline. */
export async function readAll(fb, base) {
  const { fs } = fb
  const [stores, weeks] = await Promise.all([
    fs.getDocsFromServer(fs.collection(base, 'stores')),
    fs.getDocsFromServer(fs.collection(base, 'weeks')),
  ])
  const out = { projects: [], stores: {}, weekIds: [] }
  stores.forEach((d) => {
    const v = parseDoc(d)
    if (v !== undefined) out.stores[d.id] = v
  })
  weeks.forEach((d) => {
    out.weekIds.push(d.id)
    const v = parseDoc(d)
    if (Array.isArray(v)) out.projects.push(...v)
  })
  return out
}

// A batch takes 500 writes; anything bigger goes in several
async function commitAll(fb, ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = fb.fs.writeBatch(fb.db)
    ops.slice(i, i + 450).forEach((op) => op(batch))
    await batch.commit()
  }
}

/* Writes a whole planner under `base`: every store, every week, and deletes
   the weeks named in `dropWeeks` (ones the account has and the data does not). */
export async function writeAll(fb, base, data, writer, { dropWeeks = [], meta = null } = {}) {
  const { fs } = fb
  const ops = []
  if (meta) ops.push((b) => b.set(base, meta, { merge: true }))
  for (const [name, value] of Object.entries(data.stores)) {
    ops.push((b) => b.set(fs.doc(base, 'stores', name), docData(fb, value, writer)))
  }
  for (const [iso, list] of Object.entries(groupByWeek(data.projects))) {
    ops.push((b) => b.set(fs.doc(base, 'weeks', iso), docData(fb, list, writer)))
  }
  for (const iso of dropWeeks) ops.push((b) => b.delete(fs.doc(base, 'weeks', iso)))
  await commitAll(fb, ops)
}

// What a merge choice throws away is kept here first, in the account, so it
// survives this device being cleared at sign-out
export async function backup(fb, uid, data, from, reason, writer) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const base = fb.fs.doc(fb.db, 'users', uid, 'backups', stamp)
  await writeAll(fb, base, data, writer, {
    meta: { at: fb.fs.serverTimestamp(), from, reason },
  })
}
