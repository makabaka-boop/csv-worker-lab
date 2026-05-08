export type ColumnType = 'number' | 'date' | 'string'

export interface ColumnMeta {
  key: string
  type: ColumnType
}

export interface ParseProgress {
  type: 'progress'
  progress: number
  rowsParsed: number
}

export interface ParseComplete {
  type: 'complete'
  headers: string[]
  rows: Record<string, string>[]
  columnMetas: ColumnMeta[]
  delimiter: string
  totalRows: number
}

export interface AggregateRequest {
  type: 'aggregate'
  rowDimensions: string[]
  valueColumns: string[]
  aggMethod: 'sum' | 'count'
}

export interface AggregateResult {
  type: 'aggregateResult'
  headers: string[]
  rows: Record<string, string>[]
}

export type WorkerIncoming = { type: 'parse'; text: string } | AggregateRequest
export type WorkerOutgoing = ParseProgress | ParseComplete | AggregateResult
