import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { useWeather, searchPlaces, describeCode } from '../../hooks/useWeather'
import { WeatherIcon, SearchIcon, PlusIcon, TrashIcon, ArrowRightIcon } from '../icons'
import {
  toISODate, collectDay, sinkCompleted, sortByNextBirthday, formatBirthdayDate,
  sortCountdowns, formatShortDate, DAY_NAMES, fromISODate,
  collectDeadlines, dueWords, formatDeadline,
  addDays, startOfWeek, popupsOn, popupHorizon, isCounted, DRAG_TYPE,
} from '../../utils'
import { useScrollLock } from '../../hooks/useScrollLock'
import { PopupQuickAdd, DailyRemoveDialog, RepeatToggle } from '../Popups'

/* ============================================================
   The panels of the home page.

   These began life in the sidebar, at 268px, where each one had to say its
   piece in a column narrower than a phone. They moved out to [[HomePage]] in
   Oct 2026 and were rebuilt for the room: today's work shows its project and
   its day rather than a truncated line, the forecast gets three days side by
   side instead of two chips, and the birthday ring shows five rather than
   three.

   The sidebar is now navigation and nothing else.
   ============================================================ */

/* ---- Today, and tomorrow ----
   Today's work is read off the weekly plan by date: any unit anywhere in the
   store whose day is today, whichever week it was filed under. That last part
   matters - a unit moved past the end of its week still belongs on the day it
   now sits on, and a list built from the *visible* week would lose it the
   moment the board browsed away. Ticking here is the same write the board
   makes, so the two can never disagree. The day's pop-ups sit under the work,
   with a line to jot another one down.

   "Plan tomorrow" opens Tomorrow beside it - the end-of-day review. Anything
   still open today can be dragged across (or sent with its arrow, which is
   the only way on a touch screen): a pop-up just changes day, a unit of work
   moves the way the board's move dialog moves it, today kept as missed, and
   on a Sunday it is filed into next week's namesake project. */

const weekOf = (iso) => toISODate(startOfWeek(fromISODate(iso)))
// Pop-up rows carry no task; every unit of work does
const isPopup = (row) => row.taskId == null

// Leaving a target's box, not crossing onto one of its own children
const pointerOutside = (e) => {
  const r = e.currentTarget.getBoundingClientRect()
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
}

function usePlanTomorrow() {
  const { weekMeta, movePopup, moveScheduled, refileUnit } = useApp()
  const now = useToday()
  const todayIso = toISODate(now)
  const tomorrowIso = toISODate(addDays(now, 1))
  const tomorrowWeek = weekOf(tomorrowIso)
  const ended = (iso) => !!weekMeta[iso]?.ended
  const targetEnded = ended(tomorrowWeek)

  // Why a row cannot go on to tomorrow, or null when it can. An ended week is
  // frozen on the board, and moving work out of it or into it would change it.
  const blocked = (row) => {
    if (targetEnded) return "Tomorrow's week has ended - reopen it to move work there"
    if (ended(isPopup(row) ? weekOf(row.iso) : row.weekStart)) return 'This week has ended - reopen it to move work out'
    return null
  }

  const send = (row) => {
    if (!row || row.completed || row.daily || blocked(row)) return
    if (isPopup(row)) movePopup(row.iso, row.id, tomorrowIso)
    // Filed under another week than tomorrow's - Sunday's work going on to
    // Monday - so it is refiled rather than just re-dated
    else if (row.weekStart !== tomorrowWeek) refileUnit(row.taskId, row.subtaskId, tomorrowIso)
    else moveScheduled(row.taskId, row.subtaskId == null ? null : [row.subtaskId], tomorrowIso, true)
  }

  return { todayIso, tomorrowIso, tomorrowWeek, targetEnded, blocked, send }
}

// One row of either kind. A unit names where it came from under its title;
// a pop-up is only its words, with its repeat switch - on, and in view, for
// a daily.
function HomeRow({ row, onTick, onRemove, mover, dragging }) {
  const popup = isPopup(row)
  const title = popup ? row.text : row.subtitle || row.taskTitle
  return (
    <li
      className={`home-today-row ${row.completed ? 'done' : ''} ${mover ? 'movable' : ''} ${dragging ? 'dragging' : ''}`}
      {...(mover?.drag || {})}
    >
      <input
        type="checkbox"
        className="task-check"
        checked={row.completed}
        onChange={(e) => onTick(row, e.target.checked)}
        aria-label={title}
      />
      <span className="home-today-text">
        <span className="home-today-title">{title}</span>
        {!popup && (
          <span className="home-today-from">
            {row.projectName}
            {row.subtitle && <> · {row.taskTitle}</>}
          </span>
        )}
      </span>
      {popup && <RepeatToggle row={row} />}
      {mover && (
        <button
          type="button"
          className="row-send"
          onClick={mover.send}
          disabled={!!mover.why}
          title={mover.why || 'Move to tomorrow'}
          aria-label={`Move ${title} to tomorrow`}
        >
          <ArrowRightIcon />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          className="row-del"
          onClick={() => onRemove(row)}
          title={row.daily ? 'Remove…' : 'Remove'}
          aria-label={`Remove ${title}`}
        >
          <TrashIcon />
        </button>
      )}
    </li>
  )
}

// One day's rows for a panel: the work first, then the pop-ups, each with
// what is finished sunk to the foot. A pop-up still being typed somewhere
// else (no words yet) is left out, as it is from every count.
function useDayRows(iso) {
  const { allProjects, popups, toggleTask, toggleSubtask, tickPopup, deletePopup } = useApp()
  const now = useToday()
  const { items, missed } = collectDay(allProjects, iso)
  const units = sinkCompleted(items)
  const pops = sinkCompleted(popupsOn(popups, iso, popupHorizon(now)).filter(isCounted))
  const all = [...units, ...pops]
  const done = all.filter((r) => r.completed).length

  const tick = (r, checked) => {
    if (isPopup(r)) tickPopup(r, checked)
    else if (r.subtaskId) toggleSubtask(r.taskId, r.subtaskId, checked)
    else toggleTask(r.taskId, checked)
  }

  return { units, pops, missed, total: all.length, done, tick, deletePopup }
}

export function TodayPanel({ planning = false, onPlanning, dragKey = null, onDragKey }) {
  const now = useToday()
  const iso = toISODate(now)
  const { units, pops, missed, total, done, tick, deletePopup } = useDayRows(iso)
  const plan = usePlanTomorrow()
  const [removing, setRemoving] = useState(null)

  const remove = (r) => (r.daily ? setRemoving(r) : deletePopup(r.iso, r.id))

  // Only while tomorrow is open, and only for what is still to do: a daily is
  // on tomorrow already
  const mover = (r) => {
    if (!planning || r.completed || r.daily) return null
    const why = plan.blocked(r)
    return {
      why,
      send: () => plan.send(r),
      drag: why ? null : {
        draggable: true,
        onDragStart: (e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(r))
          onDragKey?.(r.key)
        },
        onDragEnd: () => onDragKey?.(null),
      },
    }
  }

  const row = (r, removable) => (
    <HomeRow
      key={r.key}
      row={r}
      onTick={tick}
      onRemove={removable ? remove : null}
      mover={mover(r)}
      dragging={dragKey === r.key}
    />
  )

  return (
    <section className="panel home-today">
      <div className="panel-head">
        <span className="eyebrow">TODAY</span>
        {total > 0 && (
          <span className={`panel-count ${done === total ? 'full' : ''}`}>
            {done}/{total}
          </span>
        )}
        {onPlanning && (
          <button
            type="button"
            className={`plan-toggle ${planning ? 'on' : ''}`}
            onClick={onPlanning}
            aria-pressed={planning}
          >
            {planning ? 'Close tomorrow' : 'Plan tomorrow'}
          </button>
        )}
        <a className="panel-link" href="#/weekly">Open the week ↗</a>
      </div>

      {total === 0 ? (
        <p className="home-empty">
          Nothing is scheduled for today. <a href="#/weekly">Plan the week</a>, or jot a
          pop-up down below.
        </p>
      ) : (
        <>
          {units.length > 0 && <ul className="home-today-list">{units.map((r) => row(r, false))}</ul>}
          {pops.length > 0 && (
            <>
              <div className="popups-label">Pop-ups</div>
              <ul className="home-today-list">{pops.map((r) => row(r, true))}</ul>
            </>
          )}
        </>
      )}

      <PopupQuickAdd iso={iso} />

      {missed.length > 0 && (
        <p className="home-missed">
          {missed.length} {missed.length === 1 ? 'thing' : 'things'} marked missed today
        </p>
      )}

      {removing && <DailyRemoveDialog row={removing} onClose={() => setRemoving(null)} />}
    </section>
  )
}

/* Tomorrow, beside today while you plan it: what the week already has on it,
   its pop-ups, and the target for today's leftovers. `armed` lights it up the
   moment a drag starts in Today, so the place to drop is never a guess. */
export function TomorrowPanel({ armed = false, onDropped }) {
  const { setWeekStart } = useApp()
  const plan = usePlanTomorrow()
  const iso = plan.tomorrowIso
  const { units, pops, total, done, tick, deletePopup } = useDayRows(iso)
  const [over, setOver] = useState(false)
  const [removing, setRemoving] = useState(null)

  const remove = (r) => (r.daily ? setRemoving(r) : deletePopup(r.iso, r.id))

  // Only this app's own drags are taken; anything else dragged over the page
  // (a file, some text) is not a row and is left alone
  const ours = (e) => Array.from(e.dataTransfer?.types || []).includes(DRAG_TYPE)
  // `dragenter` is cancelled as well as `dragover`: a drop is allowed only if
  // the last of the two was, and the step onto a new element fires only enter
  const onDragOver = (e) => {
    if (!ours(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!over) setOver(true)
  }
  const onDragLeave = (e) => { if (pointerOutside(e)) setOver(false) }
  const onDrop = (e) => {
    if (!ours(e)) return
    e.preventDefault()
    setOver(false)
    // The row is gone from Today by now, so its own dragend may never come
    onDropped?.()
    try {
      plan.send(JSON.parse(e.dataTransfer.getData(DRAG_TYPE)))
    } catch {
      // Not a row - nothing to move
    }
  }

  const row = (r, removable) => (
    <HomeRow key={r.key} row={r} onTick={tick} onRemove={removable ? remove : null} />
  )

  return (
    <section
      className={`panel home-today home-tomorrow ${armed ? 'drop-ready' : ''} ${over ? 'drop-over' : ''}`}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="panel-head">
        <span className="eyebrow">
          TOMORROW <span className="home-tomorrow-date">· {formatDeadline(iso)}</span>
        </span>
        {total > 0 && (
          <span className={`panel-count ${done === total ? 'full' : ''}`}>
            {done}/{total}
          </span>
        )}
        {/* On a Sunday tomorrow is next week's Monday: the board opens on
            the week tomorrow is in, not on the one it was last showing */}
        <a className="panel-link" href="#/weekly" onClick={() => setWeekStart(fromISODate(plan.tomorrowWeek))}>
          Open the week ↗
        </a>
      </div>

      {plan.targetEnded && (
        <p className="panel-hint">Tomorrow's week has ended. Reopen it on the weekly page to move work into it.</p>
      )}

      {total === 0 ? (
        <p className="home-empty">
          Nothing planned for tomorrow yet. Drag what is left of today here, or jot a
          pop-up down below.
        </p>
      ) : (
        <>
          {units.length > 0 && <ul className="home-today-list">{units.map((r) => row(r, false))}</ul>}
          {pops.length > 0 && (
            <>
              <div className="popups-label">Pop-ups</div>
              <ul className="home-today-list">{pops.map((r) => row(r, true))}</ul>
            </>
          )}
        </>
      )}

      <PopupQuickAdd iso={iso} />

      {removing && <DailyRemoveDialog row={removing} onClose={() => setRemoving(null)} />}
    </section>
  )
}

/* ---- Birthdays ----
   The same [[sortByNextBirthday]] the birthdays page uses, so the two can
   never disagree about the order or about who is highlighted. */
export function BirthdayPanel() {
  const { birthdays } = useApp()
  const now = useToday()
  const ring = sortByNextBirthday(birthdays, now)

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="eyebrow">BIRTHDAYS</span>
        <a className="panel-link" href="#/birthdays">All ↗</a>
      </div>

      {ring.length === 0 ? (
        <p className="home-empty">
          No birthdays yet. <a href="#/birthdays">Add one</a> and it joins the countdown.
        </p>
      ) : (
        <ul className="home-bday-list">
          {ring.slice(0, 5).map((b) => (
            <li key={b.id} className={`home-bday ${b.next.days === 0 ? 'today' : ''}`}>
              <span className="home-bday-date">{formatBirthdayDate(b)}</span>
              <span className="home-bday-name">{b.name || 'Unnamed'}</span>
              <span className="home-bday-turning">
                {b.next.turning != null ? `turns ${b.next.turning}` : ''}
              </span>
              <span className="home-bday-when">
                {b.next.days === 0 ? 'Today' : b.next.days === 1 ? 'Tomorrow' : `${b.next.days}d`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ---- Countdowns ----
   A name and a day you are waiting for. The whole widget is one number per
   row, which is the only thing it is for - there is no countdowns page, no
   notes, no categories, and adding one is two fields on the spot rather than
   a dialog, because anything heavier than that and you would not bother.

   A date that has passed is not swept away. It drops below the upcoming ones
   and says how long ago it was, and clearing it stays your decision - the
   same rule the rest of the app follows about never quietly binning
   something you typed. */
const countWords = (days) => {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `${-days} days ago`
  return `${days} days`
}

export function CountdownPanel() {
  const { countdowns, addCountdown, deleteCountdown } = useApp()
  const now = useToday()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')

  const rows = sortCountdowns(countdowns, now)
  const valid = name.trim() && date

  useEffect(() => {
    if (!adding) return
    const onKey = (e) => { if (e.key === 'Escape') setAdding(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [adding])

  // The form stays open after a save: these tend to be entered in twos and
  // threes - a trip, the flight back, the thing it is all for
  const submit = (e) => {
    e.preventDefault()
    if (!valid) return
    addCountdown({ name, date })
    setName('')
    setDate('')
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="eyebrow">COUNTDOWN</span>
        {rows.length > 0 && <span className="panel-count">{rows.length}</span>}
      </div>

      {rows.length === 0 && !adding && (
        <p className="home-empty">Nothing to count down to yet.</p>
      )}

      {rows.length > 0 && (
        <ul className="home-cd-list">
          {rows.map((c) => (
            <li
              key={c.id}
              className={`home-cd ${c.days === 0 ? 'today' : ''} ${c.days < 0 ? 'past' : ''}`}
            >
              <span className="home-cd-date">{formatShortDate(c.date)}</span>
              <span className="home-cd-name">{c.name || 'Untitled'}</span>
              <span className="home-cd-days">{countWords(c.days)}</span>
              <button
                type="button"
                className="row-del"
                onClick={() => deleteCountdown(c.id)}
                aria-label={`Remove ${c.name || 'countdown'}`}
              >
                <TrashIcon />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <form className="cd-add" onSubmit={submit}>
          <input
            type="text"
            className="field-input"
            placeholder="What are you counting down to?"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <div className="cd-add-row">
            <input
              type="date"
              className="field-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
            />
            {/* The pair wraps together or not at all - split across two lines
                by a narrow column, "Add" ends up stranded under "Done" */}
            <span className="cd-add-btns">
              <button type="button" className="btn-ghost" onClick={() => setAdding(false)}>Done</button>
              <button type="submit" className="btn-primary" disabled={!valid}>Add</button>
            </span>
          </div>
        </form>
      ) : (
        <button type="button" className="add-row" onClick={() => setAdding(true)}>
          <span className="add-row-plus"><PlusIcon /></span>
          Add a countdown
        </button>
      )}
    </section>
  )
}

/* ---- Where am I? ----
   The only thing this app ever asks for, and it asks once. Typed, not sensed:
   no geolocation prompt, no IP lookup - a town name goes out to Open-Meteo's
   search and coordinates come back. */
function PlaceDialog({ current, onPick, onClose }) {
  // Holds the page still underneath; on touch a drag on the backdrop
  // would otherwise scroll the plan away behind the dialog
  useScrollLock()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Typing is not a search. The request waits for a pause, and a reply to a
  // query that has since been typed over is dropped.
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    let live = true
    setSearching(true)
    const timer = setTimeout(async () => {
      const found = await searchPlaces(query)
      if (!live) return
      setResults(found)
      setSearching(false)
    }, 350)
    return () => { live = false; clearTimeout(timer) }
  }, [query])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" role="dialog" aria-label="Weather location">
        <div className="modal-eyebrow">WEATHER</div>
        <h2 className="modal-title">Where are you?</h2>
        <div className="modal-divider" />

        <p className="modal-copy">
          Everything else in this planner stays on this machine. The forecast is the
          one exception — the town you pick is sent to Open-Meteo to look it up,
          and nothing else goes with it.
        </p>

        <div className="place-search">
          <SearchIcon />
          <input
            type="text"
            className="place-input"
            placeholder="Town or city"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="place-results">
          {searching && <div className="place-note">Looking…</div>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <div className="place-note">Nothing found</div>
          )}
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="place-row"
              onClick={() => { onPick(r); onClose() }}
            >
              <span className="place-name">{r.name}</span>
              <span className="place-detail">{r.detail}</span>
            </button>
          ))}
        </div>

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          {current && (
            <button type="button" className="btn-ghost" onClick={() => { onPick(null); onClose() }}>
              Turn off
            </button>
          )}
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

export function WeatherPanel() {
  const { place, setPlace, data, status } = useWeather()
  const [picking, setPicking] = useState(false)

  const today = data?.days?.[0]
  const cond = data ? describeCode(data.code) : null

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="eyebrow">WEATHER</span>
        {place && (
          <button type="button" className="panel-link as-btn" onClick={() => setPicking(true)}>
            {place.name} ↗
          </button>
        )}
      </div>

      {!place ? (
        <button type="button" className="home-wx-setup" onClick={() => setPicking(true)}>
          <WeatherIcon name="part" />
          <span>
            <b>Set your location</b>
            The only thing this planner ever sends anywhere, and only once you ask.
          </span>
        </button>
      ) : (
        <>
          <div className="home-wx-now">
            <span className="home-wx-icon"><WeatherIcon name={cond?.icon || 'cloud'} /></span>
            <span className="home-wx-temp">
              {data ? `${data.temp}°` : status === 'loading' ? '—' : '!'}
            </span>
            <span className="home-wx-words">
              <span className="home-wx-cond">
                {status === 'error' && !data ? 'Unavailable' : cond?.label || 'Loading'}
              </span>
              {data && <span className="home-wx-feels">feels like {data.feels}°</span>}
            </span>
            {today && (
              <span className="home-wx-range">
                <b>{today.high}°</b>
                <i>{today.low}°</i>
              </span>
            )}
          </div>

          {data?.days?.length > 1 && (
            <ul className="home-wx-forecast">
              {data.days.slice(1).map((d) => (
                <li key={d.iso}>
                  <span className="home-wx-day">
                    {DAY_NAMES[(fromISODate(d.iso).getDay() + 6) % 7].slice(0, 3)}
                  </span>
                  <WeatherIcon name={describeCode(d.code).icon} />
                  <span className="home-wx-fc-temp">{d.high}°<i>{d.low}°</i></span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {picking && (
        <PlaceDialog current={place} onPick={setPlace} onClose={() => setPicking(false)} />
      )}
    </section>
  )
}

/* ---- Deadlines ----
   Everything with a date somebody else set, in one list: assignments from the
   academics page, and the projects and tasks on the weekly board that carry a
   deadline. Three stores, one question - what is owed, and when.

   The panel owns none of it. `collectDeadlines` reads the three stores and
   sorts them together; every row links back to the page that writes it. So
   this is a way in, the same as the rest of the home page, and the one thing
   it adds is the comparison - a course assignment and a project deadline
   landing in the same week is a fact neither page can show you on its own.

   Two readings per row and no more: how long you have, and how far through you
   are. A thing already answered - submitted, ticked, a project all done - is
   not here at all. Those are not deadlines any more, and the pages keep them.

   `PLAN` marks everything off the weekly board, so at a glance a column of
   course codes is coursework and a column of PLAN is your own work. */
export function DeadlinePanel() {
  const { allProjects, academics } = useApp()
  const now = useToday()

  const rows = collectDeadlines({ allProjects, academics }, now)
  const late = rows.filter((r) => r.days != null && r.days < 0).length
  const week = rows.filter((r) => r.days != null && r.days >= 0 && r.days <= 7).length
  const hasCourses = (academics.courses || []).length > 0

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="eyebrow">DEADLINES</span>
        {rows.length > 0 && <span className="panel-count">{rows.length}</span>}
        {week > 0 && <span className="panel-say">{week} this week</span>}
      </div>

      {rows.length === 0 ? (
        <p className="home-empty">
          Nothing is due. Give a project a deadline on <a href="#/weekly">the week</a>
          {hasCourses
            ? <> or add an assignment under <a href="#/academics">a course</a>.</>
            : <>, or add <a href="#/academics">a course</a> and its assignments appear here.</>}
        </p>
      ) : (
        <ul className="home-dl-list">
          {rows.slice(0, 7).map((r) => {
            const overdue = r.days != null && r.days < 0
            const soon = r.days != null && r.days >= 0 && r.days <= 2
            return (
              <li key={r.key}>
                <a className={`home-dl ${overdue ? 'late' : ''}`} href={r.href}>
                  <span
                    className={r.colour ? `course-chip c${r.colour}` : 'course-chip plan'}
                    title={r.kind}
                  >
                    {r.chip}
                  </span>

                  <span className="home-dl-text">
                    <span className="home-dl-title">{r.title}</span>
                    <span className="home-dl-from">
                      {formatDeadline(r.date)}
                      {r.time && <> · {r.time}</>}
                      {/* The date is a label and is set in caps like every
                          other date here; a project's name is prose the user
                          typed, so it keeps the case they typed it in. */}
                      {r.from && <i className="home-dl-ctx">{r.from}</i>}
                    </span>
                  </span>

                  {r.progress && (
                    <span className={`home-dl-count ${r.progress.done === r.progress.total ? 'full' : ''}`}>
                      {r.progress.done}/{r.progress.total}
                    </span>
                  )}

                  <span className={`home-dl-when ${overdue ? 'late' : ''} ${soon ? 'soon' : ''}`}>
                    {dueWords(r.days)}
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}

      {late > 0 && (
        <p className="home-missed">
          {late} {late === 1 ? 'thing is' : 'things are'} past due
        </p>
      )}
      {rows.length > 7 && (
        <p className="home-dl-more">
          {rows.length - 7} more, further out
        </p>
      )}
    </section>
  )
}
