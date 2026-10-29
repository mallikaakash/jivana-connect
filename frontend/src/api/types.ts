// Mirrors docs/CONTRACT.md exactly. Do not add status strings here that the backend does not know.

export const CALL_STATUSES = ['queued', 'initiating', 'in_progress', 'completed', 'no_answer', 'failed', 'cancelled'] as const
export const TASK_STATUSES = ['pending', 'due', 'in_progress', 'awaiting_staff_action', 'completed', 'cancelled', 'failed'] as const
export const TASK_TYPES = ['appointment_confirmation', 'test_report_reminder', 'post_procedure_checkin', 'clinician_task_reminder', 'callback_request'] as const
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export const APPOINTMENT_OUTCOMES = ['confirmed', 'rescheduling_requested', 'declined', 'no_answer', 'unable_to_confirm'] as const
export const BOOKING_STATUSES = ['scheduled', 'cancelled', 'completed'] as const
export const ESCALATION_STATUSES = ['open', 'acknowledged', 'assigned', 'resolved'] as const
export const ESCALATION_ACTIONS = ['acknowledge', 'assign', 'add_note', 'resolve'] as const
export const ATTENTION_STATUSES = ['ok', 'needs_attention', 'urgent'] as const

export type CallStatus = (typeof CALL_STATUSES)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]
export type TaskType = (typeof TASK_TYPES)[number]
export type Priority = (typeof PRIORITIES)[number]
export type AppointmentOutcome = (typeof APPOINTMENT_OUTCOMES)[number]
export type ConfirmationState = 'pending' | AppointmentOutcome
export type BookingStatus = (typeof BOOKING_STATUSES)[number]
export type EscalationStatus = (typeof ESCALATION_STATUSES)[number]
export type EscalationAction = (typeof ESCALATION_ACTIONS)[number]
export type AttentionStatus = (typeof ATTENTION_STATUSES)[number]
export type CallOutcome =
  | AppointmentOutcome
  | 'test_completion_reported'
  | 'test_not_done'
  | 'routine_ok'
  | 'concern_reported'
  | 'task_acknowledged'
  | 'callback_requested'
export type EventType =
  | 'task_created'
  | 'call_started'
  | 'call_completed'
  | 'call_no_answer'
  | 'call_failed'
  | 'outcome_extracted'
  | 'task_status_changed'
  | 'escalation_created'
  | 'escalation_updated'
  | 'staff_action_recorded'
  | 'callback_task_created'
export type Actor = 'system' | 'jiya' | 'staff' | 'bolna_webhook' | 'simulator'
export type ExtractedFields = Record<string, string | boolean | null>

export interface Patient {
  patient_id: string
  display_name: string
  demo_id: string
  age: number | null
  language: 'hi' | 'en' | 'hinglish'
  contact_ref: string
  phone_masked: string
  contact_permitted: boolean
  attention_status: AttentionStatus
  created_at: string
}

export interface PatientListItem extends Patient {
  next_appointment_at: string | null
  open_followups: number
  last_contact_at: string | null
}

export interface Appointment {
  appointment_id: string
  patient_id: string
  scheduled_at: string
  department: string
  clinician: string
  booking_status: BookingStatus
  confirmation_state: ConfirmationState
  task_id: string | null
}

export interface TestTracking {
  test_name: string
  test_completion_reported: boolean
  report_received: boolean
  clinician_reviewed: boolean
}

export interface Task {
  task_id: string
  patient_id: string
  appointment_id: string | null
  task_type: TaskType
  title: string
  purpose: string
  call_context: string
  department: string
  due_at: string
  status: TaskStatus
  priority: Priority
  attempt_count: number
  last_attempt_at: string | null
  next_action: string
  latest_outcome: CallOutcome | null
  extracted_fields: ExtractedFields | null
  test_tracking: TestTracking | null
  callback_window: string | null
  escalation_id: string | null
  call_eligible: boolean
  call_ineligible_reason: string | null
  created_at: string
  updated_at: string
}

export interface TranscriptTurn {
  role: 'agent' | 'patient'
  text: string
}

export interface Call {
  call_id: string
  task_id: string
  patient_id: string
  provider_call_id: string | null
  workflow: TaskType
  purpose: string
  status: CallStatus
  outcome: CallOutcome | null
  summary: string | null
  transcript: TranscriptTurn[] | null
  transcript_is_example: boolean
  extracted_fields: ExtractedFields | null
  processing_result: string | null
  is_live: boolean
  escalation_id: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface EscalationNote {
  note_id: string
  text: string
  author: string
  created_at: string
}

export interface Escalation {
  escalation_id: string
  patient_id: string
  call_id: string | null
  task_id: string | null
  reason: string
  concern_summary: string
  priority: Priority
  status: EscalationStatus
  routing_destination: string
  assigned_to: string | null
  notes: EscalationNote[]
  created_at: string
  updated_at: string
}

export interface Event {
  event_id: string
  entity_type: 'patient' | 'appointment' | 'task' | 'call' | 'escalation'
  entity_id: string
  patient_id: string | null
  event_type: EventType
  message: string
  actor: Actor
  timestamp: string
}

export type WithPatientName<T> = T & { patient_name: string }

export interface NeedsAttentionItem {
  kind: 'overdue_task' | 'rescheduling_request' | 'patient_concern' | 'callback_request' | 'awaiting_staff_action'
  task_id: string
  patient_id: string
  patient_name: string
  title: string
  reason: string
  priority: Priority
  due_at: string
  escalation_id: string | null
}

export interface DashboardSummary {
  patients_count: number
  followups_due_count: number
  calls_completed_count: number
  open_escalations_count: number
  needs_attention: NeedsAttentionItem[]
  recent_calls: WithPatientName<Call>[]
  followup_queue: WithPatientName<Task>[]
  recent_activity: Event[]
}

export interface Meta {
  environment: 'demo'
  data_mode: 'seeded'
  voice_mode: 'live' | 'simulated'
  workflows: TaskType[]
  integrations: { name: string; status: 'live' | 'simulated' | 'not_configured'; detail: string }[]
}

export interface PatientDetail {
  patient: Patient
  appointments: Appointment[]
  tasks: Task[]
  calls: Call[]
  escalations: Escalation[]
  events: Event[]
}

export interface TaskDetail {
  task: Task
  patient: Patient
  appointment: Appointment | null
  calls: Call[]
  events: Event[]
}

export interface CallDetail {
  call: Call
  patient: Patient
  task: Task
  escalation: Escalation | null
}

export interface EscalationDetail {
  escalation: Escalation
  patient: Patient
  call: Call | null
  task: Task | null
  events: Event[]
}

export interface ListResponse<T> {
  items: T[]
}

export interface TaskFilters {
  status?: TaskStatus
  task_type?: TaskType
  priority?: Priority
  patient_id?: string
  due?: 'overdue' | 'today' | 'upcoming'
}

export interface EscalationPatch {
  action: EscalationAction
  assigned_to?: string
  note?: string
  author?: string
}
