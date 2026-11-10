import { useState, useEffect, useCallback, useRef } from 'react'

// The verse of the day - bible.com's, read through YouVersion's developer API
// (api.youversion.com), the platform bible.com itself is built on.
//
// The second thing in this app that leaves the machine, and like the weather
// it waits to be asked: nothing goes out until a YouVersion app key has been
// pasted in. A key is free (platform.youversion.com) and stays in this
// browser. With one, Home asks once a day - the day's passage, its text, and
// the version's copyright line, which the licence says must go wherever the
// text does - and keeps the answer, so switching pages or coming back to the
// tab is not a request.
const SETUP_KEY = 'task-planner-verse'
const CACHE_KEY = 'task-planner-verse-cache'
const API = 'https://api.youversion.com/v1'

// The Berean Standard Bible: the one version every key may read without
// first accepting a publisher's licence in the portal
export const DEFAULT_VERSION = { id: 3034, abbr: 'BSB', title: 'Berean Standard Bible' }

const read = (key, empty) => {
  try {
    const stored = JSON.parse(localStorage.getItem(key))
    return stored && typeof stored === 'object' ? stored : empty
  } catch {
    return empty
  }
}

const write = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode - the verse still shows, it just will not be remembered
  }
}

// Day of the year, Jan 1 being day 1 - the numbering bible.com's own calendar
// of verses uses. Counted between UTC midnights of the device's calendar
// date, so a clock change cannot make one day 23 hours long.
function dayOfYear(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000) + 1
}

// One request. A refusal throws with its status, so 401 (a key YouVersion
// does not know) and 403 (a version the key has no licence for) can be told
// apart from a dropped connection, which throws without one.
async function call(path, key) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'X-YVP-App-Key': key, Accept: 'application/json' },
  })
  if (!res.ok) {
    const err = new Error(`YouVersion answered ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// The English versions a key may read. One call both checks the key and
// offers only what will work - a licensed version such as the NIV appears
// once its publisher's licence has been accepted in the portal.
export async function listVersions(key) {
  const body = await call('/bibles?language_ranges[]=en', key)
  return (body?.data || [])
    .map((b) => ({
      id: Number(b.id),
      abbr: b.localized_abbreviation || b.abbreviation || String(b.id),
      title: b.localized_title || b.title || '',
    }))
    .filter((v) => v.id)
    .sort((a, b) => a.abbr.localeCompare(b.abbr))
}

// `today` is the device's date as "YYYY-MM-DD" - a string, so a re-render
// for the same day (the tab coming back into view) is not a new request
export function useVerse(today) {
  const [setup, setSetupState] = useState(() => read(SETUP_KEY, null))
  const [verse, setVerse] = useState(() => read(CACHE_KEY, null))
  const [status, setStatus] = useState(() => (read(SETUP_KEY, null)?.key ? 'loading' : 'off'))
  // A key or version changed while a request is in flight must not be
  // overwritten by the answer to the old one
  const token = useRef(0)
  // The request in flight, so the same one is never sent twice at once - the
  // dev build runs every effect twice on mount, and a key still in
  // YouVersion's "development" status has a lower rate limit
  const inflight = useRef(null)

  const load = useCallback(async (target, iso, { force = false } = {}) => {
    const cached = read(CACHE_KEY, null)
    if (!force && cached && cached.date === iso && cached.versionId === target.versionId) {
      setVerse(cached)
      setStatus('ready')
      return
    }

    const ask = `${target.key}|${target.versionId}|${iso}`
    if (!force && inflight.current === ask) return
    inflight.current = ask
    const mine = ++token.current
    setStatus('loading')
    try {
      const votd = await call(`/verse-of-the-days/${dayOfYear(iso)}`, target.key)
      const passageId = String(votd?.passage_id || '')
      if (!passageId) throw new Error('No passage for the day')
      const [passage, version] = await Promise.all([
        call(`/bibles/${target.versionId}/passages/${encodeURIComponent(passageId)}?format=text`, target.key),
        call(`/bibles/${target.versionId}`, target.key),
      ])
      if (mine !== token.current) return

      const text = String(passage?.content || '').replace(/\s+/g, ' ').trim()
      // A verse is never shown without its version's copyright line
      const credit = String(version?.copyright || version?.promotional_content || '').trim()
      if (!text || !credit) throw new Error('Incomplete answer')

      const next = {
        date: iso,
        versionId: target.versionId,
        passageId,
        reference: passage.reference || passageId,
        version: version.localized_abbreviation || version.abbreviation || target.version || '',
        text,
        credit,
      }
      setVerse(next)
      setStatus('ready')
      write(CACHE_KEY, next)
    } catch (err) {
      if (mine !== token.current) return
      // The last verse fetched stays on screen - yesterday's is a better
      // answer than an empty box - and only the status says this one missed
      setStatus(err.status === 401 ? 'badkey' : err.status === 403 ? 'licence' : 'error')
    } finally {
      if (mine === token.current) inflight.current = null
    }
  }, [])

  useEffect(() => {
    if (setup?.key) load(setup, today)
    else setStatus('off')
  }, [setup, today, load])

  // `null` turns the whole thing off and forgets the key and the verse. An
  // answer still on its way belongs to the old settings, so it is disowned
  // first - otherwise it would land after "Turn off" and write the verse back.
  const setSetup = useCallback((next) => {
    token.current++
    inflight.current = null
    write(SETUP_KEY, next)
    if (!next) {
      write(CACHE_KEY, null)
      setVerse(null)
    }
    setSetupState(next)
  }, [])

  // Only a verse in the version asked for is shown as the answer; one
  // fetched in another version waits for its replacement
  const shown = verse && setup && verse.versionId === setup.versionId ? verse : null

  return {
    setup,
    setSetup,
    verse: shown,
    status,
    retry: () => { if (setup?.key) load(setup, today, { force: true }) },
  }
}
