import React, { useState } from 'react'
import { supabase } from '../supabase'
import { useApp } from '../context/AppContext'

export function Auth() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    let result
    if (isLogin) {
      result = await supabase.auth.signInWithPassword({ email, password })
    } else {
      result = await supabase.auth.signUp({ email, password })
    }

    if (result.error) {
      setError(result.error.message)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h2 className="dialog-title" style={{textAlign: 'center'}}>{isLogin ? 'Welcome back' : 'Create an account'}</h2>

        {error && <div className="toast error" style={{position: 'static', marginBottom: '16px'}}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="auth-field">
            <label>Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="auth-submit">
            {isLogin ? 'Sign in' : 'Sign up'}
          </button>
        </form>

        <p style={{textAlign: 'center', marginTop: '16px', fontSize: '0.8rem'}}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            className="today-link"
            style={{background: 'none', border: 'none'}}
            onClick={() => setIsLogin(!isLogin)}
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

