import clsx from 'clsx'
import { AlertTriangle, CalendarDays, LayoutDashboard, Leaf, ListChecks, Menu, PhoneCall, Settings, Users, X } from 'lucide-react'
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

function Wordmark() {
  return (
    <div className="flex items-center gap-3 px-6 pt-7 pb-8">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/25">
        <Leaf className="h-4 w-4" />
        <span className="absolute inset-0 rounded-full bg-emerald-400/20 animate-breathe" />
      </span>
      <div className="leading-none">
        <div className="text-[22px] font-light tracking-[-0.01em] text-white">jivana</div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.28em] text-emerald-300/80">connect</div>
      </div>
    </div>
  )
}

export function Layout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const meta = useAsync(() => api.getMeta(), [])
  const voiceMode = meta.data?.voice_mode

  const sidebar = (
    <nav className="grain relative flex h-full flex-col overflow-hidden bg-navy-800 text-navy-100">
      <div className="pointer-events-none absolute -top-24 -left-20 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl animate-breathe" />
      <Wordmark />
      <p className="eyebrow px-6 pb-2 !text-emerald-200/40">Workspace</p>
      <ul className="relative flex-1 space-y-0.5 px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-all duration-300 ease-soft',
                  isActive ? 'bg-white/[0.08] text-white' : 'text-navy-200 hover:bg-white/[0.04] hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={clsx(
                      'absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-emerald-300 transition-transform duration-500 ease-soft',
                      isActive ? 'scale-y-100' : 'scale-y-0',
                    )}
                  />
                  <Icon className={clsx('h-4 w-4 transition-transform duration-300 ease-soft group-hover:scale-110', isActive && 'text-emerald-300')} />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="relative mx-4 mb-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <p className="font-serif text-[15px] leading-snug font-light text-white">Every patient connected.</p>
        <p className="font-serif text-[15px] leading-snug font-light text-emerald-300">Every follow-up accounted for.</p>
        <p className="mt-3 text-[11px] leading-relaxed text-navy-200/80">Hackathon prototype. All patient data is synthetic.</p>
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
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/70 bg-page/75 px-4 py-3 backdrop-blur-xl lg:px-10">
          <button
            type="button"
            className="rounded-full p-1.5 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span key={pathname} className="hidden animate-fade truncate text-sm font-medium text-navy-800 sm:block">
            {titleFor(pathname)}
          </span>
          <DemoBadge className="shrink-0">{API_MODE === 'mock' ? 'Demo data · offline' : 'Demo data'}</DemoBadge>
          {voiceMode && (
            // Wrapper does the hiding: the badge's own inline-flex would override `hidden`.
            <span className="hidden md:block">
              <StatusBadge value={voiceMode} text={voiceMode === 'live' ? 'Jiya voice: live' : 'Jiya voice: simulated'} />
            </span>
          )}
          <div className="ml-auto flex items-center gap-2.5 text-xs text-slate-500">
            <span className="hidden sm:inline">Demo staff</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-[11px] font-medium tracking-wide text-emerald-200">DS</span>
          </div>
        </header>
        <main className="relative flex-1 overflow-y-auto overflow-x-hidden">
          {/* Soft breathing light, as on the Jivana site. Decorative only. */}
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
