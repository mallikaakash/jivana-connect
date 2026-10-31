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
export const BATCH_STATUSES = ['draft', 'validated', 'scheduled', 'running', 'completed', 'stopped', 'failed'] as const

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
export type BatchStatus = (typeof BATCH_STATUSES)[number]
export type BatchMemberStatus = 'pending' | 'queued' | 'in_progress' | 'completed' | 'failed' | 'skipped'
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
  opt_out_at?: string | null
  wrong_number_at?: string | null
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
  confirmation_note?: string | null
  /** Patient asked for this slot on a call; booking row unchanged until staff rebook. */
  requested_slot?: string | null
  requested_slot_task_id?: string | null
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
  spawned_followup_task_id?: string | null
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

export type EscalationResolutionType =
  | 'called_patient'
  | 'advised_come_in'
  | 'not_clinical'
  | 'referred_elsewhere'
  | 'admin_handled'

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
  resolution_type: EscalationResolutionType | null
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

export type InboxAudience = 'clinical' | 'operations'

export interface NeedsAttentionItem {
  kind: 'overdue_task' | 'rescheduling_request' | 'patient_concern' | 'callback_request' | 'awaiting_staff_action'
  audience: InboxAudience
  task_id: string
  patient_id: string
  patient_name: string
  title: string
  reason: string
  clinical_snippet: string | null
  priority: Priority
  due_at: string
  escalation_id: string | null
  task_type: TaskType
}

export interface SystemAlert {
  severity: 'high' | 'medium' | 'low'
  kind: string
  message: string
  entity_type: 'patient' | 'appointment' | 'task' | 'call' | 'escalation' | 'system'
  entity_id: string
}

export interface DashboardSummary {
  patients_count: number
  followups_due_count: number
  calls_completed_count: number
  open_escalations_count: number
  needs_attention: NeedsAttentionItem[]
  clinical_inbox: NeedsAttentionItem[]
  operations_inbox: NeedsAttentionItem[]
  recent_calls: WithPatientName<Call>[]
  followup_queue: WithPatientName<Task>[]
  recent_activity: Event[]
  system_alerts: SystemAlert[]
}

export interface DailyConfirmationBatchPreview {
  appointment_date: string
  batch_time_ist: string
  task_ids: string[]
  recipient_count: number
  included: BatchPreviewResult['included']
  skipped: BatchPreviewResult['skipped']
  already_scheduled_today: boolean
  trial_note?: string | null
}

export interface DailyConfirmationBatchRunResult {
  ok: boolean
  trigger: string
  appointment_date: string
  scheduled_at: string
  batch: Batch
  recipient_count: number
  skipped: BatchPreviewResult['skipped']
}

export interface Meta {
  environment: 'demo' | 'clinic'
  app_mode: 'demo' | 'clinic'
  clinic_name: string | null
  staff_role_default?: 'doctor' | null
  clinical_lead_label?: string | null
  features?: { appointments: boolean }
  auth_required?: boolean
  auth_methods?: ('api_key' | 'firebase')[]
  reviewer_sign_in?: {
    title: string
    detail: string
    access_key: string
  }
  demo_seed_available?: boolean
  daily_confirmation_batch?: {
    enabled: boolean
    batch_time_ist: string
    auto_dial_enabled: boolean
    description: string
  } | null
  dial_override_active?: boolean
  auto_dial_enabled?: boolean
  data_mode: 'seeded' | 'live'
  voice_mode: 'live' | 'simulated' | 'unconfigured'
  workflows: TaskType[]
  integrations: { name: string; status: 'live' | 'simulated' | 'not_configured'; detail: string }[]
}

export interface CreatePatientInput {
  display_name: string
  phone_e164: string
  language?: 'hi' | 'en' | 'hinglish'
  contact_permitted?: boolean
  chart_number?: string
  age?: number
}

export interface CreateTaskInput {
  patient_id: string
  task_type: TaskType
  title: string
  purpose: string
  call_context: string
  due_at: string
  department?: string
  priority?: Priority
  appointment_scheduled_at?: string
  appointment_clinician?: string
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
  spawned_followup: Task | null
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
  resolution_type?: EscalationResolutionType
}

export interface CreateAppointmentInput {
  patient_id: string
  scheduled_at: string
  department?: string
  clinician?: string
  spawn_confirmation_task?: boolean
}

export interface UpdatePatientInput {
  display_name?: string
  phone_e164?: string
  language?: 'hi' | 'en' | 'hinglish'
  contact_permitted?: boolean
  chart_number?: string
  age?: number | null
}

export interface UpdateAppointmentInput {
  scheduled_at?: string
  department?: string
  clinician?: string
  booking_status?: 'scheduled' | 'cancelled' | 'completed'
}

export interface StaffCallPatch {
  action: 'staff_complete'
  outcome?: string
  summary?: string
  note?: string
  author?: string
}

export interface Batch {
  batch_id: string
  bolna_batch_id: string | null
  title: string
  status: BatchStatus
  bolna_status: string | null
  scheduled_at: string | null
  recipient_count: number
  completed_count: number
  failed_count: number
  created_at: string
  updated_at: string
}

export interface BatchMember {
  member_id: string
  batch_id: string
  task_id: string
  patient_id: string
  call_id: string | null
  execution_id: string | null
  status: BatchMemberStatus
  created_at: string
}

export interface BatchPreviewRow {
  task_id: string
  patient_id: string
  patient_name: string
  task_type: TaskType
  title: string
  contact_number: string
  variables_preview: Record<string, string>
}

export interface BatchPreviewResult {
  included: BatchPreviewRow[]
  skipped: { task_id: string; patient_name?: string; reason: string }[]
  recipient_count: number
  trial_note?: string | null
}

export interface BatchDetail {
  batch: Batch
  members: BatchMember[]
}
