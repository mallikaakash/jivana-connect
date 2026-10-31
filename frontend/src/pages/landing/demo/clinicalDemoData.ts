/** Illustrative landing-page data — fictional patients only. */

export type ConcernStatus =
  | 'new'
  | 'assigned'
  | 'under_review'
  | 'callback_required'
  | 'action_recorded'
  | 'resolved'

export type ConcernPriority = 'high' | 'medium' | 'routine'

export type ClinicalConcern = {
  id: string
  patientName: string
  concernSummary: string
  reportedAt: string
  priority: ConcernPriority
  priorityLabel: string
  assignedTo: string | null
  status: ConcernStatus
  nextAction: string
  relatedContext: string
  patientReported: string
  escalationReason: string
  activity: { at: string; label: string }[]
}

export type DeskTask = {
  id: string
  title: string
  patientName: string
  meta: string
  status: 'pending' | 'calling' | 'scheduled' | 'complete'
  queue: 'operations'
}

export type TimelineEvent = {
  id: string
  type: 'admin' | 'clinical'
  eventType: string
  at: string
  description: string
  status: string
}

export const DEMO_DISCLAIMER = 'Illustrative demo — not live clinical records.'

export const INITIAL_CONCERNS: ClinicalConcern[] = [
  {
    id: 'c1',
    patientName: 'Ananya Mehta',
    concernSummary: 'Patient reports worsening pain following a procedure.',
    reportedAt: '31 Oct 2026, 3:40 pm',
    priority: 'high',
    priorityLabel: 'High — review required',
    assignedTo: null,
    status: 'new',
    nextAction: 'Assign to clinician per clinic protocol',
    relatedContext: 'Post-procedure check-in · Day 2',
    patientReported:
      'Patient said pain has increased since yesterday and is harder to manage at home. Asked when someone from the care team could advise next steps.',
    escalationReason: 'Patient-reported symptom change after procedure — routed per configured escalation rules.',
    activity: [{ at: '31 Oct, 3:40 pm', label: 'Concern captured from Jiya call' }],
  },
  {
    id: 'c2',
    patientName: 'Priya Nair',
    concernSummary: 'Difficulty following prescribed medication schedule.',
    reportedAt: '31 Oct 2026, 11:15 am',
    priority: 'medium',
    priorityLabel: 'Medium — follow-up',
    assignedTo: 'Dr. Sharma',
    status: 'under_review',
    nextAction: 'Clinician review medication instructions',
    relatedContext: 'Recovery check-in · General OPD',
    patientReported: 'Patient reported missing evening doses and uncertainty about timing with meals.',
    escalationReason: 'Care-plan adherence concern — not a verified diagnosis.',
    activity: [
      { at: '31 Oct, 11:15 am', label: 'Concern captured from Jiya call' },
      { at: '31 Oct, 11:42 am', label: 'Assigned to Dr. Sharma' },
    ],
  },
  {
    id: 'c3',
    patientName: 'Rahul Verma',
    concernSummary: 'Recovery not progressing as patient expected.',
    reportedAt: '30 Oct 2026, 5:05 pm',
    priority: 'medium',
    priorityLabel: 'Medium — review',
    assignedTo: 'Care team · Ortho',
    status: 'callback_required',
    nextAction: 'Clinician callback scheduled',
    relatedContext: 'Post-consultation follow-up',
    patientReported: 'Patient feels mobility is slower than they were told to expect; wants guidance.',
    escalationReason: 'Patient-reported recovery concern — clinician assessment required.',
    activity: [
      { at: '30 Oct, 5:05 pm', label: 'Concern captured' },
      { at: '31 Oct, 9:00 am', label: 'Callback requested' },
    ],
  },
  {
    id: 'c4',
    patientName: 'Meera Iyer',
    concernSummary: 'Patient requested clarification from their doctor.',
    reportedAt: '30 Oct 2026, 2:20 pm',
    priority: 'routine',
    priorityLabel: 'Routine — question',
    assignedTo: 'Dr. Patel',
    status: 'assigned',
    nextAction: 'Doctor to respond when available',
    relatedContext: 'Lab report discussion · Phone follow-up',
    patientReported: 'Patient asked what the next step is after a pending report was mentioned on the call.',
    escalationReason: 'Information routing — no treatment advice from Jiya.',
    activity: [
      { at: '30 Oct, 2:20 pm', label: 'Question captured' },
      { at: '30 Oct, 3:00 pm', label: 'Assigned to Dr. Patel' },
    ],
  },
  {
    id: 'c5',
    patientName: 'Karan Singh',
    concernSummary: 'Callback requested after consultation.',
    reportedAt: '29 Oct 2026, 4:50 pm',
    priority: 'routine',
    priorityLabel: 'Routine — callback',
    assignedTo: 'Dr. Sharma',
    status: 'action_recorded',
    nextAction: 'Document outcome after callback',
    relatedContext: 'Follow-up to OPD visit',
    patientReported: 'Patient asked for a nurse or doctor to call back about wound care steps.',
    escalationReason: 'Callback queue — ownership assigned.',
    activity: [
      { at: '29 Oct, 4:50 pm', label: 'Callback requested' },
      { at: '30 Oct, 10:30 am', label: 'Action recorded — callback completed' },
    ],
  },
  {
    id: 'c6',
    patientName: 'Divya Rao',
    concernSummary: 'Symptoms reported during recovery check-in (resolved).',
    reportedAt: '28 Oct 2026, 9:10 am',
    priority: 'medium',
    priorityLabel: 'Medium — resolved',
    assignedTo: 'Dr. Patel',
    status: 'resolved',
    nextAction: 'Closed — clinician documented review',
    relatedContext: 'Post-procedure day 5',
    patientReported: 'Patient reported mild nausea; clinician reviewed and advised follow-up if persistent.',
    escalationReason: 'Resolved after clinician review — illustrative closure.',
    activity: [
      { at: '28 Oct, 9:10 am', label: 'Concern captured' },
      { at: '28 Oct, 11:00 am', label: 'Clinician review recorded' },
      { at: '28 Oct, 4:00 pm', label: 'Marked resolved' },
    ],
  },
]

export const DESK_TASKS: DeskTask[] = [
  {
    id: 'd1',
    title: 'Confirm visit — 1 Nov',
    patientName: 'Priya Nair',
    meta: 'General OPD · Dr. Sharma',
    status: 'pending',
    queue: 'operations',
  },
  {
    id: 'd2',
    title: 'Lipid profile reminder',
    patientName: 'Rahul Verma',
    meta: 'Due today · Attempt 1 of 3',
    status: 'scheduled',
    queue: 'operations',
  },
  {
    id: 'd3',
    title: 'Appointment callback',
    patientName: 'Meera Iyer',
    meta: 'Reschedule window · Desk',
    status: 'pending',
    queue: 'operations',
  },
]

export const HERO_CLINICAL_PREVIEW_IDS = ['c1', 'c2', 'c3'] as const

export const PATIENT_TIMELINE: TimelineEvent[] = [
  { id: 't1', type: 'admin', eventType: 'Appointment booked', at: '28 Oct, 10:00 am', description: 'General OPD · 1 Nov', status: 'Confirmed' },
  { id: 't2', type: 'admin', eventType: 'Confirmation call completed', at: '31 Oct, 9:30 am', description: 'Jiya · Priya Nair · Attendance confirmed', status: 'Complete' },
  { id: 't3', type: 'admin', eventType: 'Test reminder sent', at: '31 Oct, 8:00 am', description: 'Lipid profile · Rahul Verma', status: 'Delivered' },
  { id: 't4', type: 'clinical', eventType: 'Patient concern captured', at: '31 Oct, 3:40 pm', description: 'Ananya Mehta · Worsening pain (patient-reported)', status: 'New' },
  { id: 't5', type: 'clinical', eventType: 'Concern assigned', at: '31 Oct, 3:55 pm', description: 'Routed to on-call review queue', status: 'Assigned' },
  { id: 't6', type: 'clinical', eventType: 'Clinician review recorded', at: '31 Oct, 4:20 pm', description: 'Dr. Patel · Assessment documented (illustrative)', status: 'Under review' },
  { id: 't7', type: 'admin', eventType: 'Patient callback completed', at: '31 Oct, 4:45 pm', description: 'Care team · Karan Singh', status: 'Complete' },
  { id: 't8', type: 'admin', eventType: 'Follow-up task closed', at: '31 Oct, 5:00 pm', description: 'Desk action complete · Timeline updated', status: 'Closed' },
]

export const FEATURE_CONCERN_ID = 'c1'
