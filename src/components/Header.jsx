import React, { useState, useEffect } from 'react'
import { useTheme } from '../hooks/useTheme'

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

export function Header({ route }) {
  const { mode, setMode, resolved } = useTheme()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const isPlans = route === '#/' || route.startsWith('#/plan')
  const isStats = route === '#/stats'

  return (
    <header className="header">
      <div className="brand">grace<span>fullness</span></div>
      <nav className="nav-tabs">
        <a href="#/" className={`nav-tab ${isPlans ? 'active' : ''}`}>PLAN</a>
        <a href="#/stats" className={`nav-tab ${isStats ? 'active' : ''}`}>STATS</a>
        <a href="#/" className="nav-tab">WEEKS</a>
      </nav>
      <div className="header-spacer"></div>
      <div className="user-menu">
        <button
          className="cog-btn"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </div>

      {settingsOpen && (
        <SettingsDialog
          mode={mode}
          resolved={resolved}
          onPick={setMode}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </header>
  )
}

