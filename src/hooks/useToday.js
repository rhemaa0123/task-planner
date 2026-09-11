import { useState, useEffect } from 'react'

// The current moment, re-read at the device's next local midnight and whenever
// the tab comes back into view - a laptop woken after a night asleep should
// not still be showing yesterday's countdown
export function useToday() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const midnight = new Date(now)
    midnight.setHours(24, 0, 0, 0)
    const timer = setTimeout(() => setNow(new Date()), midnight - now + 1000)

    const onVisible = () => { if (document.visibilityState === 'visible') setNow(new Date()) }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [now])

  return now
}
