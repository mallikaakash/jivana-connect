import type { Meta } from './types'

const STORAGE_KEY = 'jivana_clinic_token'

/** Demo / hackathon: key from build env or published reviewer key in /meta (no sign-in UI). */
export function resolveClinicAccessKey(meta: Meta): string | null {
  const fromEnv = (import.meta.env.VITE_CLINIC_ACCESS_KEY as string | undefined)?.trim()
  if (fromEnv) return fromEnv
  const published = meta.reviewer_sign_in?.access_key?.trim()
  return published || null
}

export function getClinicAccessToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setClinicAccessToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(STORAGE_KEY, token)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
