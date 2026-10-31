import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  type Auth,
} from 'firebase/auth'
import { setClinicAccessToken } from '@/api/auth'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
}

export function firebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId)
}

function app(): FirebaseApp | null {
  if (!firebaseConfigured()) return null
  return getApps()[0] ?? initializeApp(config)
}

function auth(): Auth | null {
  const a = app()
  return a ? getAuth(a) : null
}

async function storeTokenFromAuth(a: Auth): Promise<boolean> {
  const user = a.currentUser
  if (!user) return false
  const token = await user.getIdToken(true)
  setClinicAccessToken(token)
  return true
}

/** After signInWithRedirect, call once on app load. */
export async function completeGoogleRedirectSignIn(): Promise<boolean> {
  const a = auth()
  if (!a) return false
  const result = await getRedirectResult(a)
  if (result?.user) {
    const token = await result.user.getIdToken()
    setClinicAccessToken(token)
    return true
  }
  return storeTokenFromAuth(a)
}

export async function signInWithGooglePopup(): Promise<void> {
  const a = auth()
  if (!a) throw new Error('Firebase is not configured in this build.')
  const cred = await signInWithPopup(a, new GoogleAuthProvider())
  const token = await cred.user.getIdToken()
  setClinicAccessToken(token)
}

export function signInWithGoogleRedirect(): void {
  const a = auth()
  if (!a) throw new Error('Firebase is not configured in this build.')
  void signInWithRedirect(a, new GoogleAuthProvider())
}
