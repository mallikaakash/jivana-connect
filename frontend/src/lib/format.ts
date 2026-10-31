import type { Priority, TaskType } from '@/api/types'

export type Tone = 'green' | 'amber' | 'red' | 'grey' | 'blue'

// Status → colour, per docs/CONTRACT.md.
const TONES: Record<string, Tone> = {
  completed: 'green',
  confirmed: 'green',
  resolved: 'green',
  routine_ok: 'green',
  task_acknowledged: 'green',
  ok: 'green',
  live: 'green',

  pending: 'amber',
  due: 'amber',
  in_progress: 'amber',
  queued: 'amber',
  initiating: 'amber',
  awaiting_staff_action: 'amber',
  rescheduling_requested: 'amber',
  acknowledged: 'amber',
  assigned: 'amber',
  no_answer: 'amber',
  needs_attention: 'amber',
  test_completion_reported: 'amber',
  callback_requested: 'amber',
  high: 'amber',
  simulated: 'blue',

  urgent: 'red',
  open: 'red',
  failed: 'red',
  concern_reported: 'red',
  declined: 'red',

  cancelled: 'grey',
  unable_to_confirm: 'grey',
  low: 'grey',
  normal: 'grey',
  scheduled: 'grey',
  not_configured: 'grey',
}

export function toneFor(value: string | null | undefined): Tone {
  return (value && TONES[value]) || 'grey'
}

const LABEL_OVERRIDES: Record<string, string> = {
  post_procedure_checkin: 'Post-procedure check-in',
  test_report_reminder: 'Test / report reminder',
  clinician_task_reminder: 'Clinician task reminder',
  hinglish: 'Hinglish',
  hi: 'Hindi',
  en: 'English',
  ok: 'OK',
}

/** Plain-language call/task outcomes for clinic staff and doctors. */
const CLINIC_OUTCOME_LABELS: Record<string, string> = {
  unable_to_confirm: 'Could not confirm on call',
  concern_reported: 'Patient reported a concern',
  rescheduling_requested: 'Patient asked to reschedule',
  callback_requested: 'Patient asked for a callback',
  routine_ok: 'Routine check-in — no concerns',
  no_answer: 'No answer',
  declined: 'Patient declined',
  confirmed: 'Appointment confirmed',
}

export function outcomeLabel(value: string | null | undefined, clinicMode = false): string {
  if (!value) return '—'
  if (clinicMode && CLINIC_OUTCOME_LABELS[value]) return CLINIC_OUTCOME_LABELS[value]
  return label(value)
}

/** snake_case → "Sentence case". */
export function label(value: string | null | undefined): string {
  if (!value) return '—'
  if (LABEL_OVERRIDES[value]) return LABEL_OVERRIDES[value]
  const s = value.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function taskTypeLabel(t: TaskType): string {
  return label(t)
}

const TZ = 'Asia/Kolkata'

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })
}

/** "in 45 min", "2 h ago", "yesterday", "in 3 days". */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—'
  const diffMin = Math.round((new Date(iso).getTime() - now) / 60000)
  const abs = Math.abs(diffMin)
  const future = diffMin > 0
  let text: string
  if (abs < 1) return 'just now'
  if (abs < 60) text = `${abs} min`
  else if (abs < 60 * 24) text = `${Math.round(abs / 60)} h`
  else {
    const days = Math.round(abs / (60 * 24))
    if (days === 1) return future ? 'tomorrow' : 'yesterday'
    text = `${days} days`
  }
  return future ? `in ${text}` : `${text} ago`
}

export function isOverdue(iso: string, now = Date.now()): boolean {
  return new Date(iso).getTime() < now
}

const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

export function comparePriority(a: Priority, b: Priority): number {
  return PRIORITY_ORDER[a] - PRIORITY_ORDER[b]
}
