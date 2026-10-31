import { DESK_TASKS } from '../demo/clinicalDemoData'

export function DeskOperationsPreview() {
  return (
    <div className="landing-ui-panel mt-4 overflow-hidden">
      <div className="border-b border-black/5 bg-[#faf8f3] px-3 py-2 text-[10px] font-medium text-[var(--landing-ink-muted)]">
        Operations inbox
      </div>
      <ul className="divide-y divide-black/5 text-xs">
        {DESK_TASKS.map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div>
              <span className="font-medium text-[var(--landing-forest)]">{t.title}</span>
              <p className="text-[10px] text-[var(--landing-ink-muted)]">{t.patientName}</p>
            </div>
            <span className="text-[10px] font-medium text-[var(--landing-teal-deep)] capitalize">{t.status}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
