import { useCallback, useSyncExternalStore } from 'react'

export type StaffRole = 'doctor' | 'desk'

const STORAGE_KEY = 'jivana_staff_role'

let role: StaffRole = readStoredRole()

const listeners = new Set<() => void>()

function readStoredRole(): StaffRole {
  if (typeof localStorage === 'undefined') return 'desk'
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'doctor') return 'doctor'
  if (v === 'desk') return 'desk'
  return 'desk'
}

function emit() {
  listeners.forEach((l) => l())
}

export function getStaffRole(): StaffRole {
  return role
}

export function setStaffRole(next: StaffRole): void {
  if (next === role) return
  role = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  emit()
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => listeners.delete(onStoreChange)
}

export function useStaffRole(): [StaffRole, (r: StaffRole) => void] {
  const current = useSyncExternalStore(subscribe, getStaffRole, () => 'desk' as StaffRole)
  const set = useCallback((r: StaffRole) => setStaffRole(r), [])
  return [current, set]
}

export function staffDisplayName(metaLead: string | null | undefined, role: StaffRole): string {
  if (role === 'desk') return 'Front desk staff'
  return metaLead?.trim() || 'Clinical lead'
}

export function staffInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return 'CS'
}
