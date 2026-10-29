import { Radio, FlaskConical } from 'lucide-react'
import clsx from 'clsx'

/** "Simulated" vs "Live call via Bolna" marker for a call. */
export function CallModeBadge({ isLive, long, className }: { isLive: boolean; long?: boolean; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em]',
        isLive ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20' : 'border border-dashed border-sky-300 bg-sky-50 text-sky-700',
        className,
      )}
    >
      {isLive ? <Radio className="h-3 w-3" /> : <FlaskConical className="h-3 w-3" />}
      {isLive ? (long ? 'Live call via Bolna' : 'Live') : 'Simulated'}
    </span>
  )
}
