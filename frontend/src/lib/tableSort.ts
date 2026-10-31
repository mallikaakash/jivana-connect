import type { AttentionStatus, Priority, TaskStatus } from '@/api'

const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

const TASK_STATUS_ORDER: Record<TaskStatus, number> = {
  in_progress: 0,
  due: 1,
  pending: 2,
  awaiting_staff_action: 3,
  failed: 4,
  completed: 5,
  cancelled: 6,
}

const ATTENTION_ORDER: Record<AttentionStatus, number> = {
  urgent: 0,
  needs_attention: 1,
  ok: 2,
}

export function sortKeyPriority(p: Priority): number {
  return PRIORITY_ORDER[p]
}

export function sortKeyTaskStatus(s: TaskStatus): number {
  return TASK_STATUS_ORDER[s]
}

export function sortKeyAttention(s: AttentionStatus): number {
  return ATTENTION_ORDER[s]
}
