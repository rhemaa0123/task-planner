import { createClient } from '@supabase/supabase-js'

/* ============================================================
   The Supabase client, built on first use and never at module scope.

   `createClient` validates its arguments in the constructor and throws
   synchronously - "supabaseUrl is required." on a missing value, "Invalid
   supabaseUrl" on anything that is not http(s). Building it at module scope
   therefore throws while the module is being *evaluated*, which no try/catch
   around a call site can reach: the import fails, the bundle stops, `#app`
   stays empty. A machine with no `.env` would not get a planner at all.

   So the client is built on demand and the absence of credentials is a
   supported state, not an error. `getSupabase()` returns null and every
   caller has a null branch - the app runs exactly as it did before any of
   this existed, on localStorage, signed out, with the account page saying so.
   ============================================================ */

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Both must be present and the URL has to look like one, which is the same
// test the constructor applies - asking first means we never let it throw
export const cloudConfigured = Boolean(
  url && key && /^https?:\/\//i.test(String(url).trim()),
)

let client = null
let failed = false

export const getSupabase = () => {
  if (client || failed) return client
  if (!cloudConfigured) {
    failed = true
    return null
  }
  try {
    client = createClient(url, key, {
      auth: {
        /* PKCE, explicitly - the default is `implicit`, which brings the
           session back in the URL *fragment* and then blanks it
           (`window.location.hash = ''`). The fragment is this app's router,
           so every confirmation and recovery link would land on an unparseable
           route, fall through to Home, and then be wiped - with a password
           recovery having nowhere to go. PKCE answers on `?code=` and tidies
           up with replaceState, which leaves the hash alone. */
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  } catch {
    // Credentials that look right and are not. Guest mode, same as no .env
    failed = true
    client = null
  }
  return client
}
