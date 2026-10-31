import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  INITIAL_CONCERNS,
  type ClinicalConcern,
  type ConcernPriority,
  type ConcernStatus,
} from './clinicalDemoData'

type FilterTab = 'all' | 'new' | 'awaiting_review' | 'callback_required' | 'resolved'

type ClinicalDemoContextValue = {
  concerns: ClinicalConcern[]
  openId: string | null
  setOpenId: (id: string | null) => void
  filterTab: FilterTab
  setFilterTab: (tab: FilterTab) => void
  search: string
  setSearch: (q: string) => void
  priorityFilter: 'all' | ConcernPriority
  setPriorityFilter: (p: 'all' | ConcernPriority) => void
  filteredConcerns: ClinicalConcern[]
  metrics: { newCount: number; awaiting: number; callbacks: number; completed: number }
  assignClinician: (id: string, name: string) => void
  markUnderReview: (id: string) => void
  requestCallback: (id: string) => void
  recordAction: (id: string) => void
  markResolved: (id: string) => void
}

const ClinicalDemoContext = createContext<ClinicalDemoContextValue | null>(null)

function matchesFilter(c: ClinicalConcern, tab: FilterTab): boolean {
  if (tab === 'all') return true
  if (tab === 'new') return c.status === 'new'
  if (tab === 'awaiting_review') return c.status === 'assigned' || c.status === 'under_review'
  if (tab === 'callback_required') return c.status === 'callback_required'
  if (tab === 'resolved') return c.status === 'resolved' || c.status === 'action_recorded'
  return true
}

function pushActivity(c: ClinicalConcern, label: string): ClinicalConcern {
  const at = new Date().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  return { ...c, activity: [...c.activity, { at, label }] }
}

export function ClinicalDemoProvider({ children }: { children: ReactNode }) {
  const [concerns, setConcerns] = useState<ClinicalConcern[]>(() => INITIAL_CONCERNS.map((c) => ({ ...c })))
  const [openId, setOpenId] = useState<string | null>(null)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<'all' | ConcernPriority>('all')

  const update = useCallback((id: string, patch: Partial<ClinicalConcern>, activityLabel?: string) => {
    setConcerns((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c
        let next = { ...c, ...patch }
        if (activityLabel) next = pushActivity(next, activityLabel)
        return next
      }),
    )
  }, [])

  const assignClinician = useCallback(
    (id: string, name: string) => {
      update(id, { assignedTo: name, status: 'assigned' as ConcernStatus, nextAction: 'Clinician to review patient-reported concern' }, `Assigned to ${name}`)
    },
    [update],
  )

  const markUnderReview = useCallback(
    (id: string) => {
      update(id, { status: 'under_review', nextAction: 'Complete clinician assessment — concern not resolved until documented' }, 'Marked under review')
    },
    [update],
  )

  const requestCallback = useCallback(
    (id: string) => {
      update(id, { status: 'callback_required', nextAction: 'Clinician callback — patient-reported concern pending' }, 'Callback requested')
    },
    [update],
  )

  const recordAction = useCallback(
    (id: string) => {
      update(id, { status: 'action_recorded', nextAction: 'Document clinical outcome — review may still be required' }, 'Action recorded (demo)')
    },
    [update],
  )

  const markResolved = useCallback(
    (id: string) => {
      update(id, { status: 'resolved', nextAction: 'Closed after clinician review (illustrative)' }, 'Marked resolved — clinician decision')
    },
    [update],
  )

  const filteredConcerns = useMemo(() => {
    const q = search.trim().toLowerCase()
    return concerns.filter((c) => {
      if (!matchesFilter(c, filterTab)) return false
      if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false
      if (!q) return true
      return (
        c.patientName.toLowerCase().includes(q) ||
        c.concernSummary.toLowerCase().includes(q) ||
        (c.assignedTo?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [concerns, filterTab, search, priorityFilter])

  const metrics = useMemo(() => {
    return {
      newCount: concerns.filter((c) => c.status === 'new').length,
      awaiting: concerns.filter((c) => c.status === 'assigned' || c.status === 'under_review').length,
      callbacks: concerns.filter((c) => c.status === 'callback_required').length,
      completed: concerns.filter((c) => c.status === 'resolved' || c.status === 'action_recorded').length,
    }
  }, [concerns])

  const value: ClinicalDemoContextValue = {
    concerns,
    openId,
    setOpenId,
    filterTab,
    setFilterTab,
    search,
    setSearch,
    priorityFilter,
    setPriorityFilter,
    filteredConcerns,
    metrics,
    assignClinician,
    markUnderReview,
    requestCallback,
    recordAction,
    markResolved,
  }

  return <ClinicalDemoContext.Provider value={value}>{children}</ClinicalDemoContext.Provider>
}

export function useClinicalDemo() {
  const ctx = useContext(ClinicalDemoContext)
  if (!ctx) throw new Error('useClinicalDemo requires ClinicalDemoProvider')
  return ctx
}

export function useClinicalDemoOptional() {
  return useContext(ClinicalDemoContext)
}
