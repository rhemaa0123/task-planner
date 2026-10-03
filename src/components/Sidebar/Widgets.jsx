import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useToday } from '../../hooks/useToday'
import { useWeather, searchPlaces, describeCode } from '../../hooks/useWeather'
import { WeatherIcon, SearchIcon } from '../icons'
import {
  toISODate, collectDay, sinkCompleted, sortByNextBirthday, formatBirthdayDate,
  DAY_NAMES, MONTH_NAMES, fromISODate,
} from '../../utils'

/* ============================================================
   The head of the sidebar: four small readings of the day, above
   the navigation. None of them is a page - each is the one line
   of its page worth carrying everywhere, and each links through
   to the page that owns it.
   ============================================================ */

/* ---- Date ----
   The widest thing on the page that is not the plan. `useToday()` is what
   turns it over at local midnight, and it is the same clock the countdown,
   the birthday ring and the day's task list all read. */
export function DateCard() {
  const now = useToday()
  const day = DAY_NAMES[(now.getDay() + 6) % 7]
  return (
    <div className="wx-date">
      <div className="wx-date-day">{day}</div>
      <div className="wx-date-rest">
        {String(now.getDate()).padStart(2, '0')} {MONTH_NAMES[now.getMonth()]} {now.getFullYear()}
      </div>
    </div>
  )
}

/* ---- Today's work ----
   Read straight off the weekly plan, by date: any unit anywhere in the store
   whose day is today, whichever week it was filed under. That last part
   matters - a unit moved past the end of its week still belongs on the day it
   now sits on, and a list built from the *visible* week would lose it the
   moment you browsed away. Ticking here is the same write the board makes, so
   the two can never disagree. */
export function TodayTasks() {
  const { allProjects, toggleTask, toggleSubtask } = useApp()
  const now = useToday()
  const iso = toISODate(now)
  const { items } = collectDay(allProjects, iso)
  const rows = sinkCompleted(items)
  const done = rows.filter((r) => r.completed).length

  return (
    <section className="wx-today">
      <div className="wx-head">
        <span className="wx-head-label">Today</span>
        {rows.length > 0 && (
          <span className={`wx-head-count ${done === rows.length ? 'full' : ''}`}>
            {done}/{rows.length}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <a className="wx-empty" href="#/">Nothing scheduled — open the week</a>
      ) : (
        <ul className="wx-today-list">
          {rows.map((r) => (
            <li key={r.key} className={`wx-today-row ${r.completed ? 'done' : ''}`}>
              <input
                type="checkbox"
                className="task-check"
                checked={r.completed}
                onChange={(e) => (r.subtaskId
                  ? toggleSubtask(r.taskId, r.subtaskId, e.target.checked)
                  : toggleTask(r.taskId, e.target.checked))}
                aria-label={r.subtitle || r.taskTitle}
              />
              <span className="wx-today-text">
                <span className="wx-today-title">{r.subtitle || r.taskTitle}</span>
                <span className="wx-today-from">{r.projectName}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ---- Birthday countdown ----
   The top of the ring the birthdays page draws in full: whoever is next, and
   how far off. Today's reads "Today" and takes the highlight, which is the
   same rule the page itself uses - both go through `sortByNextBirthday()`. */
export function BirthdayRing() {
  const { birthdays } = useApp()
  const now = useToday()
  const ring = sortByNextBirthday(birthdays, now)
  if (!ring.length) return null

  const soon = ring.slice(0, 3)
  return (
    <section className="wx-bdays">
      <div className="wx-head">
        <span className="wx-head-label">Birthdays</span>
        <a className="wx-head-link" href="#/birthdays">All</a>
      </div>
      <ul className="wx-bday-list">
        {soon.map((b) => (
          <li key={b.id} className={`wx-bday ${b.next.days === 0 ? 'today' : ''}`}>
            <span className="wx-bday-name">{b.name || 'Unnamed'}</span>
            <span className="wx-bday-when">
              {b.next.days === 0
                ? 'Today'
                : b.next.days === 1
                  ? 'Tomorrow'
                  : `${b.next.days}d`}
            </span>
            <span className="wx-bday-date">
              {formatBirthdayDate(b)}
              {b.next.turning != null && ` · ${b.next.turning}`}
            </span>
          </li>
        ))}
      </ul>
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

export function WeatherCard() {
  const { place, setPlace, data, status } = useWeather()
  const [picking, setPicking] = useState(false)

  const today = data?.days?.[0]
  const cond = data ? describeCode(data.code) : null

  return (
    <section className="wx-weather">
      {!place ? (
        <button type="button" className="wx-setup" onClick={() => setPicking(true)}>
          <WeatherIcon name="part" />
          <span>Set your location for the forecast</span>
        </button>
      ) : (
        <button
          type="button"
          className="wx-weather-body"
          onClick={() => setPicking(true)}
          title="Change location"
        >
          <span className="wx-weather-left">
            <WeatherIcon name={cond?.icon || 'cloud'} />
          </span>
          <span className="wx-weather-mid">
            <span className="wx-temp">
              {data ? `${data.temp}°` : status === 'loading' ? '—' : '!'}
            </span>
            <span className="wx-cond">
              {status === 'error' && !data ? 'Unavailable' : cond?.label || 'Loading'}
            </span>
          </span>
          <span className="wx-weather-right">
            <span className="wx-place">{place.name}</span>
            {today && <span className="wx-range">{today.high}° / {today.low}°</span>}
          </span>
        </button>
      )}

      {place && data?.days?.length > 1 && (
        <ul className="wx-forecast">
          {data.days.slice(1).map((d) => (
            <li key={d.iso}>
              <span className="wx-fc-day">
                {DAY_NAMES[(fromISODate(d.iso).getDay() + 6) % 7].slice(0, 3)}
              </span>
              <WeatherIcon name={describeCode(d.code).icon} />
              <span className="wx-fc-temp">{d.high}°<i>{d.low}°</i></span>
            </li>
          ))}
        </ul>
      )}

      {picking && (
        <PlaceDialog current={place} onPick={setPlace} onClose={() => setPicking(false)} />
      )}
    </section>
  )
}
