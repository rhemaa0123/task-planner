import React, { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useTheme } from '../../hooks/useTheme'
import { InlineText } from '../InlineText'
import {
  HomeIcon, WeeklyIcon, MonthlyIcon, YearlyIcon, WeeksIcon, StatsIcon, BirthdayIcon,
  ContactsIcon, AboutIcon, CollapseIcon, CogIcon, AcademicsIcon,
} from '../icons'
import { useScrollLock } from '../../hooks/useScrollLock'

const COLLAPSE_KEY = 'task-planner-sidebar'

export const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === 'collapsed'
  } catch {
    return false
  }
}

/* Home sits above the groups, on its own and without a heading: it is not one
   of a set, it is the way back. `#/` is Home, so it is also what the app opens
   on and what an empty hash falls to. */
const HOME = {
  href: '#/',
  label: 'Home',
  Icon: HomeIcon,
  match: (r) => r === '#/' || r === '' || r === '#',
}

/* The two groups the sidebar is built around. Order is the order on screen;
   `match` is what decides which row is lit, so a route is named in exactly one
   place. The weekly board answers to `#/plan…` as well as `#/weekly` - that
   prefix is what every link written before the sidebar existed points at. */
const SECTIONS = [
  {
    title: 'Planning',
    items: [
      { href: '#/weekly', label: 'Weekly', Icon: WeeklyIcon, match: (r) => r.startsWith('#/weekly') || r.startsWith('#/plan') },
      { href: '#/monthly', label: 'Monthly', Icon: MonthlyIcon, match: (r) => r.startsWith('#/monthly') },
      { href: '#/yearly', label: 'Yearly', Icon: YearlyIcon, match: (r) => r.startsWith('#/yearly') },
      { href: '#/weeks', label: 'All weeks', Icon: WeeksIcon, match: (r) => r.startsWith('#/weeks') },
      { href: '#/stats', label: 'Stats', Icon: StatsIcon, match: (r) => r.startsWith('#/stats') },
    ],
  },
  {
    title: 'Academics',
    items: [
      { href: '#/academics', label: 'Courses', Icon: AcademicsIcon, match: (r) => r.startsWith('#/academics') },
    ],
  },
  {
    title: 'People',
    items: [
      { href: '#/birthdays', label: 'Birthdays', Icon: BirthdayIcon, match: (r) => r.startsWith('#/birthdays') },
      { href: '#/contacts', label: 'Contacts', Icon: ContactsIcon, match: (r) => r.startsWith('#/contacts') },
    ],
  },
]

const THEME_CHOICES = [
  {
    id: 'light',
    label: 'Light',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    id: 'dark',
    label: 'Dark',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
  {
    id: 'auto',
    label: 'System',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="4" width="19" height="13" rx="2" />
        <path d="M8 20.5h8" />
      </svg>
    ),
  },
]

function SettingsDialog({ mode, resolved, onPick, onClose }) {
  // Holds the page still underneath; on touch a drag on the backdrop
  // would otherwise scroll the plan away behind the dialog
  useScrollLock()
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-card" role="dialog" aria-label="Settings">
        <div className="modal-eyebrow">SETTINGS</div>
        <h2 className="modal-title">Appearance</h2>

        <div className="theme-options">
          {THEME_CHOICES.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={`theme-option ${mode === id ? 'selected' : ''}`}
              onClick={() => onPick(id)}
              aria-pressed={mode === id}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        <div className="settings-note">
          {mode === 'auto'
            ? `Following your system, currently ${resolved}.`
            : `Always ${mode}.`}
        </div>

        <div className="modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

// Up to two letters off the name, for the rail - the only thing that will fit
// in 64px once the title box is gone
const initials = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '·'
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase()
}

export function Sidebar({ route, collapsed, onToggle, drawerOpen, onCloseDrawer }) {
  const { profile, setProfileName } = useApp()
  const { mode, setMode, resolved } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Following a link on a phone has to put the drawer away - the page it opens
  // is underneath it
  const follow = () => { if (drawerOpen) onCloseDrawer() }

  return (
    <aside
      className={`side ${collapsed ? 'collapsed' : ''} ${drawerOpen ? 'drawer-open' : ''}`}
      aria-label="Main navigation"
    >
      {/* ---- Who this is for ---- */}
      <div className="side-top">
        {collapsed ? (
          <div className="side-initials" title={profile.name || 'Your name'}>
            {initials(profile.name)}
          </div>
        ) : (
          <div className="side-identity">
            <InlineText
              className="side-name"
              value={profile.name}
              onSave={setProfileName}
              placeholder="Your name"
              aria-label="Your name"
            />
            <div className="side-sub">personal life OS</div>
          </div>
        )}

        <button
          type="button"
          className="side-collapse"
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          <CollapseIcon />
        </button>
      </div>

      {/* ---- Navigation ----
          Nothing but navigation. The date, the forecast, today's work and the
          birthday ring used to sit above this; they are the home page now. */}
      <nav className="side-nav">
        <div className="side-group">
          <a
            href={HOME.href}
            className={`nav-row ${HOME.match(route) ? 'active' : ''}`}
            title={collapsed ? HOME.label : undefined}
            aria-current={HOME.match(route) ? 'page' : undefined}
            onClick={follow}
          >
            <span className="nav-icon"><HOME.Icon /></span>
            <span className="nav-label">{HOME.label}</span>
          </a>
        </div>

        {SECTIONS.map(({ title, items }) => (
          <div className="side-group" key={title}>
            <div className="side-group-title">{title}</div>
            {items.map(({ href, label, Icon, match }) => (
              <a
                key={href}
                href={href}
                className={`nav-row ${match(route) ? 'active' : ''}`}
                title={collapsed ? label : undefined}
                aria-current={match(route) ? 'page' : undefined}
                onClick={follow}
              >
                <span className="nav-icon"><Icon /></span>
                <span className="nav-label">{label}</span>
              </a>
            ))}
          </div>
        ))}
      </nav>

      {/* ---- Foot ---- */}
      <div className="side-foot">
        <a
          href="#/about"
          className={`nav-row ${route.startsWith('#/about') ? 'active' : ''}`}
          title={collapsed ? 'About' : undefined}
          onClick={follow}
        >
          <span className="nav-icon"><AboutIcon /></span>
          <span className="nav-label">About</span>
        </a>
        <button
          type="button"
          className="nav-row as-button"
          onClick={() => setSettingsOpen(true)}
          title={collapsed ? 'Settings' : undefined}
        >
          <span className="nav-icon cog-spin"><CogIcon /></span>
          <span className="nav-label">Settings</span>
        </button>
        {!collapsed && (
          <p className="side-blurb">Life on a software.<br />Devs with Claude Code</p>
        )}
      </div>

      {settingsOpen && (
        <SettingsDialog
          mode={mode}
          resolved={resolved}
          onPick={setMode}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </aside>
  )
}
