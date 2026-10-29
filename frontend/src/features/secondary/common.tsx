// Page-local helpers for the secondary pages (Patients, Appointments, Calls, Escalations, Settings).
import clsx from 'clsx'
import { ArrowLeft, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorBanner, LoadingState, StatusBadge } from '@/components/ui'
import { isNotFound } from './helpers'

/** Friendly not-found state with a link back to the list page. */
export function NotFoundState({ what, backTo, backLabel }: { what: string; backTo: string; backLabel: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <EmptyState
        icon={<SearchX className="h-8 w-8" />}
        title={`${what} not found`}
        description={`This ${what.toLowerCase()} does not exist in the demo dataset. It may have been removed by a demo reset.`}
      />
      <div className="text-center">
        <Link to={backTo} className="text-sm font-medium text-teal-700 hover:underline">
          {backLabel}
        </Link>
      </div>
    </div>
  )
}

/**
 * Standard first-load handling for a useAsync result: loading spinner, 404, or error banner.
 * Returns null once data exists (callers then render content, plus `RefreshError` for later failures).
 */
export function LoadGate({
  data,
  error,
  reload,
  notFound,
}: {
  data: unknown
  error: Error | undefined
  loading?: boolean
  reload: () => void
  notFound?: { what: string; backTo: string; backLabel: string }
}): ReactNode {
  if (data !== undefined) return null
  if (error) {
    if (notFound && isNotFound(error)) return <NotFoundState {...notFound} />
    return <ErrorBanner error={error} onRetry={reload} />
  }
  return <LoadingState />
}

/** Shown above existing content when a background refresh (poll or retry) fails. */
export function RefreshError({ error, reload }: { error: Error | undefined; reload: () => void }) {
  if (!error) return null
  return (
    <div className="mb-4">
      <ErrorBanner error={`Could not refresh: ${error.message}`} onRetry={reload} />
    </div>
  )
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-navy-800">
      <ArrowLeft className="h-4 w-4" /> {children}
    </Link>
  )
}

/** "Live" (real Jiya/Bolna call) vs "Simulated" (seeded or simulator-driven). */
export function VoiceModeBadge({ isLive }: { isLive: boolean }) {
  return <StatusBadge value={isLive ? 'live' : 'simulated'} text={isLive ? 'Live call' : 'Simulated'} />
}

export function TextLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} onClick={(e) => e.stopPropagation()} className={clsx('font-medium text-teal-700 hover:underline', className)}>
      {children}
    </Link>
  )
}

export function FilterSelect<V extends string>({
  label: text,
  value,
  onChange,
  options,
}: {
  label: string
  value: V
  onChange: (v: V) => void
  options: { value: V; label: string }[]
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-600">
      <span className="whitespace-nowrap">{text}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Small muted helper/explanation line. */
export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx('text-xs leading-relaxed text-slate-500', className)}>{children}</p>
}
