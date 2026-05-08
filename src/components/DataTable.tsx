import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table'
import { Table, Input, Tag, Space, Typography } from 'antd'
import { useState } from 'react'
import type { ColumnMeta } from '../types'
import { columnFilterPlaceholder } from '../utils/helpers'

interface Props {
  headers: string[]
  rows: Record<string, string>[]
  columnMetas: ColumnMeta[]
  totalRows: number
  delimiter: string
}

const TYPE_COLOR: Record<string, string> = {
  number: 'blue',
  date: 'green',
  string: 'default',
}
const TYPE_LABEL: Record<string, string> = {
  number: '数字',
  date: '日期',
  string: '文本',
}

export default function DataTable({ headers, rows, columnMetas, totalRows, delimiter }: Props) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const metaMap = useMemo(() => {
    const m = new Map<string, ColumnMeta>()
    columnMetas.forEach((c) => m.set(c.key, c))
    return m
  }, [columnMetas])

  const columns = useMemo<ColumnDef<Record<string, string>>[]>(
    () =>
      headers.map((h) => ({
        accessorKey: h,
        header: () => (
          <Space direction="vertical" size={2}>
            <span>{h}</span>
            <Tag color={TYPE_COLOR[metaMap.get(h)?.type ?? 'string']} style={{ fontSize: 10 }}>
              {TYPE_LABEL[metaMap.get(h)?.type ?? 'string']}
            </Tag>
          </Space>
        ),
        cell: (info) => info.getValue() as string,
        enableSorting: true,
        enableColumnFilter: true,
      })),
    [headers, metaMap]
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div>
      <Space style={{ marginBottom: 12 }} wrap>
        <Typography.Text>
          共 <strong>{totalRows.toLocaleString()}</strong> 行
        </Typography.Text>
        <Typography.Text type="secondary">
          检测分隔符：{delimiter === '\t' ? 'Tab' : delimiter === ',' ? ',' : delimiter}
        </Typography.Text>
      </Space>

      <div style={{ overflow: 'auto', maxHeight: '60vh' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    style={{
                      position: 'sticky',
                      top: 0,
                      background: '#fafafa',
                      borderBottom: '2px solid #f0f0f0',
                      padding: '8px 12px',
                      textAlign: 'left',
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      whiteSpace: 'nowrap',
                      zIndex: 1,
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span style={{ marginLeft: 4 }}>
                        {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                      </span>
                    </div>
                    {header.column.getCanFilter() && (
                      <Input
                        size="small"
                        placeholder={columnFilterPlaceholder(metaMap.get(header.id))}
                        value={(header.column.getFilterValue() as string) ?? ''}
                        onChange={(e) => header.column.setFilterValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginTop: 4, width: 140 }}
                        allowClear
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Typography.Text type="secondary" style={{ fontSize: 12, marginTop: 8, display: 'block' }}>
        显示 {table.getRowModel().rows.length.toLocaleString()} / {totalRows.toLocaleString()} 行
        （筛选 & 排序后）
      </Typography.Text>
    </div>
  )
}
