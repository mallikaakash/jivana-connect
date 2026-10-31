import clsx from 'clsx'
import { Check, Circle } from 'lucide-react'
import type { TestTracking } from '@/api/types'

const STEPS: {
  key: keyof Omit<TestTracking, 'test_name'>
  title: string
  source: string
  doneText: string
  pendingText: string
}[] = [
  {
    key: 'test_completion_reported',
    title: 'Test completed (on call)',
    source: 'Patient-reported',
    doneText: 'Patient confirmed the test is done',
    pendingText: 'Not yet confirmed on a call',
  },
  {
    key: 'report_received',
    title: 'Follow-up visit booked',
    source: 'Front desk',
    doneText: 'Visit is on the calendar',
    pendingText: 'Schedule a follow-up visit with the patient',
  },
]

/**
 * Test reminders: confirm completion only — no lab reports on the phone.
 * `report_received` is reused in the API as “follow-up visit booked” for backward compatibility.
 */
export function TestTracker({ tracking }: { tracking: TestTracking }) {
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        <span className="font-medium text-navy-800">{tracking.test_name}</span> — Jiya only asks whether the test is
        done. We do <span className="font-medium text-navy-800">not</span> collect reports or results on the call. If
        the patient says yes, Jiya asks when they can come in for a follow-up visit.
      </p>
      <ol className="grid gap-3 sm:grid-cols-2">
        {STEPS.map((s, i) => {
          const done = tracking[s.key]
          return (
            <li
              key={s.key}
              className={clsx(
                'relative rounded-xl border p-3',
                done ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/60',
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                    done ? 'bg-emerald-600 text-white' : 'bg-white text-slate-400 ring-1 ring-slate-300',
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="text-sm font-medium text-navy-800">{s.title}</span>
              </div>
              <p className={clsx('mt-2 text-xs', done ? 'text-emerald-800' : 'text-slate-500')}>
                {done ? s.doneText : s.pendingText}
              </p>
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                <Circle className={clsx('h-2 w-2', i === 0 ? 'fill-amber-400 text-amber-400' : 'fill-teal-500 text-teal-500')} />
                {s.source}
              </p>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
