import type { JivanaApi } from './index'
import { getClinicAccessToken } from './auth'

const BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '')

// Mirrors the backend error envelope: { detail: { code, message, retry_allowed } }.
export class ApiError extends Error {
  status: number
  code: string
  retryAllowed: boolean

  constructor(status: number, code: string, message: string, retryAllowed: boolean) {
    super(message)
    this.status = status
    this.code = code
    this.retryAllowed = retryAllowed
  }
}

function query(params?: object): string {
  if (!params) return ''
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : ''
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  const token = getClinicAccessToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  try {
    res = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the Jivana Connect server. Check that the backend is running.', true)
  }
  if (!res.ok) {
    let code = 'http_error'
    let message = `Request failed (${res.status}).`
    let retryAllowed = res.status >= 500
    try {
      const body = await res.json()
      const detail = body?.detail
      if (detail && typeof detail === 'object') {
        code = detail.code ?? code
        message = detail.message ?? message
        retryAllowed = detail.retry_allowed ?? retryAllowed
      } else if (typeof detail === 'string') {
        message = detail
      }
    } catch {
      // non-JSON error body; keep the generic message
    }
    throw new ApiError(res.status, code, message, retryAllowed)
  }
  return res.json() as Promise<T>
}

export const httpApi: JivanaApi = {
  getMeta: () => request('/meta'),
  getDashboardSummary: () => request('/dashboard/summary'),
  listPatients: (params) => request(`/patients${query(params)}`),
  getPatient: (id) => request(`/patients/${id}`),
  listAppointments: () => request('/appointments'),
  listTasks: (filters) => request(`/tasks${query(filters)}`),
  getTask: (id) => request(`/tasks/${id}`),
  startCall: (id) => request(`/tasks/${id}/start-call`, { method: 'POST' }),
  listCalls: (params) => request(`/calls${query(params)}`),
  getCall: (id) => request(`/calls/${id}`),
  listEscalations: (params) => request(`/escalations${query(params)}`),
  getEscalation: (id) => request(`/escalations/${id}`),
  updateEscalation: (id, patch) => request(`/escalations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  resetDemo: () => request('/demo/reset', { method: 'POST' }),
  loadClinicDemoSeed: () => request('/clinic/demo-seed', { method: 'POST' }),
  previewDailyConfirmationBatch: () => request('/clinic/daily-confirmation-batch/preview'),
  runDailyConfirmationBatch: () => request('/clinic/daily-confirmation-batch/run', { method: 'POST' }),
  previewBatch: (taskIds) => request('/batches/preview', { method: 'POST', body: JSON.stringify({ task_ids: taskIds }) }),
  createBatch: (taskIds, title) =>
    request('/batches', { method: 'POST', body: JSON.stringify({ task_ids: taskIds, title }) }),
  scheduleBatch: (batchId, scheduledAt) =>
    request(`/batches/${batchId}/schedule`, { method: 'POST', body: JSON.stringify({ scheduled_at: scheduledAt }) }),
  stopBatch: (batchId) => request(`/batches/${batchId}/stop`, { method: 'POST' }),
  listBatches: () => request('/batches'),
  getBatch: (batchId) => request(`/batches/${batchId}`),
  createPatient: (input) => request('/patients', { method: 'POST', body: JSON.stringify(input) }),
  createTask: (input) => request('/tasks', { method: 'POST', body: JSON.stringify(input) }),
  cancelTask: (taskId) => request(`/tasks/${taskId}/cancel`, { method: 'POST' }),
  createAppointment: (input) => request('/appointments', { method: 'POST', body: JSON.stringify(input) }),
  updatePatient: (patientId, input) =>
    request(`/patients/${patientId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  updateAppointment: (appointmentId, input) =>
    request(`/appointments/${appointmentId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  staffCompleteCall: (callId, patch) =>
    request(`/calls/${callId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  downloadReport: async (kind) => {
    const token = getClinicAccessToken()
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(`${BASE}/api/reports/${kind}`, { headers })
    if (!res.ok) throw new ApiError(res.status, 'http_error', `Export failed (${res.status}).`, res.status >= 500)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jivana-${kind}.csv`
    a.click()
    URL.revokeObjectURL(url)
  },
}
