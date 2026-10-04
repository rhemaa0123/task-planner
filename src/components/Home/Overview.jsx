import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { useWeather, searchPlaces, describeCode } from '../../hooks/useWeather'
import { WeatherIcon, SearchIcon, PlusIcon, TrashIcon } from '../icons'
import {
  toISODate, collectDay, sinkCompleted, sortByNextBirthday, formatBirthdayDate,
  sortCountdowns, formatShortDate, DAY_NAMES, fromISODate,
  collectDeadlines, dueWords, formatDeadline,
} from '../../utils'
import { useScrollLock } from '../../hooks/useScrollLock'

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

/* ---- Today's work ----
   Read off the weekly plan by date: any unit anywhere in the store whose day
   is today, whichever week it was filed under. That last part matters - a unit
   moved past the end of its week still belongs on the day it now sits on, and
   a list built from the *visible* week would lose it the moment the board
   browsed away. Ticking here is the same write the board makes, so the two can
   never disagree. */
export function TodayPanel() {
  const { allProjects, toggleTask, toggleSubtask } = useApp()
  const now = useToday()
  const iso = toISODate(now)
  const { items, missed } = collectDay(allProjects, iso)
  const rows = sinkCompleted(items)
  const done = rows.filter((r) => r.completed).length

  return (
    <section className="panel home-today">
      <div className="panel-head">
        <span className="eyebrow">TODAY</span>
        {rows.length > 0 && (
          <span className={`panel-count ${done === rows.length ? 'full' : ''}`}>
            {done}/{rows.length}
          </span>
        )}
        <a className="panel-link" href="#/weekly">Open the week ↗</a>
      </div>

      {rows.length === 0 ? (
        <p className="home-empty">
          Nothing is scheduled for today. <a href="#/weekly">Plan the week</a> to put
          something here.
        </p>
      ) : (
        <ul className="home-today-list">
          {rows.map((r) => (
            <li key={r.key} className={`home-today-row ${r.completed ? 'done' : ''}`}>
              <input
                type="checkbox"
                className="task-check"
                checked={r.completed}
                onChange={(e) => (r.subtaskId
                  ? toggleSubtask(r.taskId, r.subtaskId, e.target.checked)
                  : toggleTask(r.taskId, e.target.checked))}
                aria-label={r.subtitle || r.taskTitle}
              />
              <span className="home-today-text">
                <span className="home-today-title">{r.subtitle || r.taskTitle}</span>
                <span className="home-today-from">
                  {r.projectName}
                  {r.subtitle && <> · {r.taskTitle}</>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {missed.length > 0 && (
        <p className="home-missed">
          {missed.length} {missed.length === 1 ? 'thing' : 'things'} marked missed today
        </p>
      )}
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
