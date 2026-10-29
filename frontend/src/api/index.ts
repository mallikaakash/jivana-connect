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
  listCalls(params?: { status?: CallStatus; task_id?: string }): Promise<ListResponse<WithPatientName<Call>>>
  getCall(callId: string): Promise<CallDetail>
  listEscalations(params?: { status?: EscalationStatus }): Promise<ListResponse<WithPatientName<Escalation>>>
  getEscalation(escalationId: string): Promise<EscalationDetail>
  updateEscalation(escalationId: string, patch: EscalationPatch): Promise<{ escalation: Escalation }>
  resetDemo(): Promise<{ ok: true }>
}

export const API_MODE: 'mock' | 'http' = import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'http'

export const api: JivanaApi = API_MODE === 'mock' ? mockApi : httpApi

export { ApiError } from './http'
export * from './types'
