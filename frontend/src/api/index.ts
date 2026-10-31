// Single API surface for every page. Pages import from here only, never from ./http or ./mock,
// so switching VITE_API_MODE swaps the implementation without touching components.
import { httpApi } from './http'
import { mockApi } from './mock'
import type {
  Call,
  CallDetail,
  CallStatus,
  DashboardSummary,
  Escalation,
  EscalationDetail,
  EscalationPatch,
  EscalationStatus,
  ListResponse,
  Meta,
  PatientDetail,
  PatientListItem,
  AttentionStatus,
  Appointment,
  Batch,
  BatchDetail,
  BatchPreviewResult,
  DailyConfirmationBatchPreview,
  DailyConfirmationBatchRunResult,
  CreatePatientInput,
  CreateTaskInput,
  CreateAppointmentInput,
  UpdatePatientInput,
  UpdateAppointmentInput,
  StaffCallPatch,
  Patient,
  Task,
  TaskDetail,
  TaskFilters,
  WithPatientName,
} from './types'

export interface JivanaApi {
  getMeta(): Promise<Meta>
  getDashboardSummary(): Promise<DashboardSummary>
  listPatients(params?: { q?: string; attention_status?: AttentionStatus }): Promise<ListResponse<PatientListItem>>
  getPatient(patientId: string): Promise<PatientDetail>
  listAppointments(): Promise<ListResponse<WithPatientName<Appointment>>>
  listTasks(filters?: TaskFilters): Promise<ListResponse<WithPatientName<Task>>>
  getTask(taskId: string): Promise<TaskDetail>
  startCall(taskId: string): Promise<{ call: Call; task: Task }>
  listCalls(params?: { status?: CallStatus; task_id?: string; flagged?: 'clinical' }): Promise<ListResponse<WithPatientName<Call>>>
  getCall(callId: string): Promise<CallDetail>
  listEscalations(params?: { status?: EscalationStatus }): Promise<ListResponse<WithPatientName<Escalation>>>
  getEscalation(escalationId: string): Promise<EscalationDetail>
  updateEscalation(escalationId: string, patch: EscalationPatch): Promise<{ escalation: Escalation }>
  resetDemo(): Promise<{ ok: true }>
  loadClinicDemoSeed(): Promise<{ ok: true; counts: Record<string, number> }>
  previewDailyConfirmationBatch(): Promise<DailyConfirmationBatchPreview>
  runDailyConfirmationBatch(): Promise<DailyConfirmationBatchRunResult>
  previewBatch(taskIds: string[]): Promise<BatchPreviewResult>
  createBatch(taskIds: string[], title?: string): Promise<BatchDetail & { skipped: BatchPreviewResult['skipped']; trial_note?: string | null }>
  scheduleBatch(batchId: string, scheduledAt: string): Promise<{ batch: Batch }>
  stopBatch(batchId: string): Promise<{ batch: Batch }>
  listBatches(): Promise<ListResponse<Batch>>
  getBatch(batchId: string): Promise<BatchDetail>
  createPatient(input: CreatePatientInput): Promise<{ patient: Patient }>
  createTask(input: CreateTaskInput): Promise<{ task: Task }>
  cancelTask(taskId: string): Promise<{ task: Task }>
  createAppointment(input: CreateAppointmentInput): Promise<{ appointment: Appointment; task: Task | null }>
  updatePatient(patientId: string, input: UpdatePatientInput): Promise<{ patient: Patient }>
  updateAppointment(appointmentId: string, input: UpdateAppointmentInput): Promise<{ appointment: Appointment }>
  staffCompleteCall(callId: string, patch: StaffCallPatch): Promise<{ call: Call }>
  downloadReport(kind: 'patients' | 'calls' | 'tasks'): Promise<void>
}

export { getClinicAccessToken, resolveClinicAccessKey, setClinicAccessToken } from './auth'

export const APP_MODE: 'demo' | 'clinic' =
  import.meta.env.VITE_JIVANA_MODE === 'clinic' ? 'clinic' : 'demo'

export const API_MODE: 'mock' | 'http' =
  APP_MODE === 'clinic' ? 'http' : import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'http'

export const api: JivanaApi = API_MODE === 'mock' ? mockApi : httpApi

export { ApiError } from './http'
export * from './types'
