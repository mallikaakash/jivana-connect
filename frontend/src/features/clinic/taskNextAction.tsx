import { Link } from 'react-router-dom'
import type { Task } from '@/api'

/** Desk-facing next action; links to spawned callback/schedule task when present. */
export function TaskNextAction({ task }: { task: Task }) {
  const spawnedId = task.spawned_followup_task_id
  if (spawnedId) {
    return (
      <span className="text-sm text-slate-700">
        {task.next_action}
        {' · '}
        <Link to={`/tasks/${spawnedId}`} className="font-medium text-teal-700 hover:underline" onClick={(e) => e.stopPropagation()}>
          Open follow-up
        </Link>
      </span>
    )
  }
  return <span className="text-sm text-slate-700">{task.next_action}</span>
}
