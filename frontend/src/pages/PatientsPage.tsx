import { Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, APP_MODE, ATTENTION_STATUSES, type AttentionStatus, type PatientListItem } from '@/api'
import { CreatePatientDialog } from '@/features/clinic/CreatePatientDialog'
import { CLINIC_HELP } from '@/features/clinic/helpCopy'
import { useStaffRole } from '@/features/clinic/workspace'
import { DataTable, type Column } from '@/components/DataTable'
import { Button, Card, DemoBadge, PageHeader, StatusBadge } from '@/components/ui'
import { FilterSelect, LoadGate, RefreshError } from '@/features/secondary/common'
import { useDebounced } from '@/features/secondary/helpers'
import { attentionStatusLabel, formatDateTime, patientGenderLabel, relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'
import { sortKeyAttention } from '@/lib/tableSort'

type AttentionFilter = AttentionStatus | 'all'

const columns: Column<PatientListItem>[] = [
  {
    key: 'name',
    header: 'Patient',
    sortValue: (p) => p.display_name,
    render: (p) => (
      <div>
        <div className="font-medium text-navy-800">{p.display_name}</div>
        {APP_MODE === 'clinic' ? (
          p.demo_id ? <div className="text-xs text-slate-500">Chart {p.demo_id}</div> : null
        ) : (
          <div className="text-xs text-slate-500">{p.demo_id}</div>
        )}
      </div>
    ),
  },
  { key: 'age', header: 'Age', sortValue: (p) => p.age ?? -1, render: (p) => (p.age != null ? p.age : '—') },
  { key: 'gender', header: 'Gender', sortValue: (p) => p.gender ?? '', render: (p) => patientGenderLabel(p.gender) },
  {
    key: 'next_appt',
    header: 'Next appointment',
    className: 'whitespace-nowrap',
    sortValue: (p) => p.next_appointment_at ?? '',
    render: (p) =>
      p.next_appointment_at ? (
        <div>
          <div>{formatDateTime(p.next_appointment_at)}</div>
          <div className="text-xs text-slate-500">{relativeTime(p.next_appointment_at)}</div>
        </div>
      ) : (
        <span className="text-slate-400">None scheduled</span>
      ),
  },
  {
    key: 'followups',
    header: 'Open follow-ups',
    sortValue: (p) => p.open_followups,
    render: (p) => <span className={p.open_followups > 0 ? 'font-medium text-navy-800' : 'text-slate-400'}>{p.open_followups}</span>,
  },
  {
    key: 'last_contact',
    header: 'Last contact',
    className: 'whitespace-nowrap',
    sortValue: (p) => p.last_contact_at ?? '',
    render: (p) => (
      <span title={formatDateTime(p.last_contact_at)}>
        {p.last_contact_at ? relativeTime(p.last_contact_at) : <span className="text-slate-400">Not contacted</span>}
      </span>
    ),
  },
  {
    key: 'attention',
    header: 'Follow-up status',
    sortValue: (p) => sortKeyAttention(p.attention_status),
    render: (p) => <StatusBadge value={p.attention_status} text={attentionStatusLabel(p.attention_status)} />,
  },
]

export default function PatientsPage() {
  const navigate = useNavigate()
  const [staffRole] = useStaffRole()
  const canRegister = APP_MODE === 'clinic' && staffRole === 'desk'
  const [search, setSearch] = useState('')
  const [attention, setAttention] = useState<AttentionFilter>('all')
  const q = useDebounced(search.trim(), 300)

  const [addOpen, setAddOpen] = useState(false)
  const { data, error, loading, reload } = useAsync(
    () => api.listPatients({ q: q || undefined, attention_status: attention === 'all' ? undefined : attention }),
    [q, attention],
  )

  const rows = data?.items ?? []
  const filtered = Boolean(q) || attention !== 'all'

  return (
    <div>
      <PageHeader
        title="Patients"
        info={APP_MODE === 'clinic' ? CLINIC_HELP.patientsPage : undefined}
        subtitle={
          APP_MODE === 'clinic' ? undefined : (
            <span className="inline-flex flex-wrap items-center gap-2">
              Synthetic patient directory for the demo. <DemoBadge />
            </span>
          )
        }
        actions={canRegister ? <Button onClick={() => setAddOpen(true)}>Register patient</Button> : undefined}
      />
      <CreatePatientDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => void reload()} />
      <Card className="min-h-[min(24rem,calc(100dvh-14rem))]" title="Patient directory" actions={loading && data ? <span className="text-xs text-slate-400">Refreshing…</span> : undefined}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={APP_MODE === 'clinic' ? 'Search by name or chart number' : 'Search by name or demo ID'}
              aria-label={APP_MODE === 'clinic' ? 'Search patients by name or chart number' : 'Search patients by name or demo ID'}
              className="w-full rounded-xl border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>
          <FilterSelect
            label="Follow-up status"
            value={attention}
            onChange={setAttention}
            options={[{ value: 'all', label: 'All patients' }, ...ATTENTION_STATUSES.map((s) => ({ value: s, label: attentionStatusLabel(s) }))]}
          />
        </div>
        <RefreshError error={data ? error : undefined} reload={reload} />
        <LoadGate data={data} error={error} loading={loading} reload={reload} />
        {data && (
          <DataTable
            columns={columns}
            rows={rows}
            defaultSort={{ key: 'name', direction: 'asc' }}
            rowKey={(p) => p.patient_id}
            onRowClick={(p) => navigate(`/patients/${p.patient_id}`)}
            emptyTitle={filtered ? 'No patients match these filters' : APP_MODE === 'clinic' ? 'No patients registered yet' : 'No patients in the demo dataset'}
            emptyDescription={
              filtered
                ? APP_MODE === 'clinic'
                  ? 'Try a different name or chart number, or clear the attention filter.'
                  : 'Try a different name or demo ID, or clear the attention filter.'
                : APP_MODE === 'clinic'
                  ? 'Front desk can register the first patient from this page.'
                  : 'Reset demo data from Settings to restore the seeded patients.'
            }
          />
        )}
      </Card>
    </div>
  )
}
