import clsx from 'clsx'
import { AlertTriangle, Inbox, Loader2, RotateCw } from 'lucide-react'
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { label, toneFor, type Tone } from '@/lib/format'

const TONE_CLASSES: Record<Tone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/15',
  grey: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/15',
}

const DOT_CLASSES: Record<Tone, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  grey: 'bg-slate-400',
  blue: 'bg-sky-500',
}

// Statuses that mean "something is happening right now" get a breathing dot.
const LIVE_VALUES = new Set(['queued', 'initiating', 'in_progress', 'live'])

/** Coloured pill for any contract enum value. Pass `tone` to override the default mapping. */
export function StatusBadge({ value, tone, text, className }: { value: string | null | undefined; tone?: Tone; text?: string; className?: string }) {
  const t = tone ?? toneFor(value)
  const live = value != null && LIVE_VALUES.has(value)
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors duration-300',
        TONE_CLASSES[t],
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {live && <span className={clsx('absolute inset-0 rounded-full animate-ping-soft', DOT_CLASSES[t])} />}
        <span className={clsx('relative h-1.5 w-1.5 rounded-full', DOT_CLASSES[t])} />
      </span>
      {text ?? label(value)}
    </span>
  )
}

/** Persistent label for seeded / simulated / prototype content. */
export function DemoBadge({ children = 'Demo data', className }: { children?: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-violet-300/70 bg-violet-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-violet-700',
        className,
      )}
    >
      <span className="h-1 w-1 rounded-full bg-violet-600/70" />
      {children}
    </span>
  )
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section
      className={clsx(
        'rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-shadow duration-500 ease-soft hover:shadow-lift',
        className,
      )}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-[15px] font-medium tracking-[-0.005em] text-navy-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className={clsx('p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

/** Animates a number from its previous value to the new one. */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(0)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now()
    const begin = from.current
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 4)
      setShown(Math.round(begin + (value - begin) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <>{shown}</>
}

export function SummaryCard({ label: title, value, hint, icon, tone = 'grey' }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode; tone?: Tone }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-500 ease-soft hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow">{title}</span>
        {icon && (
          <span className={clsx('rounded-full p-2 ring-1 ring-inset transition-transform duration-500 ease-soft group-hover:scale-110 group-hover:-rotate-6', TONE_CLASSES[tone])}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 font-serif text-[2.75rem] leading-none font-light tracking-[-0.03em] text-navy-900">
        {typeof value === 'number' ? <CountUp value={value} /> : value}
      </div>
      {hint && <div className="mt-2.5 text-xs text-slate-500">{hint}</div>}
      <span className={clsx('absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 transition-transform duration-700 ease-soft group-hover:scale-x-100', DOT_CLASSES[tone])} />
    </div>
  )
}

/** `accent` renders a second headline line in leaf green, as on the Jivana site. */
export function PageHeader({ title, accent, subtitle, actions }: { title: string; accent?: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[2.5rem] leading-[1.05] font-light text-navy-900">
          {title}
          {accent && <span className="block text-teal-600">{accent}</span>}
        </h1>
        {subtitle && <div className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-navy-800 text-white shadow-[0_14px_30px_-14px_rgb(30_46_36/0.6)] hover:bg-teal-600 disabled:bg-navy-800/40 disabled:shadow-none',
  secondary: 'border border-slate-300 bg-white/60 text-navy-800 hover:border-navy-800/40 hover:bg-white disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-navy-800 disabled:text-slate-400',
  danger: 'bg-red-600 text-white shadow-[0_14px_30px_-14px_rgb(169_76_48/0.6)] hover:bg-red-700 disabled:bg-red-600/50',
}

export function Button({ variant = 'primary', loading, icon, children, className, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className={clsx(
        'group/btn inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-300 ease-soft',
        'enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.98] disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        icon && <span className="inline-flex transition-transform duration-300 ease-soft group-hover/btn:scale-110">{icon}</span>
      )}
      {children}
    </button>
  )
}

/** Shimmering placeholder rows instead of a bare spinner. */
export function LoadingState({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="animate-fade space-y-3 py-4" role="status" aria-label={text}>
      {[92, 76, 84, 64].map((w, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3" style={{ width: `${w}%` }} />
            <div className="skeleton h-2.5" style={{ width: `${w - 30}%` }} />
          </div>
        </div>
      ))}
      <span className="sr-only">{text}</span>
    </div>
  )
}

export function EmptyState({ title, description, icon }: { title: string; description?: string; icon?: ReactNode }) {
  return (
    <div className="flex animate-fade flex-col items-center justify-center py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="font-serif text-lg font-light text-navy-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>}
    </div>
  )
}

export function ErrorBanner({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  const message = typeof error === 'string' ? error : error.message
  return (
    <div role="alert" className="flex animate-pop items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{message}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="group inline-flex items-center gap-1 font-medium text-red-700 hover:underline">
          <RotateCw className="h-3.5 w-3.5 transition-transform duration-500 ease-soft group-hover:-rotate-180" /> Retry
        </button>
      )}
    </div>
  )
}

/** Label/value grid for detail panels. */
export function DetailList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="eyebrow">{it.label}</dt>
          <dd className="mt-1 text-sm text-slate-800">{it.value ?? '—'}</dd>
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
