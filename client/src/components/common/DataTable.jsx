// src/components/common/DataTable.jsx
// Generic paginated/searchable table reused across every "Manage X"
// screen (users, patients, medicines, appointments, invoices, ...) so
// each page only has to describe its columns and data source.

import { FiChevronLeft, FiChevronRight, FiSearch } from 'react-icons/fi';
import Loader from './Loader';
import EmptyState from './EmptyState';

/**
 * @param {object} props
 * @param {{key:string, label:string, render?:(row:object)=>React.ReactNode}[]} props.columns
 * @param {object[]} props.rows
 * @param {boolean} props.isLoading
 * @param {{page:number,limit:number,total:number,totalPages:number}} props.meta
 * @param {(page:number)=>void} props.onPageChange
 * @param {string} props.searchValue
 * @param {(value:string)=>void} props.onSearchChange
 * @param {React.ReactNode} [props.actions]  extra controls (filters, "Add" button) rendered above the table
 * @param {(row:object)=>React.ReactNode} [props.rowActions]
 */
export default function DataTable({
  columns, rows, isLoading, meta, onPageChange, searchValue, onSearchChange, actions, rowActions,
  emptyTitle = 'No results', emptyMessage = 'Try adjusting your search or filters.',
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between">
        {onSearchChange && (
          <div className="relative w-full sm:max-w-xs">
            <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Search..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        )}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {isLoading ? (
        <Loader />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} message={emptyMessage} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/40">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {col.label}
                  </th>
                ))}
                {rowActions && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  {columns.map((col) => (
                    <td key={col.key} className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                  {rowActions && (
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm">{rowActions(row)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Page {meta.page} of {meta.totalPages} &middot; {meta.total} total
          </p>
          <div className="flex gap-2">
            <button
              className="btn-secondary px-2 py-1"
              disabled={meta.page <= 1}
              onClick={() => onPageChange(meta.page - 1)}
            >
              <FiChevronLeft />
            </button>
            <button
              className="btn-secondary px-2 py-1"
              disabled={meta.page >= meta.totalPages}
              onClick={() => onPageChange(meta.page + 1)}
            >
              <FiChevronRight />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
