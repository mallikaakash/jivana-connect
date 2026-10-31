import clsx from 'clsx'
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, Clock, Lock, PhoneCall, PhoneForwarded } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError, APP_MODE, type Call, type TaskStatus } from '@/api'
import { useStaffRole } from '@/features/clinic/workspace'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PatientSummary } from '@/components/PatientSummary'
import { Timeline } from '@/components/Timeline'
import { Button, Card, DemoBadge, EmptyState, ErrorBanner, ExtractedFields, LoadingState, StatusBadge } from '@/components/ui'
import {
  formatDateTime,
  label,
  outcomeLabel,
  relativeTime,
  taskActionVisual,
  TASK_ACTION_PANEL,
  taskStatusLabel,
} from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { AppointmentCard } from '@/features/core/AppointmentCard'
import { CallModeBadge } from '@/features/core/CallModeBadge'
import { isCallActive, isCallTerminal, isTaskOverdue, MAX_ATTEMPTS } from '@/features/core/helpers'
import {
  jiyaScriptSummary,
  showCallsListSection,
  showDueChipInHeader,
  showJiyaScript,
  showLatestResultSection,
  showPriorityBadge,
  showRecentActivity,
  showTaskDepartment,
  taskPageHeading,
  taskTypeChip,
} from '@/features/core/taskDetailLayout'
import { LiveCallPanel } from '@/features/core/LiveCallPanel'
import { TestTracker } from '@/features/core/TestTracker'

interface CallSession {
  callId: string
  initialCall: Call
  trail: TaskStatus[]
}

function appendStatus(trail: TaskStatus[], s: TaskStatus): TaskStatus[] {
  return trail[trail.length - 1] === s ? trail : [...trail, s]
}

export default function TaskDetailPage() {
  const { taskId = '' } = useParams()
  const [staffRole] = useStaffRole()
  const isDoctorClinic = APP_MODE === 'clinic' && staffRole === 'doctor'
  const navigate = useNavigate()
  const [polling, setPolling] = useState(false)
  const detail = useAsync(() => api.getTask(taskId), [taskId], polling ? 2000 : undefined)

  const [session, setSession] = useState<CallSession | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [startError, setStartError] = useState<Error | null>(null)
  const terminalTask = (s: TaskStatus) => s === 'completed' || s === 'cancelled' || s === 'failed'

  useEffect(() => {
    setSession(null)
    setStartError(null)
    setPolling(false)
  }, [taskId])

  const data = detail.data?.task.task_id === taskId ? detail.data : undefined
  const sessionCall = session ? (data?.calls.find((c) => c.call_id === session.callId) ?? session.initialCall) : undefined
  const latestCall = data?.calls[0]
  const panelCall = sessionCall ?? (latestCall && isCallActive(latestCall.status) ? latestCall : undefined)

  useEffect(() => {
    if (!data) return
    const active = data.calls.some((c) => isCallActive(c.status)) || (sessionCall ? !isCallTerminal(sessionCall.status) : false)
    setPolling(active)
    if (session) setSession((s) => (s ? { ...s, trail: appendStatus(s.trail, data.task.status) } : s))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  async function startCall() {
    if (!data) return
    const before = data.task.status
    setStarting(true)
    setStartError(null)
    try {
      const res = await api.startCall(taskId)
      setSession({ callId: res.call.call_id, initialCall: res.call, trail: appendStatus([before], res.task.status) })
      setPolling(true)
      setConfirmOpen(false)
      void detail.reload()
    } catch (e) {
      setStartError(e instanceof Error ? e : new Error(String(e)))
      setConfirmOpen(false)
      void detail.reload()
    } finally {
      setStarting(false)
    }
  }

  async function cancelTask() {
    if (!data || !window.confirm('Cancel this follow-up? It will leave the patient list but stop appearing in queues.')) return
    setCancelling(true)
    try {
      await api.cancelTask(taskId)
      void detail.reload()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Could not cancel task')
    } finally {
      setCancelling(false)
    }
  }

  if (!data) {
    if (detail.error)
      return (
        <div className="space-y-4">
          <BackLink doctorClinic={isDoctorClinic} />
          <ErrorBanner error={detail.error} onRetry={detail.error instanceof ApiError && detail.error.status === 404 ? undefined : () => void detail.reload()} />
        </div>
      )
    return <LoadingState text="Loading task…" />
  }

  const { task, patient, appointment, calls, events, spawned_followup } = data
  const overdue = isTaskOverdue(task)
  const callRunning = panelCall ? !isCallTerminal(panelCall.status) : false
  const statusChanged = session && session.trail.length > 1 && sessionCall && isCallTerminal(sessionCall.status)
  const retryAllowed = startError instanceof ApiError ? startError.retryAllowed : false
  const latestCompletedCall = calls.find((c) => c.status === 'completed')

  const heading = taskPageHeading(task, appointment)
  const showDue = showDueChipInHeader(task)
  const showResults = showLatestResultSection(task, calls)
  const showCalls = showCallsListSection(calls, callRunning)
  const showScript = showJiyaScript(task, isDoctorClinic)
  const historyEvents = events.length > 6 ? events.slice(0, 6) : events
  const showHistory = showRecentActivity(events, calls, task)
  const actionVisual = taskActionVisual(task)
  const actionPanel = TASK_ACTION_PANEL[actionVisual]

  return (
    <div className="space-y-6">
      <BackLink doctorClinic={isDoctorClinic} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span className="rounded-full bg-navy-50 px-1.5 py-0.5 text-navy-700">{taskTypeChip(task)}</span>
            {showTaskDepartment(task, APP_MODE === 'clinic') && <span>{task.department}</span>}
            {APP_MODE !== 'clinic' && (
              <>
                <span className="text-slate-300">·</span>
                <span className="font-mono text-[11px]">{task.task_id}</span>
                <DemoBadge />
              </>
            )}
          </div>
          <h1 className="mt-2 text-[2.25rem] leading-[1.1] font-light text-navy-900">{heading.title}</h1>
          {heading.subtitle && <p className="mt-1 text-sm text-slate-600">{heading.subtitle}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={clsx('rounded-full transition-all duration-500', statusChanged && 'ring-2 ring-teal-500 ring-offset-2')}>
              <StatusBadge value={task.status} text={taskStatusLabel(task.status)} />
            </span>
            {showPriorityBadge(task) && <StatusBadge value={task.priority} text={`${label(task.priority)} priority`} />}
            {showDue && (
              <span className={clsx('inline-flex items-center gap-1 text-xs', overdue ? 'font-medium text-red-600' : 'text-slate-500')} title={formatDateTime(task.due_at)}>
                <Clock className="h-3.5 w-3.5" />
                {overdue ? 'Overdue · ' : 'Due '}
                {relativeTime(task.due_at)}
                {!/automatic confirmation call/i.test(task.next_action ?? '') && ` · ${formatDateTime(task.due_at)}`}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="stagger grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className={clsx('rounded-2xl border border-slate-200 border-l-4 p-4 shadow-sm', actionPanel.sectionClass)}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className={clsx('text-[11px] font-medium uppercase tracking-[0.16em]', actionPanel.labelClass)}>
                  {isDoctorClinic ? actionPanel.clinicalTitle : actionPanel.panelTitle}
                </p>
                <p
                  className={clsx(
                    'mt-1.5 font-serif leading-snug font-light tracking-[-0.02em]',
                    task.next_action && task.next_action.length > 72 ? 'text-xl' : 'text-[1.6rem]',
                    actionVisual === 'complete' ? 'text-emerald-900' : actionVisual === 'staff' ? 'text-red-950' : 'text-navy-900',
                  )}
                >
                  {task.next_action}
                </p>
                {!isDoctorClinic && (
                  <p className="mt-1 text-xs text-slate-500">
                    Attempts: <span className="font-medium text-slate-700">{task.attempt_count} of {MAX_ATTEMPTS}</span>
                    {task.last_attempt_at && ` · last ${relativeTime(task.last_attempt_at)}`}
                  </p>
                )}
              </div>
              {!isDoctorClinic && (
                <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
                  <Button
                    icon={<PhoneCall className="h-4 w-4" />}
                    disabled={!task.call_eligible || callRunning}
                    loading={starting}
                    onClick={() => {
                      setStartError(null)
                      setConfirmOpen(true)
                    }}
                  >
                    Start Jiya call
                  </Button>
                  {APP_MODE === 'clinic' && !terminalTask(task.status) && (
                    <Button variant="secondary" loading={cancelling} disabled={callRunning} onClick={() => void cancelTask()}>
                      Cancel follow-up
                    </Button>
                  )}
                  {!task.call_eligible && task.call_ineligible_reason && !callRunning && (
                    <p className="flex max-w-xs items-start gap-1 text-xs text-slate-500 sm:text-right">
                      <Lock className="mt-0.5 h-3 w-3 shrink-0" />
                      {task.call_ineligible_reason}
                    </p>
                  )}
                </div>
              )}
            </div>
            {startError && !isDoctorClinic && (
              <div className="mt-4">
                <ErrorBanner error={startError} onRetry={retryAllowed ? () => setConfirmOpen(true) : undefined} />
                <p className="mt-1.5 text-xs text-slate-500">The task was not changed.</p>
              </div>
            )}
            {isDoctorClinic && task.escalation_id && (
              <div className="mt-4">
                <Button variant="secondary" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => navigate(`/escalations/${task.escalation_id}`)}>
                  Open clinical review
                </Button>
              </div>
            )}
            {!isDoctorClinic && spawned_followup && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                <p className="font-medium">Desk follow-up created from this call</p>
                <p className="mt-0.5 text-amber-900/90">{spawned_followup.title}</p>
                <Link to={`/tasks/${spawned_followup.task_id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-teal-800 hover:underline">
                  Open follow-up task
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </section>

          {!isDoctorClinic && panelCall && <LiveCallPanel call={panelCall} task={task} trail={session?.trail ?? [task.status]} />}

          {isDoctorClinic && latestCompletedCall && (
            <Card
              title="Latest call"
              actions={
                latestCompletedCall.outcome ? (
                  <StatusBadge value={latestCompletedCall.outcome} text={outcomeLabel(latestCompletedCall.outcome, true)} />
                ) : undefined
              }
            >
              {latestCompletedCall.summary ? (
                <p className="text-sm leading-relaxed text-slate-800">{latestCompletedCall.summary}</p>
              ) : (
                <EmptyState title="No summary on file" description="Open the call record for transcript and extracted fields." />
              )}
              <div className="mt-3">
                <Link to={`/calls/${latestCompletedCall.call_id}`} className="text-sm font-medium text-teal-700 hover:underline">
                  Read full call record
                </Link>
              </div>
            </Card>
          )}

          {!isDoctorClinic && (
            <>
              <Card title="Why Jiya is calling">
                <p className="text-sm text-slate-800">{task.purpose}</p>
              </Card>
              {showScript && (
                <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-navy-800 marker:content-none">
                    Voice call instructions
                    <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                    <p className="text-[11px] text-slate-500">What the automated caller uses for this follow-up (not a script for staff).</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-700">{jiyaScriptSummary(task)}</p>
                    <p className="mt-2 text-[11px] text-slate-400">Non-clinical only — no diagnosis or prescribing.</p>
                  </div>
                </details>
              )}
            </>
          )}

          {task.test_tracking && (
            <Card title="Test & follow-up visit">
              <TestTracker tracking={task.test_tracking} />
            </Card>
          )}

          {showResults && (
            <Card title="Call result" actions={task.latest_outcome ? <StatusBadge value={task.latest_outcome} text={outcomeLabel(task.latest_outcome, APP_MODE === 'clinic')} /> : undefined}>
              {task.latest_outcome || task.extracted_fields ? (
                <ExtractedFields fields={task.extracted_fields} />
              ) : (
                <EmptyState
                  title="No structured fields yet"
                  description={isDoctorClinic ? 'Front desk will place the follow-up call when due.' : 'Start a Jiya call to capture a structured outcome.'}
                />
              )}
            </Card>
          )}

          {showCalls && (
            <Card title={`Call attempts (${task.attempt_count} of ${MAX_ATTEMPTS})`} bodyClassName="p-0">
              {calls.length === 0 ? (
                <EmptyState title="No calls yet" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {calls.map((c) => (
                    <li key={c.call_id}>
                      <Link to={`/calls/${c.call_id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-navy-800">{formatDateTime(c.started_at ?? c.created_at)}</p>
                          <p className="text-xs text-slate-500">{relativeTime(c.created_at)}</p>
                        </div>
                        {c.outcome ? (
                          <StatusBadge value={c.outcome} text={outcomeLabel(c.outcome, APP_MODE === 'clinic')} />
                        ) : (
                          <StatusBadge value={c.status} />
                        )}
                        {APP_MODE !== 'clinic' && <CallModeBadge isLive={c.is_live} />}
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Patient">
            <PatientSummary patient={patient} />
          </Card>

          {appointment && (
            <Card title={APP_MODE === 'clinic' ? 'Visit' : 'Linked appointment'}>
              <AppointmentCard appointment={appointment} compact={APP_MODE === 'clinic' && task.task_type === 'appointment_confirmation'} />
            </Card>
          )}

          {task.callback_window && (
            <Card title="Callback window">
              <p className="flex items-center gap-2 text-sm font-medium text-navy-800">
                <PhoneForwarded className="h-4 w-4 text-teal-600" /> {task.callback_window}
              </p>
              <p className="mt-1 text-xs text-slate-500">Requested by the patient. Scheduler to call within this window.</p>
            </Card>
          )}

          {task.escalation_id && (
            <Link
              to={`/escalations/${task.escalation_id}`}
              className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm hover:bg-red-100/60"
            >
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span className="flex-1">
                <span className="block font-medium">{isDoctorClinic ? 'Clinical review' : 'Escalation linked'}</span>
                <span className="text-xs">{isDoctorClinic ? 'Patient question or concern — open review' : 'Routed for staff review — open escalation'}</span>
              </span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}

          <Card title={showHistory && historyEvents.length > 0 ? 'Recent activity' : 'Action history'}>
            <Timeline events={showHistory && historyEvents.length > 0 ? historyEvents : events} compact emptyTitle="No actions recorded yet" />
            {showHistory && events.length > historyEvents.length && (
              <p className="mt-2 text-[11px] text-slate-400">{events.length - historyEvents.length} older entries omitted</p>
            )}
          </Card>
        </div>
      </div>

      {detail.error && <ErrorBanner error={`Could not refresh: ${detail.error.message}`} onRetry={() => void detail.reload()} />}

      {!isDoctorClinic && (
        <ConfirmDialog
          open={confirmOpen}
          title="Start Jiya call?"
          confirmLabel="Start call"
          loading={starting}
          onConfirm={() => void startCall()}
          onCancel={() => !starting && setConfirmOpen(false)}
        >
          <p>
            Jiya will call <span className="font-medium text-navy-800">{patient.display_name}</span> about:
          </p>
          <p className="mt-1.5 rounded-xl bg-slate-50 px-3 py-2 text-slate-700">{task.purpose}</p>
          <p className="mt-2 text-xs text-slate-500">
            {APP_MODE === 'clinic'
              ? 'Jiya will call the mobile number on the patient record.'
              : 'In live mode this places a real phone call to the demo recipient.'}
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function BackLink({ doctorClinic }: { doctorClinic?: boolean }) {
  const to = doctorClinic ? '/' : '/tasks'
  const labelText = doctorClinic ? 'Today' : 'Tasks & follow-ups'
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-800">
      <ArrowLeft className="h-4 w-4" /> {labelText}
    </Link>
  )
}
