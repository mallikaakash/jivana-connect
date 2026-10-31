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
import { DemoBadge } from './ui'

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean }

const DEMO_NAV: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/tasks', label: 'Tasks & Follow-ups', icon: ListChecks },
  { to: '/batches', label: 'Batches', icon: Layers },
  { to: '/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/calls', label: 'Calls', icon: PhoneCall },
  { to: '/escalations', label: 'Escalations', icon: AlertTriangle },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function doctorNav(showAppointments: boolean): NavItem[] {
  const items: NavItem[] = [
    { to: '/', label: 'Today', icon: LayoutDashboard, end: true },
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
    { to: '/', label: 'Today', icon: LayoutDashboard, end: true },
    { to: '/patients', label: 'Patients', icon: Users },
    { to: '/tasks', label: 'Tasks & Follow-ups', icon: ListChecks },
    { to: '/batches', label: 'Batches', icon: Layers },
    { to: '/calls', label: 'Calls', icon: PhoneCall },
    { to: '/escalations', label: 'Escalations', icon: AlertTriangle },
    { to: '/settings', label: 'Settings', icon: Settings },
  ]
  if (showAppointments) {
    items.splice(4, 0, { to: '/appointments', label: 'Appointments', icon: CalendarDays })
  }
  return items
}

function titleFor(pathname: string, nav: NavItem[]): string {
  const match = [...nav].reverse().find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))
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
  const showAppointments = meta.data?.features?.appointments !== false
  const nav = useMemo(() => {
    if (!isClinic) return DEMO_NAV
    return staffRole === 'doctor' ? doctorNav(showAppointments) : deskNav(showAppointments)
  }, [isClinic, staffRole, showAppointments])

  const staffName = staffDisplayName(meta.data?.clinical_lead_label)
  const initials = staffInitials(staffName)

  const sidebar = (
    <nav className="grain relative flex h-full flex-col overflow-hidden bg-navy-800 text-navy-100">
      <div className="pointer-events-none absolute -top-24 -left-20 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl animate-breathe" />
      <Wordmark />
      <p className="eyebrow px-6 pb-2 !text-emerald-200/40">Workspace</p>
      <ul className="relative flex-1 space-y-0.5 px-3">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 rounded-xl py-2.5 pr-3 pl-3 text-[14px] transition-all duration-300 ease-soft',
                  isActive
                    ? 'border-l-[3px] border-emerald-300 bg-white/[0.08] pl-[calc(0.75rem-3px)] text-white'
                    : 'border-l-[3px] border-transparent text-navy-200 hover:bg-white/[0.04] hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={clsx('h-4 w-4 shrink-0 transition-transform duration-300 ease-soft group-hover:scale-110', isActive && 'text-emerald-300')} />
                  <span className="truncate">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="relative mx-4 mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        {isClinic ? (
          <>
            <p className="text-sm font-medium text-white">Staff workspace</p>
            <p className="mt-1 text-[11px] leading-relaxed text-navy-200/80">Follow-ups, calls & clinical review</p>
          </>
        ) : (
          <>
            <p className="font-serif text-[15px] leading-snug font-light text-white">Every patient connected.</p>
            <p className="font-serif text-[15px] leading-snug font-light text-emerald-300">Every follow-up accounted for.</p>
            <p className="mt-3 text-[11px] leading-relaxed text-navy-200/80">Hackathon prototype. All patient data is synthetic.</p>
          </>
        )}
      </div>
    </nav>
  )

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade bg-navy-900/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-72 animate-[rise_.5s_var(--ease-soft)_both]">{sidebar}</aside>
        </div>
      )}
      <div className="relative flex min-w-0 flex-1 flex-col">
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
          <div className="ml-auto flex items-center gap-2.5 text-xs text-slate-500">
            <span className="hidden sm:inline">{isClinic ? staffName : 'Demo staff'}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-[11px] font-medium tracking-wide text-emerald-200">
              {isClinic ? initials : 'DS'}
            </span>
          </div>
        </header>
        <main className="relative flex-1 overflow-y-auto overflow-x-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-emerald-200/40 blur-3xl animate-breathe" />
            <div className="absolute top-[40%] -left-40 h-[420px] w-[420px] rounded-full bg-red-200/30 blur-3xl animate-breathe [animation-delay:-4s]" />
          </div>
          <div key={pathname} className="relative mx-auto max-w-7xl animate-rise px-4 py-8 lg:px-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
