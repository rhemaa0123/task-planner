import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'task-planner-theme'
const MODES = ['light', 'dark', 'auto']

export function readThemeMode() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return MODES.includes(saved) ? saved : 'auto'
  } catch {
    return 'auto'
  }
}

const systemPrefersDark = () =>
  window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches

export function resolveTheme(mode) {
  return mode === 'auto' ? (systemPrefersDark() ? 'dark' : 'light') : mode
}

// Resolving to a concrete value here keeps the stylesheet to two blocks instead
// of duplicating the dark palette under a prefers-color-scheme query too
export function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', resolveTheme(mode))
}

export function useTheme() {
  const [mode, setMode] = useState(readThemeMode)

  useEffect(() => {
    applyTheme(mode)
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // private mode - the theme still applies for this session
    }
  }, [mode])

  useEffect(() => {
    if (mode !== 'auto' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('auto')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  return { mode, setMode: useCallback((m) => setMode(m), []), resolved: resolveTheme(mode) }
}
