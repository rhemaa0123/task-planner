/* ============================================================
   Firebase - Google sign-in (Authentication) and the account's copy of the
   planner (Cloud Firestore). Replaces the dormant Supabase client, Nov 2026.

   Two rules carried over from that client, both learned the hard way:

   - **Nothing is built at module scope.** An SDK that validates its config in
     a constructor throws while the module is being evaluated, which no caller
     can catch - the bundle stops and `#app` stays empty. So the SDK is loaded
     on first call, inside a promise.
   - **A missing config is a supported state.** No `.env` means guest mode:
     `cloudConfigured` is false, `getFirebase()` resolves to null, and the
     planner runs on localStorage exactly as it always has.

   The SDK is also a dynamic import, so Vite puts it in a chunk of its own
   and a guest who never signs in never downloads it.
   ============================================================ */

const env = import.meta.env

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const cloudConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
)

// Local testing only: point both services at the Firebase emulators
// (`npx firebase-tools emulators:start --only auth,firestore`)
export const usingEmulator = env.VITE_FIREBASE_EMULATOR === '1'

let loading = null

export const getFirebase = () => {
  if (!cloudConfigured) return Promise.resolve(null)
  if (!loading) {
    loading = load().catch((err) => {
      console.error('Firebase failed to start', err)
      loading = null
      return null
    })
  }
  return loading
}

async function load() {
  const [appMod, authMod, fs] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
  ])

  const app = appMod.initializeApp(config)

  // The session survives a reload (IndexedDB, localStorage as the fallback).
  // The popup resolver is named explicitly because initializeAuth, unlike
  // getAuth, does not bring one in by itself.
  const auth = authMod.initializeAuth(app, {
    persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence],
    popupRedirectResolver: authMod.browserPopupRedirectResolver,
  })

  /* Firestore keeps its own offline cache in IndexedDB, shared by every tab.
     That cache is what makes a write made offline survive a closed tab: it
     is queued there and sent the next time there is a connection. Where
     IndexedDB is refused the SDK falls back to memory by itself; the
     `task-planner-sync-dirty` list in useCloudSync covers that case. */
  let db
  try {
    db = fs.initializeFirestore(app, {
      localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
    })
  } catch {
    db = fs.initializeFirestore(app, { localCache: fs.memoryLocalCache() })
  }

  if (usingEmulator) {
    authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    fs.connectFirestoreEmulator(db, '127.0.0.1', 8080)
  }

  return { app, auth, db, authMod, fs }
}
