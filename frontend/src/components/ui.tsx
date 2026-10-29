import clsx from 'clsx'
import { AlertTriangle, Inbox, Loader2, RotateCw } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { label, toneFor, type Tone } from '@/lib/format'

const TONE_CLASSES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  grey: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
}

const DOT_CLASSES: Record<Tone, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  grey: 'bg-slate-400',
  blue: 'bg-sky-500',
}

/** Coloured pill for any contract enum value. Pass `tone` to override the default mapping. */
export function StatusBadge({ value, tone, text, className }: { value: string | null | undefined; tone?: Tone; text?: string; className?: string }) {
  const t = tone ?? toneFor(value)
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONE_CLASSES[t], className)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', DOT_CLASSES[t])} />
      {text ?? label(value)}
    </span>
  )
}

/** Persistent label for seeded / simulated / prototype content. */
export function DemoBadge({ children = 'Demo data', className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center rounded-md border border-dashed border-violet-300 bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700', className)}>
      {children}
    </span>
  )
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={clsx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-navy-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className={clsx('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export function SummaryCard({ label: title, value, hint, icon, tone = 'grey' }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{title}</span>
        {icon && <span className={clsx('rounded-lg p-1.5 ring-1 ring-inset', TONE_CLASSES[tone])}>{icon}</span>}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-navy-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-teal-600 text-white hover:bg-teal-700 disabled:bg-teal-600/50',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
}

export function Button({ variant = 'primary', loading, icon, children, className, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={clsx('inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed', BUTTON_VARIANTS[variant], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

export function LoadingState({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {text}
    </div>
  )
}

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <div className="mb-2 text-slate-300">{icon ?? <Inbox className="h-8 w-8" />}</div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500">{description}</p>}
    </div>
  )
}

export function ErrorBanner({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  const message = typeof error === 'string' ? error : error.message
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-medium text-red-700 hover:underline">
          <RotateCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  )
}

/** Label/value grid for detail panels. */
export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{it.label}</dt>
          <dd className="mt-0.5 text-sm text-slate-800">{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Renders a call/task `extracted_fields` object as a readable list. */
export function ExtractedFields({ fields }: { fields: Record<string, string | boolean | null> | null }) {
  if (!fields || Object.keys(fields).length === 0) return <EmptyState title="No structured fields extracted yet" />
  return (
    <DetailList
      items={Object.entries(fields).map(([k, v]) => ({
        label: label(k),
        // Enum-looking values (snake_case) get a badge-style label; free text is shown as-is.
        value: typeof v === 'boolean' ? (v ? 'Yes' : 'No') : !v ? '—' : /^[a-z_]+$/.test(v) ? label(v) : v,
      }))}
    />
  )
}
