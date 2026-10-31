import clsx from 'clsx'
import type { TranscriptTurn } from '@/api'

/** Chat-style transcript: Jiya (agent) on the left, patient on the right. */
export function Transcript({ turns }: { turns: TranscriptTurn[] }) {
  return (
    <ol className="space-y-3">
      {turns.map((t, i) => {
        const agent = t.role === 'agent'
        return (
          <li key={i} className={clsx('flex', agent ? 'justify-start' : 'justify-end')}>
            <div className={clsx('max-w-[85%] sm:max-w-[75%]')}>
              <div className={clsx('mb-0.5 text-[11px] font-medium uppercase tracking-[0.16em]', agent ? 'text-teal-700' : 'text-right text-slate-400')}>
                {agent ? 'Jiya' : 'Patient'}
              </div>
              <div
                className={clsx(
                  'rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                  agent ? 'rounded-tl-sm bg-teal-50 text-navy-900 ring-1 ring-inset ring-teal-100' : 'rounded-tr-sm bg-slate-100 text-slate-800',
                )}
              >
                {t.text}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
