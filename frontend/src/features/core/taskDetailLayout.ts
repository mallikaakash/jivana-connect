import type { Appointment, Call, Event, Task } from '@/api/types'
import { formatDateTime, label } from '@/lib/format'

const HEADING_BY_TYPE: Partial<Record<Task['task_type'], string>> = {
  appointment_confirmation: 'Confirm appointment',
  test_report_reminder: 'Test reminder',
  post_procedure_checkin: 'Post-visit check-in',
  clinician_task_reminder: 'Clinician reminder',
  callback_request: 'Patient callback',
}

/** Page title — avoid repeating visit datetime when the sidebar shows the appointment. */
export function taskPageHeading(
  task: Task,
  appointment: Appointment | null | undefined,
): { title: string; subtitle: string | null } {
  const short = HEADING_BY_TYPE[task.task_type]
  if (short && appointment && task.task_type === 'appointment_confirmation') {
    return {
      title: short,
      subtitle: `${formatDateTime(appointment.scheduled_at)} · ${appointment.department} · ${appointment.clinician}`,
    }
  }
  if (short && task.task_type !== 'appointment_confirmation') {
    return { title: short, subtitle: task.title !== short ? task.title : null }
  }
  return { title: task.title, subtitle: null }
}

/** Due chip duplicates batch confirmation copy in next_action — hide there. */
export function showDueChipInHeader(task: Task): boolean {
  if (task.task_type === 'appointment_confirmation' && /automatic confirmation call/i.test(task.next_action ?? '')) {
    return false
  }
  return task.status === 'pending' || task.status === 'due' || task.status === 'in_progress'
}

export function showLatestResultSection(task: Task, calls: Call[]): boolean {
  return Boolean(
    task.latest_outcome ||
      (task.extracted_fields && Object.keys(task.extracted_fields).length > 0) ||
      calls.some((c) => c.status === 'completed'),
  )
}

export function showCallsListSection(calls: Call[], callRunning: boolean): boolean {
  return calls.length > 0 || callRunning
}

export function showJiyaScript(task: Task, isDoctorClinic: boolean): boolean {
  return !isDoctorClinic && Boolean(task.call_context?.trim())
}

export function jiyaScriptSummary(task: Task): string {
  return task.call_context?.trim() || task.purpose
}

export function showPriorityBadge(task: Task): boolean {
  return task.priority !== 'normal' && task.priority !== 'low'
}

export function taskTypeChip(task: Task): string {
  return label(task.task_type)
}

/** Clinic tasks often default department to the product name — hide that on detail headers. */
export function showTaskDepartment(task: Task, isClinic: boolean): boolean {
  const d = task.department?.trim()
  if (!d) return false
  if (!isClinic) return true
  const lower = d.toLowerCase()
  return lower !== 'jivana connect' && lower !== 'clinic'
}

/** Hide “confirmation queued” style noise until something meaningful happened. */
export function showRecentActivity(events: Event[], calls: Call[], task: Task): boolean {
  if (calls.length > 0) return true
  if (task.status !== 'pending' && task.status !== 'due') return true
  return events.some((e) =>
    ['call_completed', 'call_started', 'outcome_extracted', 'escalation_created', 'task_status_changed'].includes(e.event_type),
  )
}
