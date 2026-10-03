import React, { useState, useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { useHashRouter } from './hooks/useHashRouter'
import { Sidebar, readCollapsed } from './components/Sidebar/Sidebar'
import { Board } from './components/WeeklyPlan/Board'
import { WeeksPage } from './components/Weeks/WeeksPage'
import { StatsPage } from './components/StatsPage'
import { MonthlyPage } from './components/Monthly/MonthlyPage'
import { YearlyPage } from './components/Yearly/YearlyPage'
import { BirthdaysPage } from './components/People/BirthdaysPage'
import { ContactsPage } from './components/People/ContactsPage'
import { AboutPage } from './components/AboutPage'

const COLLAPSE_KEY = 'task-planner-sidebar'

// Everything the old header held now lives down the left-hand side, so the
// shell is two columns rather than a bar and a page. The sidebar has two
// states that are not the same thing:
//
//   collapsed - a deliberate choice, remembered per browser. The sidebar
//               becomes a 64px rail of icons and the page takes the room.
//   drawerOpen - a phone only, never remembered. There is no room for a rail
//               and a page at once, so the sidebar slides over the page and
//               the next tap puts it away.
function AppContent() {
  const { route } = useHashRouter()
  const { toasts } = useApp()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const toggle = () => {
    // On a phone the same control opens and closes the drawer; the rail state
    // is a desktop idea and is left alone there
    if (window.matchMedia('(max-width: 900px)').matches) {
      setDrawerOpen((o) => !o)
      return
    }
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? 'collapsed' : 'open')
      } catch {
        // Private mode - the sidebar still collapses for this session
      }
      return next
    })
  }

  // Escape closes the drawer, the same as it closes every dialog here
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const page = route.startsWith('#/monthly') ? <MonthlyPage route={route} />
    : route.startsWith('#/yearly') ? <YearlyPage />
    : route.startsWith('#/weeks') ? <WeeksPage />
    : route.startsWith('#/stats') ? <StatsPage />
    : route.startsWith('#/birthdays') ? <BirthdaysPage />
    : route.startsWith('#/contacts') ? <ContactsPage />
    : route.startsWith('#/about') ? <AboutPage />
    : <Board />

  return (
    <div className={`shell ${collapsed ? 'rail' : ''}`}>
      <Sidebar
        route={route}
        collapsed={collapsed}
        onToggle={toggle}
        drawerOpen={drawerOpen}
        onCloseDrawer={() => setDrawerOpen(false)}
      />

      {/* Phone only: the sidebar is off-canvas, so something has to call it back */}
      <button
        type="button"
        className="side-open"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open navigation"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      </button>
      {drawerOpen && <div className="side-scrim" onClick={() => setDrawerOpen(false)} />}

      <main className="main-content">
        {page}
      </main>

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}
