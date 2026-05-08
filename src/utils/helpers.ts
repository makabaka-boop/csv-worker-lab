import type { ColumnMeta } from '../types'

export function exportCSV(headers: string[], rows: Record<string, string>[]): void {
  const csvRows: string[] = [headers.map(escapeCSV).join(',')]
  for (const row of rows) {
    csvRows.push(headers.map((h) => escapeCSV(row[h] ?? '')).join(','))
  }
  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `export_${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

export function columnFilterPlaceholder(meta: ColumnMeta | undefined): string {
  if (!meta) return '筛选...'
  switch (meta.type) {
    case 'number':
      return '输入数字筛选...'
    case 'date':
      return '输入日期筛选...'
    default:
      return '输入文本筛选...'
  }
}
