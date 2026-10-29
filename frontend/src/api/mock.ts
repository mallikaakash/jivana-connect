// In-browser implementation of JivanaApi (VITE_API_MODE=mock). Seeded from shared/seed.json and
// mirrors the backend semantics in docs/CONTRACT.md so the dashboard runs as a static site.
// State lives in module memory and is mirrored to sessionStorage (best effort).
import seedJson from '@shared/seed.json'
import { label } from '@/lib/format'
import { ApiError } from './http'
import type { JivanaApi } from './index'
import {
  TASK_TYPES,
  type Appointment,
  type AppointmentOutcome,
  type AttentionStatus,
  type Call,
  type CallOutcome,
  type CallStatus,
  type DashboardSummary,
  type Escalation,
  type Event,
  type EventType,
  type ExtractedFields,
  type NeedsAttentionItem,
  type Patient,
  type PatientListItem,
  type Priority,
  type Task,
  type TaskFilters,
  type TaskStatus,
  type TaskType,
  type TranscriptTurn,
  type WithPatientName,
} from './types'

// ---------------------------------------------------------------------------------------------
// Internal record shapes (derived fields are computed on read; demo_* fields never leave here)

type PatientRec = Omit<Patient, 'attention_status'>
type TaskRec = Omit<Task, 'call_eligible' | 'call_ineligible_reason'> & {
  demo_outcome?: CallOutcome | null
  demo_extracted_fields?: ExtractedFields | null
}

interface State {
  patients: PatientRec[]
  appointments: Appointment[]
  tasks: TaskRec[]
  calls: Call[]
  escalations: Escalation[]
  events: Event[]
  seq: number
}

// ---------------------------------------------------------------------------------------------
// Time helpers (IST, +05:30)

const IST_OFFSET_MS = 330 * 60_000
const MIN = 60_000
const DAY = 24 * 60 * MIN

/** Epoch ms → "YYYY-MM-DDTHH:MM:SS+05:30". */
function toIst(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 19) + '+05:30'
}

/** Epoch ms of 00:00 IST on (today + addDays). */
function istDayStart(now: number, addDays = 0): number {
  const d = new Date(now + IST_OFFSET_MS)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + addDays) - IST_OFFSET_MS
}

function resolveRel(value: string, now: number): string {
  let m = /^rel:([+-]?\d+)d@(\d{1,2}):(\d{2})$/.exec(value)
  if (m) return toIst(istDayStart(now, Number(m[1])) + (Number(m[2]) * 60 + Number(m[3])) * MIN)
  m = /^rel:([+-]?\d+)m$/.exec(value)
  if (m) return toIst(now + Number(m[1]) * MIN)
  return value
}

function resolveDeep<T>(value: T, now: number): T {
  if (typeof value === 'string') return (value.startsWith('rel:') ? resolveRel(value, now) : value) as T
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, now)) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDeep(v, now)])) as T
  }
  return value
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

// ---------------------------------------------------------------------------------------------
// State + persistence

const STORAGE_KEY = 'jivana-connect-mock-state-v1'

function freshState(): State {
  const now = Date.now()
  const raw = resolveDeep(seedJson as unknown as Omit<State, 'seq'> & { _note?: string }, now)
  // Seed has no task_created events; add them so every task has a starting point in its history.
  const created: Event[] = raw.tasks
    .filter((t) => !raw.events.some((e) => e.entity_id === t.task_id && e.event_type === 'callback_task_created'))
    .map((t, i) => ({
      event_id: `evt_seed_created_${String(i + 1).padStart(3, '0')}`,
      entity_type: 'task' as const,
      entity_id: t.task_id,
      patient_id: t.patient_id,
      event_type: 'task_created' as const,
      message: `Task created — ${t.title}`,
      actor: 'system' as const,
      timestamp: t.created_at,
    }))
  raw.events = [...created, ...raw.events]
  return {
    patients: raw.patients,
    appointments: raw.appointments,
    tasks: raw.tasks,
    calls: raw.calls,
    escalations: raw.escalations,
    events: raw.events,
    seq: 0,
  }
}

function loadState(): State {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as State
      if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.calls)) return parsed
    }
  } catch {
    // storage unavailable or corrupt — fall back to the seed
  }
  return freshState()
}

let state: State = loadState()

function save() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // best effort only
  }
}

function nextId(prefix: string): string {
  state.seq += 1
  return `${prefix}_${String(state.seq).padStart(3, '0')}`
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function latency<T>(fn: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(
      () => {
        try {
          advanceSimulatedCalls()
          resolve(clone(fn()))
        } catch (e) {
          reject(e)
        }
      },
      150 + Math.random() * 150,
    )
  })
}

function notFound(what: string, id: string): never {
  throw new ApiError(404, 'not_found', `${what} ${id} was not found.`, false)
}

function addEvent(
  entity_type: Event['entity_type'],
  entity_id: string,
  patient_id: string | null,
  event_type: EventType,
  message: string,
  actor: Event['actor'],
  timestamp: string,
) {
  state.events.push({ event_id: nextId('evt_sim'), entity_type, entity_id, patient_id, event_type, message, actor, timestamp })
}

// ---------------------------------------------------------------------------------------------
// Lookups + derived fields

const ACTIVE_CALL: CallStatus[] = ['queued', 'initiating', 'in_progress']
const TERMINAL_TASK: TaskStatus[] = ['completed', 'cancelled', 'failed']
const MAX_ATTEMPTS = 3

const patientById = (id: string) => state.patients.find((p) => p.patient_id === id)
const taskById = (id: string) => state.tasks.find((t) => t.task_id === id)
const apptById = (id: string | null) => (id ? state.appointments.find((a) => a.appointment_id === id) : undefined)
const escById = (id: string | null) => (id ? state.escalations.find((e) => e.escalation_id === id) : undefined)
const patientName = (id: string) => patientById(id)?.display_name ?? 'Unknown patient'

function isOverdue(t: TaskRec, now = Date.now()) {
  return (t.status === 'pending' || t.status === 'due') && ms(t.due_at) < now
}

function attentionFor(patientId: string): AttentionStatus {
  const escalations = state.escalations.filter((e) => e.patient_id === patientId && e.status !== 'resolved')
  const tasks = state.tasks.filter((t) => t.patient_id === patientId && !TERMINAL_TASK.includes(t.status))
  if (escalations.some((e) => e.priority === 'high' || e.priority === 'urgent') || tasks.some((t) => t.priority === 'urgent')) return 'urgent'
  if (
    escalations.length > 0 ||
    tasks.some((t) => t.status === 'awaiting_staff_action' || isOverdue(t) || t.task_type === 'callback_request')
  )
    return 'needs_attention'
  return 'ok'
}

function toPatient(p: PatientRec): Patient {
  return { ...p, attention_status: attentionFor(p.patient_id) }
}

function eligibility(t: TaskRec): { call_eligible: boolean; call_ineligible_reason: string | null } {
  const no = (reason: string) => ({ call_eligible: false, call_ineligible_reason: reason })
  if (state.calls.some((c) => c.task_id === t.task_id && ACTIVE_CALL.includes(c.status))) return no('A Jiya call for this task is already in progress.')
  if (t.status === 'completed') return no('This task is already completed.')
  if (t.status === 'awaiting_staff_action') return no('This task is waiting for a staff member to act; no call is needed right now.')
  if (t.status === 'in_progress') return no('A Jiya call for this task is already in progress.')
  if (t.status === 'cancelled') return no('This task has been cancelled.')
  if (t.status === 'failed') return no('This task has failed and needs staff review.')
  if (!patientById(t.patient_id)?.contact_permitted) return no('The patient has not given consent to be called. Record consent before starting a call.')
  if (t.attempt_count >= MAX_ATTEMPTS) return no(`Maximum of ${MAX_ATTEMPTS} call attempts reached. Contact the patient manually.`)
  return { call_eligible: true, call_ineligible_reason: null }
}

function toTask(t: TaskRec): Task {
  const { demo_outcome: _o, demo_extracted_fields: _f, ...rest } = t
  return { ...rest, ...eligibility(t) }
}

const withName = <T extends { patient_id: string }>(r: T): WithPatientName<T> => ({ ...r, patient_name: patientName(r.patient_id) })

const byDesc = <T>(key: (r: T) => string | null) => (a: T, b: T) => (ms(key(b)) || 0) - (ms(key(a)) || 0)
const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

// ---------------------------------------------------------------------------------------------
// Simulated voice mode: calls progress initiating → in_progress (~2s) → completed (~8s).
// Progress is computed lazily from created_at on every API access (robust to reloads), and
// timers nudge it along so sessionStorage stays current.

const IN_PROGRESS_AFTER_MS = 2_000
const COMPLETE_AFTER_MS = 8_000

function advanceSimulatedCalls() {
  const now = Date.now()
  let changed = false
  for (const call of state.calls) {
    if (call.is_live || !ACTIVE_CALL.includes(call.status)) continue
    const created = ms(call.created_at)
    if (now - created >= COMPLETE_AFTER_MS) {
      if (call.status !== 'in_progress') call.started_at = toIst(created + IN_PROGRESS_AFTER_MS)
      completeSimulatedCall(call, created + COMPLETE_AFTER_MS)
      changed = true
    } else if (now - created >= IN_PROGRESS_AFTER_MS && call.status !== 'in_progress') {
      call.status = 'in_progress'
      call.started_at = toIst(created + IN_PROGRESS_AFTER_MS)
      changed = true
    }
  }
  if (changed) save()
}

function defaultOutcome(type: TaskType): CallOutcome {
  switch (type) {
    case 'test_report_reminder':
      return 'test_completion_reported'
    case 'post_procedure_checkin':
      return 'routine_ok'
    case 'clinician_task_reminder':
    case 'callback_request':
      return 'task_acknowledged'
    default:
      return 'confirmed'
  }
}

function defaultFields(t: TaskRec, outcome: CallOutcome): ExtractedFields {
  const base = { callback_requested: false, callback_window: null }
  switch (t.task_type) {
    case 'appointment_confirmation':
      return { appointment_outcome: outcome, preferred_reschedule_window: null, patient_note: null, ...base }
    case 'test_report_reminder':
      return { test_completed: outcome === 'test_completion_reported', test_date: null, patient_note: null, ...base }
    case 'post_procedure_checkin':
      return { checkin_result: outcome, concern_summary: null, ...base }
    default:
      return { task_acknowledged: outcome === 'task_acknowledged', patient_note: null, ...base }
  }
}

const APPOINTMENT_OUTCOMES: AppointmentOutcome[] = ['confirmed', 'rescheduling_requested', 'declined', 'no_answer', 'unable_to_confirm']
const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
const lcFirst = (v: string) => v.charAt(0).toLowerCase() + v.slice(1)

function exampleTranscript(t: TaskRec, p: PatientRec | undefined, appt: Appointment | undefined, outcome: CallOutcome, f: ExtractedFields): TranscriptTurn[] {
  const name = p?.display_name ?? 'the patient'
  const turns: TranscriptTurn[] = [
    { role: 'agent', text: `Hello, this is Jiya calling from Jivana clinic. Am I speaking with ${name}?` },
    { role: 'patient', text: 'Yes, speaking.' },
  ]
  const note = str(f.patient_note)
  if (t.task_type === 'appointment_confirmation') {
    const when = appt
      ? new Date(appt.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', hour: 'numeric', minute: '2-digit' })
      : 'the scheduled time'
    turns.push({ role: 'agent', text: `You have a ${t.department.toLowerCase()} appointment${appt ? ` with ${appt.clinician}` : ''} on ${when}. Will you be able to attend?` })
    if (outcome === 'confirmed') {
      turns.push({ role: 'patient', text: "Yes, I'll be there." }, { role: 'agent', text: 'Thank you, I have noted your confirmation.' })
    } else if (outcome === 'rescheduling_requested') {
      const pref = str(f.preferred_reschedule_window)
      turns.push(
        { role: 'patient', text: `I can't make it${note ? ` — ${lcFirst(note)}` : ''}. Can we move it${pref ? ` to ${lcFirst(pref)}` : ''}?` },
        { role: 'agent', text: "I've noted that you'd like to reschedule. The clinic team will call you to offer a new slot — I haven't changed your booking." },
      )
    } else if (outcome === 'declined') {
      turns.push({ role: 'patient', text: "No, I won't be coming." }, { role: 'agent', text: 'Understood. I will let the clinic team know.' })
    } else {
      turns.push({ role: 'patient', text: "I'm not sure yet." }, { role: 'agent', text: 'No problem, the clinic team will follow up with you.' })
    }
  } else if (t.task_type === 'test_report_reminder') {
    const test = t.test_tracking?.test_name ?? 'test'
    turns.push({ role: 'agent', text: `I'm calling about the ${test} test your doctor asked for. Have you been able to get it done?` })
    if (outcome === 'test_completion_reported') {
      turns.push(
        { role: 'patient', text: `Yes, I did it${str(f.test_date) ? ` ${lcFirst(String(f.test_date))}` : ''}.` },
        { role: 'agent', text: "Thank you, I've noted that. The clinic team will check for the report." },
      )
    } else {
      turns.push({ role: 'patient', text: 'Not yet.' }, { role: 'agent', text: 'Thank you. Please try to get it done before your visit.' })
    }
  } else if (t.task_type === 'post_procedure_checkin') {
    turns.push({ role: 'agent', text: 'This is a routine check-in. How are you feeling, and do you have any concerns?' })
    if (outcome === 'concern_reported') {
      turns.push(
        { role: 'patient', text: str(f.concern_summary) ?? 'I have a concern I wanted to mention.' },
        { role: 'agent', text: "Thank you for telling me. I can't give medical advice, but I'm passing this to the care team now and they will call you." },
      )
    } else {
      turns.push({ role: 'patient', text: "I'm doing fine, no concerns." }, { role: 'agent', text: 'Glad to hear that. Take care.' })
    }
  } else {
    turns.push(
      { role: 'agent', text: `A quick reminder from the clinic: ${t.purpose}` },
      { role: 'patient', text: note ? `Okay. ${note}.` : 'Okay, will do.' },
      { role: 'agent', text: 'Thank you, I have noted that.' },
    )
  }
  return turns
}

function completeSimulatedCall(call: Call, atMs: number) {
  const t = taskById(call.task_id)
  if (!t) {
    call.status = 'failed'
    call.completed_at = toIst(atMs)
    return
  }
  const p = patientById(t.patient_id)
  const appt = apptById(t.appointment_id)
  const ts = toIst(atMs)
  const outcome: CallOutcome = t.demo_outcome ?? defaultOutcome(t.task_type)
  const fields: ExtractedFields = { ...(t.demo_extracted_fields ?? defaultFields(t, outcome)) }
  const prevStatus = t.status
  call.completed_at = ts
  t.updated_at = ts

  if (outcome === 'no_answer') {
    call.status = 'no_answer'
    call.outcome = null
    t.latest_outcome = 'no_answer'
    if (appt) appt.confirmation_state = 'no_answer'
    if (t.attempt_count < MAX_ATTEMPTS) {
      t.status = 'due'
      t.next_action = 'Retry call'
      call.processing_result = `No answer. Attempt ${t.attempt_count} of ${MAX_ATTEMPTS} recorded; task due for retry.`
    } else {
      t.status = 'awaiting_staff_action'
      t.next_action = 'Contact patient manually — 3 call attempts unanswered'
      call.processing_result = `No answer. Attempt ${t.attempt_count} of ${MAX_ATTEMPTS}; task moved to awaiting_staff_action.`
    }
    addEvent('call', call.call_id, t.patient_id, 'call_no_answer', `No answer — attempt ${t.attempt_count} of ${MAX_ATTEMPTS}`, 'simulator', ts)
  } else {
    call.status = 'completed'
    call.outcome = outcome
    call.extracted_fields = fields
    call.transcript = exampleTranscript(t, p, appt, outcome, fields)
    call.transcript_is_example = true
    t.latest_outcome = outcome
    t.extracted_fields = fields
    let outcomeMsg = label(outcome)
    const dept = t.department.toLowerCase()

    if ((APPOINTMENT_OUTCOMES as string[]).includes(outcome)) {
      if (appt) appt.confirmation_state = outcome as AppointmentOutcome // booking_status / scheduled_at never change
      if (outcome === 'confirmed') {
        t.status = 'completed'
        t.next_action = 'No action needed'
        call.summary = `Patient confirmed they will attend the ${dept} appointment.`
        call.processing_result = 'Outcome validated. Task completed. Appointment confirmation recorded; booking unchanged.'
      } else if (outcome === 'rescheduling_requested') {
        const pref = str(fields.preferred_reschedule_window)
        t.status = 'awaiting_staff_action'
        t.next_action = pref ? `Call patient to offer a new slot (prefers ${lcFirst(pref)})` : 'Call patient to offer a new slot'
        call.summary = `Patient cannot attend the scheduled ${dept} appointment${str(fields.patient_note) ? ` (${lcFirst(String(fields.patient_note))})` : ''} and asked to reschedule${pref ? ` — prefers ${lcFirst(pref)}` : ''}. No new slot was booked.`
        call.processing_result = 'Outcome validated. Task moved to awaiting_staff_action. Appointment booking unchanged until staff rebook.'
        if (pref) outcomeMsg = `Rescheduling requested — prefers ${lcFirst(pref)}`
      } else if (outcome === 'declined') {
        t.status = 'awaiting_staff_action'
        t.next_action = 'Review cancellation with patient'
        call.summary = `Patient said they will not attend the ${dept} appointment.`
        call.processing_result = 'Outcome validated. Task moved to awaiting_staff_action. Booking unchanged until staff cancel it in the booking system.'
      } else {
        t.status = 'awaiting_staff_action'
        t.next_action = 'Call patient to confirm attendance'
        call.summary = 'Patient could not confirm attendance during the call.'
        call.processing_result = 'Outcome validated. Task moved to awaiting_staff_action. Appointment unchanged.'
      }
    } else if (outcome === 'test_completion_reported') {
      const test = t.test_tracking?.test_name ?? 'test'
      if (t.test_tracking) t.test_tracking.test_completion_reported = true // report_received / clinician_reviewed untouched
      t.status = 'awaiting_staff_action'
      t.next_action = `Check lab for ${test} report`
      call.summary = `Patient says the ${test} test has been done${str(fields.test_date) ? ` (${lcFirst(String(fields.test_date))})` : ''}. The clinic has not yet received the report.`
      call.processing_result = 'Test completion reported by patient. Report not yet received; clinician review pending. Task moved to awaiting_staff_action.'
      outcomeMsg = `Patient reports ${test} test done`
    } else if (outcome === 'test_not_done') {
      const test = t.test_tracking?.test_name ?? 'test'
      t.status = 'pending'
      t.next_action = 'Remind again in 2 days'
      t.due_at = toIst(atMs + 2 * DAY)
      call.summary = `Patient has not yet done the ${test} test.`
      call.processing_result = 'Outcome validated. Task back to pending; reminder rescheduled in 2 days.'
    } else if (outcome === 'routine_ok') {
      t.status = 'completed'
      t.next_action = 'No action needed'
      call.summary = 'Patient reported no concerns during the routine check-in.'
      call.processing_result = 'Outcome validated. Routine check-in recorded. Task completed.'
    } else if (outcome === 'concern_reported') {
      const concern = str(fields.concern_summary) ?? 'Patient reported a concern during the check-in.'
      const esc: Escalation = {
        escalation_id: nextId('esc_sim'),
        patient_id: t.patient_id,
        call_id: call.call_id,
        task_id: t.task_id,
        reason: 'Patient-reported concern after procedure',
        concern_summary: concern,
        priority: 'high',
        status: 'open',
        routing_destination: `${t.department} nurse desk`,
        assigned_to: null,
        notes: [],
        created_at: ts,
        updated_at: ts,
      }
      state.escalations.push(esc)
      call.escalation_id = esc.escalation_id
      t.escalation_id = esc.escalation_id
      t.status = 'awaiting_staff_action'
      t.next_action = 'Review escalated concern'
      call.summary = `${concern} Jiya did not give advice and told the patient the care team will call back. Escalation created.`
      call.processing_result = `Concern matched approved escalation rule. Escalation ${esc.escalation_id} created and routed to ${esc.routing_destination}.`
      addEvent('escalation', esc.escalation_id, t.patient_id, 'escalation_created', `Escalation created — routed to ${esc.routing_destination}`, 'system', ts)
    } else {
      // task_acknowledged / callback_requested
      t.status = 'completed'
      t.next_action = 'No action needed'
      call.summary = `Patient acknowledged the reminder${str(fields.patient_note) ? `: ${lcFirst(String(fields.patient_note))}` : ''}.`
      call.processing_result = 'Outcome validated. Reminder acknowledged. Task completed.'
    }

    addEvent('call', call.call_id, t.patient_id, 'call_completed', `Call completed — ${label(outcome).toLowerCase()}`, 'simulator', ts)
    addEvent('task', t.task_id, t.patient_id, 'outcome_extracted', outcomeMsg, 'system', ts)

    if (fields.callback_requested === true) {
      const window = str(fields.callback_window)
      const cb: TaskRec = {
        task_id: nextId('task_sim'),
        patient_id: t.patient_id,
        appointment_id: null,
        task_type: 'callback_request',
        title: 'Patient callback request',
        purpose: `Patient asked the clinic to call back${window ? ` (${window})` : ''}.`,
        call_context: 'Patient requested a callback. Scheduler should call in the requested window.',
        department: t.department,
        due_at: toIst(atMs + DAY),
        status: 'pending',
        priority: 'normal',
        attempt_count: 0,
        last_attempt_at: null,
        next_action: window ? `Scheduler to call back ${window}` : 'Scheduler to call back',
        latest_outcome: null,
        extracted_fields: null,
        test_tracking: null,
        callback_window: window,
        escalation_id: null,
        created_at: ts,
        updated_at: ts,
      }
      state.tasks.push(cb)
      addEvent('task', cb.task_id, t.patient_id, 'callback_task_created', `Callback requested${window ? ` for ${window}` : ''}`, 'system', ts)
    }
  }

  if (prevStatus !== t.status) addEvent('task', t.task_id, t.patient_id, 'task_status_changed', `Task moved to ${label(t.status)}`, 'system', ts)
}

// ---------------------------------------------------------------------------------------------
// Query helpers

function matchesDue(t: TaskRec, due: TaskFilters['due'], now: number): boolean {
  if (!due) return true
  const d = ms(t.due_at)
  const endOfToday = istDayStart(now, 1)
  if (due === 'overdue') return isOverdue(t, now)
  if (due === 'today') return d >= istDayStart(now) && d < endOfToday
  return d >= endOfToday
}

function needsAttention(now: number): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = []
  for (const t of state.tasks) {
    if (TERMINAL_TASK.includes(t.status)) continue
    const esc = escById(t.escalation_id)
    let kind: NeedsAttentionItem['kind'] | null = null
    let reason = ''
    let priority = t.priority
    if (esc && esc.status !== 'resolved') {
      kind = 'patient_concern'
      reason = esc.concern_summary
      if (PRIORITY_RANK[esc.priority] < PRIORITY_RANK[priority]) priority = esc.priority
    } else if (t.status === 'awaiting_staff_action' && t.latest_outcome === 'rescheduling_requested') {
      kind = 'rescheduling_request'
      reason = t.next_action
    } else if (t.task_type === 'callback_request') {
      kind = 'callback_request'
      reason = t.callback_window ? `Callback window: ${t.callback_window}` : t.next_action
    } else if (isOverdue(t, now)) {
      kind = 'overdue_task'
      reason = `Overdue — ${t.next_action}`
    } else if (t.status === 'awaiting_staff_action') {
      kind = 'awaiting_staff_action'
      reason = t.next_action
    }
    if (!kind) continue
    items.push({
      kind,
      task_id: t.task_id,
      patient_id: t.patient_id,
      patient_name: patientName(t.patient_id),
      title: t.title,
      reason,
      priority,
      due_at: t.due_at,
      escalation_id: esc && esc.status !== 'resolved' ? esc.escalation_id : null,
    })
  }
  return items.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || ms(a.due_at) - ms(b.due_at))
}

/** Newest first; events sharing a timestamp keep reverse insertion order (latest effect on top). */
function newestFirst(events: Event[]): Event[] {
  return [...events].reverse().sort(byDesc((e) => e.timestamp))
}

function eventsFor(ids: Set<string>): Event[] {
  return newestFirst(state.events.filter((e) => ids.has(e.entity_id)))
}

// ---------------------------------------------------------------------------------------------
// API

export const mockApi: JivanaApi = {
  getMeta: () =>
    latency(() => ({
      environment: 'demo' as const,
      data_mode: 'seeded' as const,
      voice_mode: 'simulated' as const,
      workflows: [...TASK_TYPES],
      integrations: [
        { name: 'Bolna voice agent (Jiya)', status: 'simulated' as const, detail: 'Offline mock: calls are simulated in the browser and follow the scripted demo outcome.' },
        { name: 'FastAPI backend', status: 'not_configured' as const, detail: 'Static build: an in-browser mock implements the same API contract.' },
        { name: 'MongoDB', status: 'not_configured' as const, detail: 'Demo state is kept in browser session memory and resets on demand.' },
      ],
    })),

  getDashboardSummary: () =>
    latency((): DashboardSummary => {
      const now = Date.now()
      const endOfToday = istDayStart(now, 1)
      return {
        patients_count: state.patients.length,
        followups_due_count: state.tasks.filter((t) => (t.status === 'pending' || t.status === 'due') && ms(t.due_at) < endOfToday).length,
        calls_completed_count: state.calls.filter((c) => c.status === 'completed' && ms(c.completed_at ?? c.created_at) >= now - 7 * DAY).length,
        open_escalations_count: state.escalations.filter((e) => e.status !== 'resolved').length,
        needs_attention: needsAttention(now),
        recent_calls: [...state.calls].sort(byDesc((c) => c.created_at)).slice(0, 6).map(withName),
        followup_queue: state.tasks
          .filter((t) => t.status === 'pending' || t.status === 'due' || t.status === 'in_progress')
          .sort((a, b) => ms(a.due_at) - ms(b.due_at))
          .slice(0, 6)
          .map((t) => withName(toTask(t))),
        recent_activity: newestFirst(state.events).slice(0, 10),
      }
    }),

  listPatients: (params) =>
    latency(() => {
      const now = Date.now()
      const q = params?.q?.trim().toLowerCase()
      const items: PatientListItem[] = state.patients
        .map((p) => {
          const upcoming = state.appointments
            .filter((a) => a.patient_id === p.patient_id && a.booking_status === 'scheduled' && ms(a.scheduled_at) >= now)
            .sort((a, b) => ms(a.scheduled_at) - ms(b.scheduled_at))
          const lastCall = state.calls.filter((c) => c.patient_id === p.patient_id && c.started_at).sort(byDesc((c) => c.started_at))[0]
          return {
            ...toPatient(p),
            next_appointment_at: upcoming[0]?.scheduled_at ?? null,
            open_followups: state.tasks.filter((t) => t.patient_id === p.patient_id && !TERMINAL_TASK.includes(t.status)).length,
            last_contact_at: lastCall?.started_at ?? null,
          }
        })
        .filter((p) => !q || p.display_name.toLowerCase().includes(q) || p.demo_id.toLowerCase().includes(q) || p.patient_id.includes(q))
        .filter((p) => !params?.attention_status || p.attention_status === params.attention_status)
      return { items }
    }),

  getPatient: (patientId) =>
    latency(() => {
      const p = patientById(patientId) ?? notFound('Patient', patientId)
      return {
        patient: toPatient(p),
        appointments: state.appointments.filter((a) => a.patient_id === patientId).sort((a, b) => ms(a.scheduled_at) - ms(b.scheduled_at)),
        tasks: state.tasks.filter((t) => t.patient_id === patientId).sort((a, b) => ms(a.due_at) - ms(b.due_at)).map(toTask),
        calls: state.calls.filter((c) => c.patient_id === patientId).sort(byDesc((c) => c.created_at)),
        escalations: state.escalations.filter((e) => e.patient_id === patientId).sort(byDesc((e) => e.created_at)),
        events: newestFirst(state.events.filter((e) => e.patient_id === patientId)),
      }
    }),

  listAppointments: () =>
    latency(() => ({ items: [...state.appointments].sort((a, b) => ms(a.scheduled_at) - ms(b.scheduled_at)).map(withName) })),

  listTasks: (filters) =>
    latency(() => {
      const now = Date.now()
      const f = filters ?? {}
      const items = state.tasks
        .filter(
          (t) =>
            (!f.status || t.status === f.status) &&
            (!f.task_type || t.task_type === f.task_type) &&
            (!f.priority || t.priority === f.priority) &&
            (!f.patient_id || t.patient_id === f.patient_id) &&
            matchesDue(t, f.due, now),
        )
        .sort((a, b) => ms(a.due_at) - ms(b.due_at))
        .map((t) => withName(toTask(t)))
      return { items }
    }),

  getTask: (taskId) =>
    latency(() => {
      const t = taskById(taskId) ?? notFound('Task', taskId)
      const calls = state.calls.filter((c) => c.task_id === taskId).sort(byDesc((c) => c.created_at))
      const ids = new Set<string>([taskId, ...calls.map((c) => c.call_id)])
      if (t.escalation_id) ids.add(t.escalation_id)
      return {
        task: toTask(t),
        patient: toPatient(patientById(t.patient_id) ?? notFound('Patient', t.patient_id)),
        appointment: apptById(t.appointment_id) ?? null,
        calls,
        events: eventsFor(ids),
      }
    }),

  startCall: (taskId) =>
    latency(() => {
      const t = taskById(taskId) ?? notFound('Task', taskId)
      const elig = eligibility(t)
      if (!elig.call_eligible) throw new ApiError(409, 'call_not_eligible', elig.call_ineligible_reason ?? 'This task is not eligible for a call.', false)
      const nowMs = Date.now()
      const now = toIst(nowMs)
      const call: Call = {
        call_id: nextId('call_sim'),
        task_id: t.task_id,
        patient_id: t.patient_id,
        provider_call_id: null,
        workflow: t.task_type,
        purpose: t.title,
        status: 'initiating',
        outcome: null,
        summary: null,
        transcript: null,
        transcript_is_example: false,
        extracted_fields: null,
        processing_result: null,
        is_live: false,
        escalation_id: null,
        started_at: null,
        completed_at: null,
        created_at: now,
      }
      state.calls.push(call)
      const prev = t.status
      t.status = 'in_progress'
      t.attempt_count += 1
      t.last_attempt_at = now
      t.updated_at = now
      addEvent('call', call.call_id, t.patient_id, 'call_started', `Jiya call started (simulated) — attempt ${t.attempt_count} of ${MAX_ATTEMPTS}`, 'staff', now)
      if (prev !== t.status) addEvent('task', t.task_id, t.patient_id, 'task_status_changed', `Task moved to ${label(t.status)}`, 'system', now)
      save()
      setTimeout(advanceSimulatedCalls, IN_PROGRESS_AFTER_MS + 50)
      setTimeout(advanceSimulatedCalls, COMPLETE_AFTER_MS + 50)
      return { call, task: toTask(t) }
    }),

  listCalls: (params) =>
    latency(() => ({
      items: state.calls
        .filter((c) => (!params?.status || c.status === params.status) && (!params?.task_id || c.task_id === params.task_id))
        .sort(byDesc((c) => c.created_at))
        .map(withName),
    })),

  getCall: (callId) =>
    latency(() => {
      const c = state.calls.find((x) => x.call_id === callId) ?? notFound('Call', callId)
      const t = taskById(c.task_id) ?? notFound('Task', c.task_id)
      return {
        call: c,
        patient: toPatient(patientById(c.patient_id) ?? notFound('Patient', c.patient_id)),
        task: toTask(t),
        escalation: escById(c.escalation_id) ?? null,
      }
    }),

  listEscalations: (params) =>
    latency(() => ({
      items: state.escalations
        .filter((e) => !params?.status || e.status === params.status)
        .sort(
          (a, b) =>
            Number(a.status === 'resolved') - Number(b.status === 'resolved') ||
            PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
            ms(b.created_at) - ms(a.created_at),
        )
        .map(withName),
    })),

  getEscalation: (escalationId) =>
    latency(() => {
      const e = escById(escalationId) ?? notFound('Escalation', escalationId)
      const ids = new Set<string>([escalationId])
      if (e.call_id) ids.add(e.call_id)
      return {
        escalation: e,
        patient: toPatient(patientById(e.patient_id) ?? notFound('Patient', e.patient_id)),
        call: state.calls.find((c) => c.call_id === e.call_id) ?? null,
        task: e.task_id && taskById(e.task_id) ? toTask(taskById(e.task_id)!) : null,
        events: eventsFor(ids),
      }
    }),

  updateEscalation: (escalationId, patch) =>
    latency(() => {
      const e = escById(escalationId) ?? notFound('Escalation', escalationId)
      const now = toIst(Date.now())
      const author = patch.author?.trim() || 'Demo staff'
      const invalid = (message: string): never => {
        throw new ApiError(409, 'invalid_transition', message, false)
      }
      if (e.status === 'resolved' && patch.action !== 'add_note') invalid('This escalation is already resolved.')
      let message: string
      switch (patch.action) {
        case 'acknowledge':
          if (e.status !== 'open') invalid(`Only open escalations can be acknowledged (current status: ${label(e.status)}).`)
          e.status = 'acknowledged'
          message = `Acknowledged by ${author}`
          break
        case 'assign': {
          const to = patch.assigned_to?.trim()
          if (!to) throw new ApiError(422, 'validation_error', 'Enter who the escalation should be assigned to.', false)
          e.status = 'assigned'
          e.assigned_to = to
          message = `Assigned to ${to} by ${author}`
          break
        }
        case 'add_note': {
          const text = patch.note?.trim()
          if (!text) throw new ApiError(422, 'validation_error', 'Note text cannot be empty.', false)
          e.notes.push({ note_id: nextId('note_sim'), text, author, created_at: now })
          message = `Note added by ${author}`
          break
        }
        case 'resolve':
          e.status = 'resolved'
          message = `Resolved by ${author}`
          break
        default:
          throw new ApiError(422, 'validation_error', 'Unknown escalation action.', false)
      }
      e.updated_at = now
      addEvent('escalation', e.escalation_id, e.patient_id, 'staff_action_recorded', message, 'staff', now)
      save()
      return { escalation: e }
    }),

  resetDemo: () =>
    latency(() => {
      state = freshState()
      try {
        sessionStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }
      return { ok: true as const }
    }),
}
