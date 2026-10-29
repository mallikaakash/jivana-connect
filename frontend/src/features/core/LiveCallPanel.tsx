import clsx from 'clsx'
import { ArrowRight, Check, ExternalLink, Loader2, PhoneCall, PhoneMissed } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Call, Task, TaskStatus } from '@/api/types'
import { StatusBadge } from '@/components/ui'
import { label } from '@/lib/format'
import { CallModeBadge } from './CallModeBadge'
import { isCallTerminal } from './helpers'

const STEPS = ['Initiating', 'In progress', 'Completed'] as const

function stepIndex(call: Call): number {
  if (call.status === 'queued' || call.status === 'initiating') return 0
  if (call.status === 'in_progress') return 1
  return 2
}

function headline(call: Call): string {
  switch (call.status) {
    case 'queued':
      return 'Call queued…'
    case 'initiating':
      return 'Call initiating…'
    case 'in_progress':
      return 'In progress — Jiya is talking to the patient…'
    case 'completed':
      return 'Call completed'
    case 'no_answer':
      return 'No answer'
    case 'failed':
      return 'Call failed'
    default:
      return 'Call cancelled'
  }
}

/**
 * Inline status for a call started from the task page. Polling happens in the page; this only renders
 * what the backend last reported — nothing is shown as done before the backend says so.
 */
export function LiveCallPanel({ call, task, trail }: { call: Call; task: Task; trail: TaskStatus[] }) {
  const terminal = isCallTerminal(call.status)
  const idx = stepIndex(call)
  const failedEnd = terminal && call.status !== 'completed'

  return (
    <section
      aria-live="polite"
      className={clsx(
        'overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-colors',
        terminal ? (failedEnd ? 'border-amber-300' : 'border-emerald-300') : 'border-teal-300',
      )}
    >
      <header className={clsx('flex flex-wrap items-center gap-3 px-4 py-3', terminal ? (failedEnd ? 'bg-amber-50' : 'bg-emerald-50') : 'bg-teal-50')}>
        <span
          className={clsx(
            'relative flex h-9 w-9 items-center justify-center rounded-full text-white',
            terminal ? (failedEnd ? 'bg-amber-500' : 'bg-emerald-600') : 'bg-teal-600',
          )}
        >
          {!terminal && <span className="absolute inset-0 animate-ping rounded-full bg-teal-500/40" />}
          {failedEnd ? <PhoneMissed className="relative h-4 w-4" /> : <PhoneCall className="relative h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy-900">{headline(call)}</p>
          <p className="text-xs text-slate-500">
            Call status: <span className="font-medium text-slate-700">{label(call.status)}</span>
            {!terminal && ' · updating every 2 s'}
          </p>
        </div>
        <CallModeBadge isLive={call.is_live} long />
        <Link to={`/calls/${call.call_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline">
          View call <ExternalLink className="h-3 w-3" />
        </Link>
      </header>

      <div className="space-y-5 p-4">
        {/* Call progress */}
        <ol className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const done = i < idx || (i === idx && terminal && !failedEnd)
            const active = i === idx && !terminal
            const failed = i === 2 && failedEnd
            return (
              <li key={s} className="flex flex-1 items-center gap-2">
                <span
                  className={clsx(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    done && 'bg-emerald-600 text-white',
                    active && 'bg-teal-600 text-white',
                    failed && 'bg-amber-500 text-white',
                    !done && !active && !failed && 'bg-slate-100 text-slate-400',
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : failed ? '!' : i + 1}
                </span>
                <span className={clsx('whitespace-nowrap text-xs font-medium', done || active || failed ? 'text-navy-800' : 'text-slate-400')}>
                  {failed ? label(call.status) : s}
                </span>
                {i < STEPS.length - 1 && <span className={clsx('h-0.5 flex-1 rounded', i < idx ? 'bg-emerald-400' : 'bg-slate-200')} />}
              </li>
            )
          })}
        </ol>

        {/* Task status transition — separate from call status */}
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">Task status (tracked separately from the call)</p>
          <div className="flex flex-wrap items-center gap-2">
            {trail.map((s, i) => {
              const last = i === trail.length - 1
              return (
                <span key={`${s}-${i}`} className="flex items-center gap-2">
                  <span className={clsx('rounded-full transition-all', last ? 'ring-2 ring-teal-500 ring-offset-2' : 'opacity-60')}>
                    <StatusBadge value={s} />
                  </span>
                  {!last && <ArrowRight className="h-3.5 w-3.5 text-slate-400" />}
                </span>
              )
            })}
            {!terminal && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          </div>
        </div>

        {terminal && (
          <div className="grid gap-4 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Extracted outcome</p>
              <div className="mt-1">{call.outcome ? <StatusBadge value={call.outcome} /> : <span className="text-sm text-slate-500">No outcome (call not answered)</span>}</div>
              {call.summary && <p className="mt-2 text-sm text-slate-700">{call.summary}</p>}
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Next action</p>
              <p className="mt-1 text-sm font-semibold text-navy-900">{task.next_action}</p>
              {call.processing_result && <p className="mt-2 text-xs text-slate-500">Backend: {call.processing_result}</p>}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
