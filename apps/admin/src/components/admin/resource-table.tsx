import Link from 'next/link'
import type { ReactNode } from 'react'

export function ResourceTable({
  columns,
  rows,
  emptyTitle,
  emptyDescription,
}: {
  columns: string[]
  rows: Array<ReactNode[]>
  emptyTitle: string
  emptyDescription: string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
        <h2 className="text-lg font-semibold text-slate-900">{emptyTitle}</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
          {emptyDescription}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.04)]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={index} className="align-top">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-5 py-4 text-sm text-slate-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function InlineEditLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
    >
      Edit
    </Link>
  )
}
