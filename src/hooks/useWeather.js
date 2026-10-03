import { useState, useEffect, useCallback, useRef } from 'react'

// The one thing in this app that leaves the machine.
//
// Everything else - the plan, the birthdays, the contacts - is localStorage and
// nothing else, and that is worth keeping true on purpose rather than by
// accident. So the weather widget asks for nothing until a place is named: no
// location prompt on first paint, no request to anybody. Once a place is set it
// is remembered, and only then does the forecast call go out.
//
// Open-Meteo needs no key and no account, and both endpoints are given
// coordinates or a search string - never anything of the user's.
const PLACE_KEY = 'task-planner-weather'
const CACHE_KEY = 'task-planner-weather-cache'
// A forecast an hour old is still a forecast. This is what keeps switching
// pages, or coming back to the tab, from being a request each time.
const MAX_AGE_MS = 60 * 60 * 1000

const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST = 'https://api.open-meteo.com/v1/forecast'

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
    // Private mode - the forecast still shows, it just will not be remembered
  }
}

export const readPlace = () => read(PLACE_KEY, null)

// WMO weather codes, folded into the handful of states worth drawing. The
// label is what the widget reads out; `icon` picks the glyph.
const CONDITIONS = [
  { max: 0, icon: 'clear', label: 'Clear' },
  { max: 2, icon: 'part', label: 'Partly cloudy' },
  { max: 3, icon: 'cloud', label: 'Overcast' },
  { max: 48, icon: 'fog', label: 'Fog' },
  { max: 57, icon: 'drizzle', label: 'Drizzle' },
  { max: 67, icon: 'rain', label: 'Rain' },
  { max: 77, icon: 'snow', label: 'Snow' },
  { max: 82, icon: 'rain', label: 'Showers' },
  { max: 86, icon: 'snow', label: 'Snow showers' },
  { max: 99, icon: 'storm', label: 'Thunderstorm' },
]

export function describeCode(code) {
  return CONDITIONS.find((c) => code <= c.max) || { icon: 'cloud', label: '—' }
}

// Searching for a town by name. Returns [] rather than throwing, so a typo or
// a dropped connection just shows "nothing found".
export async function searchPlaces(query) {
  const q = query.trim()
  if (q.length < 2) return []
  try {
    const url = `${GEOCODE}?name=${encodeURIComponent(q)}&count=6&language=en&format=json`
    const res = await fetch(url)
    if (!res.ok) return []
    const body = await res.json()
    return (body.results || []).map((r) => ({
      id: r.id,
      name: r.name,
      // "Lyon, Auvergne-Rhône-Alpes, France" - enough to tell two Springfields apart
      detail: [r.admin1, r.country].filter(Boolean).join(', '),
      latitude: r.latitude,
      longitude: r.longitude,
    }))
  } catch {
    return []
  }
}

export function useWeather() {
  const [place, setPlaceState] = useState(readPlace)
  const [data, setData] = useState(() => {
    const cached = read(CACHE_KEY, null)
    return cached && Date.now() - cached.at < MAX_AGE_MS ? cached.data : null
  })
  const [status, setStatus] = useState(place ? 'loading' : 'empty')
  // A place changed while a request is in flight must not be overwritten by
  // the answer to the old one
  const token = useRef(0)

  const load = useCallback(async (target, { force = false } = {}) => {
    if (!target) return
    const cached = read(CACHE_KEY, null)
    if (!force && cached && cached.key === target.name && Date.now() - cached.at < MAX_AGE_MS) {
      setData(cached.data)
      setStatus('ready')
      return
    }

    const mine = ++token.current
    setStatus('loading')
    try {
      const url = `${FORECAST}?latitude=${target.latitude}&longitude=${target.longitude}`
        + '&current=temperature_2m,weather_code,apparent_temperature'
        + '&daily=weather_code,temperature_2m_max,temperature_2m_min'
        + '&timezone=auto&forecast_days=3'
      const res = await fetch(url)
      if (!res.ok) throw new Error(String(res.status))
      const body = await res.json()
      if (mine !== token.current) return

      const next = {
        temp: Math.round(body.current?.temperature_2m),
        feels: Math.round(body.current?.apparent_temperature),
        code: body.current?.weather_code ?? 3,
        days: (body.daily?.time || []).map((iso, i) => ({
          iso,
          code: body.daily.weather_code[i],
          high: Math.round(body.daily.temperature_2m_max[i]),
          low: Math.round(body.daily.temperature_2m_min[i]),
        })),
      }
      setData(next)
      setStatus('ready')
      write(CACHE_KEY, { key: target.name, at: Date.now(), data: next })
    } catch {
      if (mine !== token.current) return
      // The last good forecast is better than an empty box, so it is left on
      // screen and only the status says the refresh did not land
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (place) load(place)
    else setStatus('empty')
  }, [place, load])

  const setPlace = useCallback((next) => {
    write(PLACE_KEY, next)
    write(CACHE_KEY, null)
    setData(null)
    setPlaceState(next)
  }, [])

  return { place, setPlace, data, status, reload: () => load(place, { force: true }) }
}
