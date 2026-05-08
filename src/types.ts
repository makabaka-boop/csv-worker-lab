export type ColumnType = 'string' | 'number' | 'date'

export interface ColumnInfo {
  name: string
  type: ColumnType
}

export type AggregationType = 'sum' | 'count'

export interface PivotConfig {
  rows: string[]
  values: {
    column: string
    aggregation: AggregationType
  }[]
}

export interface CSVParseResult {
  headers: ColumnInfo[]
  rows: Record<string, any>[]
  delimiter: string
  fileSize: number
  rowCount: number
}

export interface PivotResult {
  headers: string[]
  rows: Record<string, any>[]
}

export interface WorkerMessage {
  type: 'parse' | 'pivot' | 'parseChunk' | 'chunkProgress'
  payload: any
}

export interface WorkerResponse {
  type: 'parseProgress' | 'parseComplete' | 'parseError' | 'pivotComplete' | 'pivotError'
  payload: any
}

export const MAX_FILE_SIZE = 100 * 1024 * 1024
