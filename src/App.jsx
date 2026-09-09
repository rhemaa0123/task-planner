import React from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { useHashRouter } from './hooks/useHashRouter'
import { Header } from './components/Header'
import { Board } from './components/WeeklyPlan/Board'
import { Auth } from './components/Auth'

function AppContent() {
  const { route } = useHashRouter()
  const { loading, toasts } = useApp()

  let content
  if (route === '#/login') {
    content = <Auth />
  } else if (route === '#/stats') {
    content = <div style={{padding: 24}}>Stats coming soon in React</div>
  } else {
    content = loading ? <p className="status">Loading your week…</p> : <Board />
  }

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

