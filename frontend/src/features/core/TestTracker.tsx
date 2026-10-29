import clsx from 'clsx'
import { Check, Circle } from 'lucide-react'
import type { TestTracking } from '@/api/types'

const STEPS: { key: keyof Omit<TestTracking, 'test_name'>; title: string; source: string; doneText: string; pendingText: string }[] = [
  { key: 'test_completion_reported', title: 'Test completion reported', source: 'Patient-reported', doneText: 'Patient says the test is done', pendingText: 'Patient has not reported the test yet' },
  { key: 'report_received', title: 'Report received', source: 'Confirmed by clinic', doneText: 'Report is in the clinic system', pendingText: 'Report not yet received' },
  { key: 'clinician_reviewed', title: 'Clinician reviewed', source: 'Confirmed by clinician', doneText: 'Clinician has reviewed the report', pendingText: 'Clinician review pending' },
]

/** Three separate facts — never collapsed into one "test done" boolean. */
export function TestTracker({ tracking }: { tracking: TestTracking }) {
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">
        <span className="font-medium text-navy-800">{tracking.test_name}</span> — each step is tracked separately. A patient saying the test is done is not proof the report has been received or reviewed.
      </p>
      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => {
          const done = tracking[s.key]
          return (
            <li key={s.key} className={clsx('relative rounded-lg border p-3', done ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50/60')}>
              <div className="flex items-center gap-2">
                <span className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold', done ? 'bg-emerald-600 text-white' : 'bg-white text-slate-400 ring-1 ring-slate-300')}>
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="text-sm font-medium text-navy-800">{s.title}</span>
              </div>
              <p className={clsx('mt-2 text-xs', done ? 'text-emerald-800' : 'text-slate-500')}>{done ? s.doneText : s.pendingText}</p>
              <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
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
