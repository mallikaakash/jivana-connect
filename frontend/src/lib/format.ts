import type { BookingStatus, ConfirmationState, Priority, TaskType } from '@/api/types'

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
  awaiting_staff_action: 'red',
  rescheduling_requested: 'red',
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
  test_report_reminder: 'Test reminder',
  clinician_task_reminder: 'Clinician task reminder',
  hinglish: 'Hinglish',
  hi: 'Hindi',
  en: 'English',
  ok: 'OK',
  female: 'Female',
  male: 'Male',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
}

export function patientGenderLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return label(value)
}

/** Patient chart follow-up flag (API: ok | needs_attention | urgent). */
const ATTENTION_STATUS_LABELS: Record<string, string> = {
  ok: 'No follow-up flags',
  needs_attention: 'Follow-up required',
  urgent: 'Priority review',
}

export function attentionStatusLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return ATTENTION_STATUS_LABELS[value] ?? label(value)
}

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: 'Awaiting call',
  due: 'Due for call',
  in_progress: 'Call in progress',
  awaiting_staff_action: 'Staff action needed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'Needs review',
}

export function taskStatusLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return TASK_STATUS_LABELS[value] ?? label(value)
}

const CONFIRMATION_STATE_LABELS: Record<string, string> = {
  pending: 'Awaiting confirmation',
  confirmed: 'Confirmed on call',
  rescheduling_requested: 'Reschedule requested',
  declined: 'Declined on call',
  no_answer: 'Could not reach',
  unable_to_confirm: 'Not confirmed',
}

export function confirmationStateLabel(value: string | null | undefined): string {
  if (!value) return '—'
  return CONFIRMATION_STATE_LABELS[value] ?? label(value)
}

/** Cancelled after auto-reschedule keeps history on the calendar under a clearer label. */
export function isReplacedVisit(appt: {
  booking_status: BookingStatus
  confirmation_state: ConfirmationState
}): boolean {
  return appt.booking_status === 'cancelled' && appt.confirmation_state === 'rescheduling_requested'
}

export function bookingStatusLabel(
  booking: BookingStatus,
  confirmation?: ConfirmationState | null,
): string {
  if (booking === 'cancelled') {
    if (confirmation === 'rescheduling_requested') return 'Rescheduled'
    return 'Visit cancelled'
  }
  if (booking === 'completed') return 'Visit completed'
  return label(booking)
}

export type TaskActionVisual = 'complete' | 'staff' | 'call' | 'idle'

/** Colours the task “next action” panel on detail pages. */
export function taskActionVisual(task: { status: string; next_action: string | null | undefined }): TaskActionVisual {
  const next = (task.next_action ?? '').trim()
  if (task.status === 'completed' || /^no action needed$/i.test(next)) return 'complete'
  if (task.status === 'awaiting_staff_action' || task.status === 'failed') return 'staff'
  if (task.status === 'pending' || task.status === 'due' || task.status === 'in_progress') return 'call'
  return 'idle'
}

export const TASK_ACTION_PANEL: Record<
  TaskActionVisual,
  { sectionClass: string; labelClass: string; panelTitle: string; clinicalTitle: string }
> = {
  complete: {
    sectionClass: 'border-l-emerald-500 bg-emerald-50/50',
    labelClass: 'text-emerald-800',
    panelTitle: 'All set',
    clinicalTitle: 'Resolved',
  },
  staff: {
    sectionClass: 'border-l-red-500 bg-red-50/40',
    labelClass: 'text-red-800',
    panelTitle: 'Staff action required',
    clinicalTitle: 'Clinical action required',
  },
  call: {
    sectionClass: 'border-l-amber-500 bg-amber-50/35',
    labelClass: 'text-amber-900',
    panelTitle: 'Next action',
    clinicalTitle: 'Clinical next step',
  },
  idle: {
    sectionClass: 'border-l-slate-300 bg-white',
    labelClass: 'text-slate-600',
    panelTitle: 'Next action',
    clinicalTitle: 'Clinical next step',
  },
}

/** Plain-language call/task outcomes for clinic staff and doctors. */
const CLINIC_OUTCOME_LABELS: Record<string, string> = {
  unable_to_confirm: 'Could not confirm on call',
  concern_reported: 'Patient reported a concern',
  rescheduling_requested: 'Patient asked to reschedule',
  callback_requested: 'Patient asked for a callback',
  routine_ok: 'Routine check-in — no concerns',
  test_completion_reported: 'Test done — schedule visit',
  test_not_done: 'Test not done yet',
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
