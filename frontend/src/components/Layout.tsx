import clsx from 'clsx'
import {
  AlertTriangle,
  CalendarDays,
  Layers,
  LayoutDashboard,
  ListChecks,
  Menu,
  PhoneCall,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api, API_MODE, APP_MODE } from '@/api'
import { useStaffRole, staffDisplayName, staffInitials } from '@/features/clinic/workspace'
import { useAsync } from '@/lib/useAsync'
import { JivanaConnectLogo } from '@/components/branding/JivanaConnectLogo'
import { PartnerLogos } from '@/components/PartnerLogos'
import { DemoBadge } from './ui'

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }

const DEMO_NAV: NavItem[] = [
  { to: '/today', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/tasks', label: 'Tasks & Follow-ups', icon: ListChecks },
  { to: '/batches', label: 'Batches', icon: Layers },
  { to: '/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/calls', label: 'Calls', icon: PhoneCall },
  { to: '/escalations', label: 'Clinical review', icon: AlertTriangle },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function doctorNav(showAppointments: boolean): NavItem[] {
  const items: NavItem[] = [
    { to: '/today', label: 'Today', icon: LayoutDashboard, end: true },
    { to: '/escalations', label: 'Clinical review', icon: AlertTriangle },
    { to: '/patients', label: 'Patients', icon: Users },
    { to: '/calls', label: 'Calls', icon: PhoneCall },
  ]
  if (showAppointments) {
    items.splice(3, 0, { to: '/appointments', label: 'Appointments', icon: CalendarDays })
  }
  return items
}

function deskNav(showAppointments: boolean): NavItem[] {
  const items: NavItem[] = [
    { to: '/today', label: 'Today', icon: LayoutDashboard, end: true },
    { to: '/patients', label: 'Patients', icon: Users },
    { to: '/tasks?view=attention', label: 'Tasks & Follow-ups', icon: ListChecks },
    { to: '/batches', label: 'Batches', icon: Layers },
    { to: '/calls', label: 'Calls', icon: PhoneCall },
    { to: '/escalations', label: 'Clinical review', icon: AlertTriangle },
    { to: '/settings', label: 'Settings', icon: Settings },
  ]
  if (showAppointments) {
    items.splice(4, 0, { to: '/appointments', label: 'Appointments', icon: CalendarDays })
  }
  return items
}

function titleFor(pathname: string, nav: NavItem[]): string {
  const match = [...nav].reverse().find((n) => {
    const base = n.to.split('?')[0]
    return n.end ? pathname === base : pathname.startsWith(base)
  })
  return match?.label ?? 'Jivana Connect'
}

function Wordmark() {
  return (
    <div className="px-4 pt-6 pb-5">
      <JivanaConnectLogo variant="onDark" />
    </div>
  )
}

function RoleToggle({ role, onChange }: { role: 'doctor' | 'desk'; onChange: (r: 'doctor' | 'desk') => void }) {
  return (
    <div className="flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 text-xs font-medium">
      {(['doctor', 'desk'] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={clsx(
            'rounded-md px-2.5 py-1 capitalize transition-colors',
            role === r ? 'bg-white text-navy-800 shadow-sm' : 'text-slate-600 hover:text-navy-800',
          )}
        >
          {r === 'doctor' ? 'Doctor' : 'Front desk'}
        </button>
      ))}
    </div>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const [staffRole, setStaffRole] = useStaffRole()
  const meta = useAsync(() => api.getMeta(), [])
  const isClinic = APP_MODE === 'clinic' || meta.data?.app_mode === 'clinic'
  const dash = useAsync(
    () => (isClinic ? api.getDashboardSummary() : Promise.resolve(null)),
    [isClinic],
    isClinic ? 30_000 : undefined,
  )
  const openEscalations = dash.data?.open_escalations_count ?? 0
  const showAppointments = meta.data?.features?.appointments !== false
  const nav = useMemo(() => {
    if (!isClinic) return DEMO_NAV
    return staffRole === 'doctor' ? doctorNav(showAppointments) : deskNav(showAppointments)
  }, [isClinic, staffRole, showAppointments])

  const staffName = staffDisplayName(meta.data?.clinical_lead_label, staffRole)
  const initials = staffRole === 'desk' ? 'FD' : staffInitials(staffName)

  const sidebar = (
    <nav className="grain relative flex h-full min-h-0 flex-col overflow-hidden bg-navy-800 text-navy-100">
      <div className="pointer-events-none absolute -top-24 -left-20 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl animate-breathe" />
      <Wordmark />
      <p className="eyebrow px-6 pb-2 !text-emerald-200/40">Workspace</p>
      <ul className="relative min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map(({ to, label, icon: Icon, end }) => {
          const showEscBadge = isClinic && to === '/escalations' && openEscalations > 0
          const tasksNav = to.startsWith('/tasks')
          const linkActive = tasksNav
            ? pathname === '/tasks' || pathname.startsWith('/tasks/')
            : undefined
          return (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={() => setOpen(false)}
                className={({ isActive }) => {
                  const active = linkActive ?? isActive
                  return clsx(
                    'group flex items-center gap-3 rounded-xl py-2.5 pr-3 pl-3 text-[14px] transition-all duration-300 ease-soft',
                    active
                      ? 'border-l-[3px] border-emerald-300 bg-white/[0.08] pl-[calc(0.75rem-3px)] text-white'
                      : 'border-l-[3px] border-transparent text-navy-200 hover:bg-white/[0.04] hover:text-white',
                  )
                }}
              >
                {({ isActive }) => {
                  const active = linkActive ?? isActive
                  return (
                  <>
                    <Icon className={clsx('h-4 w-4 shrink-0 transition-transform duration-300 ease-soft group-hover:scale-110', active && 'text-emerald-300')} />
                    <span className="truncate">{label}</span>
                    {showEscBadge && (
                      <span className="ml-auto rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-navy-900">
                        {openEscalations}
                      </span>
                    )}
                  </>
                  )
                }}
              </NavLink>
            </li>
          )
        })}
      </ul>
      {isClinic ? (
        <div className="relative mx-4 mb-5 mt-auto shrink-0 border-t border-white/[0.08] pt-4">
          <PartnerLogos surface="dark" layout="row" inline />
        </div>
      ) : (
        <div className="relative mx-4 mb-5 mt-auto shrink-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="font-serif text-[15px] leading-snug font-light text-white">Every patient connected.</p>
          <p className="font-serif text-[15px] leading-snug font-light text-emerald-300">Every follow-up accounted for.</p>
          <p className="mt-3 text-[11px] leading-relaxed text-navy-200/80">Hackathon prototype. All patient data is synthetic.</p>
        </div>
      )}
    </nav>
  )

  return (
    <div className="flex h-dvh min-h-dvh overflow-hidden">
      <aside className="hidden h-full w-64 shrink-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-navy-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-72 animate-[rise_.5s_var(--ease-soft)_both]">{sidebar}</aside>
        </div>
      )}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-page">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-slate-200/70 bg-page/75 px-4 py-3 backdrop-blur-xl lg:gap-3 lg:px-10">
          <button
            type="button"
            className="rounded-full p-1.5 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span key={pathname} className="hidden animate-fade truncate text-sm font-medium text-navy-800 sm:block">
            {titleFor(pathname, nav)}
          </span>
          {APP_MODE === 'demo' && (
            <DemoBadge className="shrink-0">{API_MODE === 'mock' ? 'Demo data · offline' : 'Demo data'}</DemoBadge>
          )}
          {isClinic && <RoleToggle role={staffRole} onChange={setStaffRole} />}
          <div className={clsx('ml-auto flex items-center gap-2.5 text-xs text-slate-500')}>
            {isClinic && (
              <div className="flex items-center lg:hidden">
                <PartnerLogos surface="light" layout="row" compact />
              </div>
            )}
            <span className="hidden sm:inline">{isClinic ? staffName : 'Demo staff'}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-[11px] font-medium tracking-wide text-emerald-200">
              {isClinic ? initials : 'DS'}
            </span>
          </div>
        </header>
        <main className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-emerald-200/40 blur-3xl animate-breathe" />
            <div className="absolute top-[40%] -left-40 h-[420px] w-[420px] rounded-full bg-red-200/30 blur-3xl animate-breathe [animation-delay:-4s]" />
          </div>
          <div key={pathname} className="relative mx-auto min-h-full max-w-7xl px-4 py-8 lg:px-10">
            <div className="animate-rise">
              <Outlet />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
