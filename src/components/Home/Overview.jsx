import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { useWeather, searchPlaces, describeCode } from '../../hooks/useWeather'
import { WeatherIcon, SearchIcon } from '../icons'
import {
  toISODate, collectDay, sinkCompleted, sortByNextBirthday, formatBirthdayDate,
  DAY_NAMES, fromISODate,
} from '../../utils'

/* ============================================================
   The three panels of the home page.

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

/* ---- Where am I? ----
   The only thing this app ever asks for, and it asks once. Typed, not sensed:
   no geolocation prompt, no IP lookup - a town name goes out to Open-Meteo's
   search and coordinates come back. */
function PlaceDialog({ current, onPick, onClose }) {
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
