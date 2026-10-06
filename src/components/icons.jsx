import React from 'react'

// One stroked set, drawn on the same 24px grid at the same 1.7 weight, so a
// row of them in the sidebar reads as one family rather than seven borrowed
// glyphs. Size comes from CSS (`width`/`height` on `.nav-icon` and friends),
// never from the markup, so a rail and an expanded sidebar share these.
const Svg = ({ children, ...rest }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
)

/* ---- Navigation ---- */

// Home: a roof over a door. The only nav icon that is not about a span of time
// or a kind of person, which is the point - it is the way back, not one of the set
export const HomeIcon = () => (
  <Svg>
    <path d="M3.5 10.5 12 3.5l8.5 7" />
    <path d="M5.5 9v11h13V9" />
    <path d="M9.75 20v-5.5h4.5V20" />
  </Svg>
)

// A week: the month frame with one row picked out
export const WeeklyIcon = () => (
  <Svg>
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    <path d="M6 14.5h12" strokeWidth="2.6" opacity="0.55" />
  </Svg>
)

// A month: the same frame, filled with days
export const MonthlyIcon = () => (
  <Svg>
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    <circle cx="8" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="16" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="17" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
  </Svg>
)

// A year: twelve boxes, stacked back
export const YearlyIcon = () => (
  <Svg>
    <rect x="3" y="7" width="14" height="14" rx="2.5" />
    <path d="M7 3.5h12a1.5 1.5 0 0 1 1.5 1.5v12" opacity="0.6" />
    <path d="M3 12h14M10 7v14" />
  </Svg>
)

// The archive of past weeks: a stack of rows
export const WeeksIcon = () => (
  <Svg>
    <path d="M4 6.5h16M4 12h16M4 17.5h10" />
    <circle cx="19" cy="17.5" r="1.4" opacity="0.6" />
  </Svg>
)

// Birthdays: a cake with one candle
export const BirthdayIcon = () => (
  <Svg>
    <path d="M4 20.5h16" />
    <path d="M4.5 20.5v-6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v6" />
    <path d="M4.5 16.2c1.6 0 1.6 1.4 3.2 1.4s1.6-1.4 3.2-1.4 1.6 1.4 3.2 1.4 1.6-1.4 3.2-1.4 1.4.6 2.2 1" />
    <path d="M12 12.5V9" />
    <path d="M12 6.2c.9-1 .5-2 0-2.7-.5.7-.9 1.7 0 2.7z" fill="currentColor" stroke="none" />
  </Svg>
)

// Contacts: two people
export const ContactsIcon = () => (
  <Svg>
    <circle cx="9.5" cy="8" r="3.2" />
    <path d="M3.5 20c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6" />
    <path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.9M17.5 14.9c2 .7 3.3 2.6 3.3 5.1" opacity="0.6" />
  </Svg>
)

// Academics: a book held open. Not a mortarboard - that says "graduation",
// which is one day, and this is about the term you are in
export const AcademicsIcon = () => (
  <Svg>
    <path d="M12 6.8v13" />
    <path d="M12 6.8C10.3 5.4 7.8 4.8 4 4.8v12.6c3.8 0 6.3.6 8 2" />
    <path d="M12 6.8c1.7-1.4 4.2-2 8-2v12.6c-3.8 0-6.3.6-8 2" />
  </Svg>
)

// Stats: bars rising off a baseline
export const StatsIcon = () => (
  <Svg>
    <path d="M4 20.5V4" opacity="0.6" />
    <path d="M4 20.5h16" opacity="0.6" />
    <path d="M8.5 20.5v-5M13 20.5v-9M17.5 20.5v-3.5" strokeWidth="2.2" />
  </Svg>
)

export const AboutIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5" />
    <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
  </Svg>
)

/* ---- Chrome ---- */

export const CollapseIcon = () => (
  <Svg>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M9.5 4.5v15" />
  </Svg>
)

export const ChevronIcon = () => (
  <Svg><path d="M9 5l7 7-7 7" /></Svg>
)

export const PlusIcon = () => (
  <Svg><path d="M12 5.5v13M5.5 12h13" /></Svg>
)

export const SearchIcon = () => (
  <Svg><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Svg>
)

// A pop-up that comes round every day: two arrows chasing each other
export const RepeatIcon = () => (
  <Svg>
    <path d="M17 2.5l3 3-3 3" />
    <path d="M4 11.5v-1a5 5 0 0 1 5-5h11" />
    <path d="M7 21.5l-3-3 3-3" />
    <path d="M20 12.5v1a5 5 0 0 1-5 5H4" />
  </Svg>
)

// On to the next day
export const ArrowRightIcon = () => (
  <Svg><path d="M4.5 12h15M13.5 6l6 6-6 6" /></Svg>
)

// Back to the day before
export const ArrowLeftIcon = () => (
  <Svg><path d="M19.5 12h-15M10.5 6l-6 6 6 6" /></Svg>
)

export const TrashIcon = () => (
  <Svg>
    <path d="M4.5 7h15M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7" />
    <path d="M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
  </Svg>
)

export const CogIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Svg>
)

/* ---- Weather ----
   Keyed by the `icon` name `describeCode()` hands back, so the widget never
   has to know what a WMO code is. */

const Cloud = () => <path d="M7.5 18.5h9a3.75 3.75 0 0 0 .4-7.5 5.5 5.5 0 0 0-10.6 1.2 3.2 3.2 0 0 0 1.2 6.3z" />

const WEATHER_GLYPHS = {
  clear: () => (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3v2.2M12 18.8V21M4.5 4.5l1.6 1.6M17.9 17.9l1.6 1.6M3 12h2.2M18.8 12H21M4.5 19.5l1.6-1.6M17.9 6.1l1.6-1.6" />
    </>
  ),
  part: () => (
    <>
      <path d="M8.2 7.4a3.4 3.4 0 1 1 4.6 4.4" />
      <path d="M9 2.6v1.7M3.6 8h1.7M4.9 4.1l1.2 1.2" />
      <Cloud />
    </>
  ),
  cloud: Cloud,
  fog: () => (<><Cloud /><path d="M4 21h11M8 21h-.01" opacity="0.7" /></>),
  drizzle: () => (<><Cloud /><path d="M9 21v1M13 20.6v1.4M17 21v1" opacity="0.8" /></>),
  rain: () => (<><Cloud /><path d="M8.6 20.3l-.8 2.2M12.6 20.3l-.8 2.2M16.6 20.3l-.8 2.2" /></>),
  snow: () => (
    <>
      <Cloud />
      <path d="M9 21.3h.01M13 22h.01M17 21.3h.01" strokeWidth="2.4" />
    </>
  ),
  storm: () => (<><Cloud /><path d="M13.5 19.8l-3 2.9h3l-1.2 2.4" /></>),
}

export const WeatherIcon = ({ name = 'cloud' }) => {
  const Glyph = WEATHER_GLYPHS[name] || WEATHER_GLYPHS.cloud
  return <Svg className="wx-glyph"><Glyph /></Svg>
}
