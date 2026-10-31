/** Shared help text for InfoHint (i) icons — keep in sync across Today, Tasks, and related pages. */
export const CLINIC_HELP = {
  todayPage:
    'Summary tiles open the matching list. Need attention is the front-desk queue (same as Tasks → Need attention). Calls completed counts finished Jiya calls in the last seven days.',
  tasksListFooter:
    'Need attention and Scheduled calls are subsets of open work. Full list includes completed tasks for audit.',
  tasksPage:
    'Need attention uses the same rules as Today. Scheduled calls are confirmations and reminders Jiya should place today. All open includes every active task; Full list adds completed history.',
  needAttentionInbox:
    'Callbacks, reschedules, and follow-ups waiting on front desk after a call. The count matches the Need attention tile and tab on Tasks.',
  clinicalInbox:
    'Escalations and clinical questions from Jiya that need a doctor or nurse — not routine scheduling.',
  appointmentsPage:
    'Booking status comes from your schedule; confirmation is updated by Jiya calls. Grey rows are old slots after a reschedule — the active visit is on its new date. When a patient gives a clear new date on a call, Jiya cancels the old slot and books the new one automatically.',
  batchesPage:
    'Each day Jiya batches confirmation calls for tomorrow’s visits. New bookings join automatically. Check-ins, test reminders, and one-off follow-ups: open the task and start Jiya from task detail (manual multi-task batching is not shown here).',
  batchConfirmations:
    'Jiya calls everyone with an appointment the next day. New bookings are queued without staff dialing each patient. Use “Run today’s batch now” only if you need to trigger early.',
  batchOtherFollowUps:
    'Check-ins, test/report reminders, and callbacks are created as tasks — open the task and use Start Jiya call. Staff can also batch from demo mode; clinic UI focuses on daily confirmations.',
  patientsPage: 'Registered patients in Jivana Connect. Open a chart for appointments, tasks, calls, and activity.',
  callsPage: 'Outbound Jiya calls and outcomes. Live calls update task and appointment confirmation when webhooks arrive.',
  escalationsPage: 'Clinical concerns and routing — resolve or assign from here; doctors see these on Clinical review.',
} as const
