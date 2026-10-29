import clsx from 'clsx'
import { AlertTriangle, CalendarDays, HeartPulse, LayoutDashboard, ListChecks, Menu, PhoneCall, Settings, Users, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api, API_MODE } from '@/api'
import { useAsync } from '@/lib/useAsync'
import { DemoBadge, StatusBadge } from './ui'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/tasks', label: 'Tasks & Follow-ups', icon: ListChecks },
  { to: '/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/calls', label: 'Calls', icon: PhoneCall },
  { to: '/escalations', label: 'Escalations', icon: AlertTriangle },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function titleFor(pathname: string): string {
  const match = [...NAV].reverse().find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)))
  return match?.label ?? 'Jivana Connect'
}

export function Layout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const meta = useAsync(() => api.getMeta(), [])
  const voiceMode = meta.data?.voice_mode

  const sidebar = (
    <nav className="flex h-full flex-col bg-navy-900 text-navy-100">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500 text-white">
          <HeartPulse className="h-5 w-5" />
        </span>
        <div>
          <div className="text-sm font-semibold text-white">Jivana Connect</div>
          <div className="text-[11px] text-navy-200">Care coordination</div>
        </div>
      </div>
      <ul className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-white/10 text-white' : 'text-navy-200 hover:bg-white/5 hover:text-white')
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="border-t border-white/10 px-5 py-4 text-[11px] leading-relaxed text-navy-200">
        Hackathon prototype. All patient data is synthetic.
      </div>
    </nav>
  )

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-900/50" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
          <button type="button" className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(!open)} aria-label="Toggle navigation">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="truncate text-sm font-semibold text-navy-800">{titleFor(pathname)}</span>
          <DemoBadge className="shrink-0">{API_MODE === 'mock' ? 'Demo data · offline mock' : 'Demo data'}</DemoBadge>
          {voiceMode && <StatusBadge className="hidden md:inline-flex" value={voiceMode} text={voiceMode === 'live' ? 'Jiya voice: live' : 'Jiya voice: simulated'} />}
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            <span className="hidden sm:inline">Demo staff</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">DS</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
