import clsx from 'clsx'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { EmptyState } from './ui'

export type SortDirection = 'asc' | 'desc'

type Sortable = string | number | boolean | null | undefined

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  className?: string
  /** When set, the column header is clickable and rows sort by this value. */
  sortValue?: (row: T) => Sortable
}

function compareSortable(a: Sortable, b: Sortable): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b)
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

/** Simple responsive table. `onRowClick` makes rows navigable (e.g. to a detail page). */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  rowClassName,
  defaultSort,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  emptyTitle?: string
  emptyDescription?: string
  rowClassName?: (row: T) => string | undefined
  defaultSort?: { key: string; direction?: SortDirection }
}) {
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(() =>
    defaultSort ? { key: defaultSort.key, direction: defaultSort.direction ?? 'asc' } : null,
  )

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const get = col.sortValue
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => dir * compareSortable(get(a), get(b)))
  }, [rows, sort, columns])

  function onHeaderClick(col: Column<T>) {
    if (!col.sortValue) return
    setSort((prev) => {
      if (prev?.key !== col.key) return { key: col.key, direction: 'asc' }
      if (prev.direction === 'asc') return { key: col.key, direction: 'desc' }
      return defaultSort?.key === col.key ? { key: col.key, direction: defaultSort.direction ?? 'asc' } : null
    })
  }

  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />

  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200/70 text-[10.5px] font-medium uppercase tracking-[0.16em] text-navy-900">
            {columns.map((c) => {
              const sortable = Boolean(c.sortValue)
              const active = sort?.key === c.key
              const ariaSort = !sortable ? undefined : active ? (sort!.direction === 'asc' ? 'ascending' : 'descending') : 'none'
              const SortIcon = !sortable ? null : active ? (sort!.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
              return (
                <th key={c.key} scope="col" aria-sort={ariaSort} className={clsx('whitespace-nowrap px-4 py-2.5 font-medium text-navy-900', c.className)}>
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onHeaderClick(c)}
                      className="inline-flex max-w-full items-center gap-1 rounded-md py-0.5 pr-1 text-left text-navy-900"
                    >
                      <span>{c.header}</span>
                      {SortIcon && (
                        <SortIcon
                          className={clsx('h-3.5 w-3.5 shrink-0', active ? 'text-teal-600' : 'text-slate-400')}
                          aria-hidden
                        />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="stagger divide-y divide-slate-100">
          {sortedRows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx(
                'transition-colors duration-300 ease-soft',
                onRowClick && 'group/row cursor-pointer hover:bg-emerald-50/50 [&>td:first-child]:shadow-[inset_0_0_0_0_var(--color-teal-500)] hover:[&>td:first-child]:shadow-[inset_3px_0_0_0_var(--color-teal-500)]',
                rowClassName?.(row),
              )}
            >
              {columns.map((c) => (
                <td key={c.key} className={clsx('px-4 py-3.5 align-top transition-shadow duration-300 ease-soft', c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
