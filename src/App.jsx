import React from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { useHashRouter } from './hooks/useHashRouter'
import { Header } from './components/Header'
import { Board } from './components/WeeklyPlan/Board'

function AppContent() {
  const { route } = useHashRouter()
  const { toasts } = useApp()

  // The plan comes straight out of localStorage, so there is nothing to wait for
  const content = route === '#/stats'
    ? <div style={{padding: 24}}>Stats coming soon in React</div>
    : <Board />

  return (
    <>
      <Header route={route} />
      <main className="main-content">
        {content}
      </main>

      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}

