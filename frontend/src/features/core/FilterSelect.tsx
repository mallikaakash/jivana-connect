import { ChevronDown } from 'lucide-react'

/** Compact labelled select used by list filters. Empty string = "All". */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  allLabel = 'All',
}: {
  label: string
  value: T | ''
  options: { value: T; label: string }[]
  onChange: (value: T | '') => void
  allLabel?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <span className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T | '')}
          className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 sm:w-44"
        >
          <option value="">{allLabel}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </span>
    </label>
  )
}
