import type { JivanaApi } from './index'

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
  try {
    res = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
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
}
