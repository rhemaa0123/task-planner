import React from 'react'
import { useApp } from '../context/AppContext'
import { supabase } from '../supabase'

export function Header({ route }) {
  const { user } = useApp()
  const isPlans = route === '#/' || route.startsWith('#/plan')
  const isStats = route === '#/stats'

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.hash = '#/'
  }

  const userInitials = () => {
    if (!user) return 'Guest'
    const email = user.email || ''
    return email.substring(0, 2).toUpperCase()
  }

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
        <a href="#" className="support-link">♥ Support</a>
        {user ? (
          <>
            <span className="guest-badge">{userInitials()}</span>
            <button className="logout-btn" onClick={handleLogout}>Sign out</button>
          </>
        ) : (
          <>
            <span className="guest-badge">Guest</span>
            <a href="#/login" className="sign-in-btn">Sign in</a>
          </>
        )}
      </div>
    </header>
  )
}

