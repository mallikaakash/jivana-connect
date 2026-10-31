import type { CallStatus, TaskStatus } from '@/api/types'
import { isOverdue } from '@/lib/format'

export const TERMINAL_CALL_STATUSES: CallStatus[] = ['completed', 'no_answer', 'failed', 'cancelled']
export const ACTIVE_CALL_STATUSES: CallStatus[] = ['queued', 'initiating', 'in_progress']

export const isCallActive = (s: CallStatus) => ACTIVE_CALL_STATUSES.includes(s)
export const isCallTerminal = (s: CallStatus) => TERMINAL_CALL_STATUSES.includes(s)

/** A task is overdue when its call has not happened yet (pending/due) and the due time has passed. */
export function isTaskOverdue(task: { status: TaskStatus; due_at: string }, now = Date.now()): boolean {
  return (task.status === 'pending' || task.status === 'due') && isOverdue(task.due_at, now)
}

export const MAX_ATTEMPTS = 3
