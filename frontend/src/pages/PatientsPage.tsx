import { Search } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, APP_MODE, ATTENTION_STATUSES, type AttentionStatus, type PatientListItem } from '@/api'
import { CreatePatientDialog } from '@/features/clinic/CreatePatientDialog'
import { useStaffRole } from '@/features/clinic/workspace'
import { DataTable, type Column } from '@/components/DataTable'
import { Button, Card, DemoBadge, PageHeader, StatusBadge } from '@/components/ui'
import { FilterSelect, LoadGate, RefreshError } from '@/features/secondary/common'
import { useDebounced } from '@/features/secondary/helpers'
import { formatDateTime, label, relativeTime } from '@/lib/format'
import { useAsync } from '@/lib/useAsync'

type AttentionFilter = AttentionStatus | 'all'

const ATTENTION_ORDER: Record<AttentionStatus, number> = { urgent: 0, needs_attention: 1, ok: 2 }

const columns: Column<PatientListItem>[] = [
  {
    key: 'name',
    header: 'Patient',
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
  { key: 'age', header: 'Age', render: (p) => (p.age != null ? p.age : '—') },
  {
    key: 'next_appt',
    header: 'Next appointment',
    className: 'whitespace-nowrap',
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
    render: (p) => <span className={p.open_followups > 0 ? 'font-medium text-navy-800' : 'text-slate-400'}>{p.open_followups}</span>,
  },
  {
    key: 'last_contact',
    header: 'Last contact',
    className: 'whitespace-nowrap',
    render: (p) => (
      <span title={formatDateTime(p.last_contact_at)}>
        {p.last_contact_at ? relativeTime(p.last_contact_at) : <span className="text-slate-400">Not contacted</span>}
      </span>
    ),
  },
  { key: 'attention', header: 'Attention', render: (p) => <StatusBadge value={p.attention_status} /> },
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

  const rows = data
    ? [...data.items].sort((a, b) => ATTENTION_ORDER[a.attention_status] - ATTENTION_ORDER[b.attention_status] || a.display_name.localeCompare(b.display_name))
    : []
  const filtered = Boolean(q) || attention !== 'all'

  return (
    <div>
      <PageHeader
        title="Patients"
        subtitle={
          APP_MODE === 'clinic' ? (
            staffRole === 'desk'
              ? 'Register patients with mobile numbers and consent before scheduling Jiya follow-ups.'
              : 'Patient directory — open a profile for call history and clinical review links.'
          ) : (
            <span className="inline-flex flex-wrap items-center gap-2">
              Synthetic patient directory for the demo. <DemoBadge />
            </span>
          )
        }
        actions={canRegister ? <Button onClick={() => setAddOpen(true)}>Register patient</Button> : undefined}
      />
      <CreatePatientDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => void reload()} />
      <Card title="Patient directory" actions={loading && data ? <span className="text-xs text-slate-400">Refreshing…</span> : undefined}>
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
            label="Attention"
            value={attention}
            onChange={setAttention}
            options={[{ value: 'all', label: 'All' }, ...ATTENTION_STATUSES.map((s) => ({ value: s, label: label(s) }))]}
          />
        </div>
        <RefreshError error={data ? error : undefined} reload={reload} />
        <LoadGate data={data} error={error} loading={loading} reload={reload} />
        {data && (
          <DataTable
            columns={columns}
            rows={rows}
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
