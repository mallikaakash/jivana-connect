import clsx from 'clsx'
import type { ReactNode } from 'react'
import { EmptyState } from './ui'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  className?: string
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
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  emptyTitle?: string
  emptyDescription?: string
  rowClassName?: (row: T) => string | undefined
}) {
  if (rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-400">
            {columns.map((c) => (
              <th key={c.key} className={clsx('whitespace-nowrap px-4 py-2 font-medium', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={clsx(onRowClick && 'cursor-pointer hover:bg-slate-50', rowClassName?.(row))}
            >
              {columns.map((c) => (
                <td key={c.key} className={clsx('px-4 py-3 align-top', c.className)}>
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
