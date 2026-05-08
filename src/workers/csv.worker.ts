import Papa from 'papaparse'
import type { ColumnMeta, ColumnType, WorkerIncoming, WorkerOutgoing, AggregateRequest } from '../types'

const ctx = self as unknown as Worker

let cachedRows: Record<string, string>[] = []

function sniffDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 20).join('\n')
  const delimiters = [',', '\t', ';', '|']
  let best = ','
  let bestScore = 0
  for (const d of delimiters) {
    const res = Papa.parse(firstLines, { delimiter: d, header: false })
    if (res.data.length < 2) continue
    const counts = res.data.map((r) => (r as string[]).length)
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length
    if (avg > bestScore) {
      bestScore = avg
      best = d
    }
  }
  return best
}

const DATE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/

function inferColumnType(values: string[]): ColumnType {
  let numCount = 0
  let dateCount = 0
  let total = 0
  for (const v of values) {
    if (v === '' || v === null || v === undefined) continue
    total++
    if (!isNaN(Number(v)) && v.trim() !== '') {
      numCount++
    } else if (DATE_RE.test(v.trim())) {
      dateCount++
    }
  }
  if (total === 0) return 'string'
  if (numCount / total > 0.8) return 'number'
  if (dateCount / total > 0.8) return 'date'
  return 'string'
}

function parseCSV(text: string) {
  const delimiter = sniffDelimiter(text)
  const CHUNK_REPORT = 5000
  const allRows: Record<string, string>[] = []
  let headers: string[] = []
  let totalProcessed = 0
  const estimatedLines = text.split(/\r?\n/).length

  return new Promise<void>((resolve) => {
    Papa.parse(text, {
      delimiter,
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      step(results) {
        const row = results.data as Record<string, string>
        if (headers.length === 0) {
          headers = results.meta.fields ?? Object.keys(row)
        }
        allRows.push(row)
        totalProcessed++
        if (totalProcessed % CHUNK_REPORT === 0) {
          const pct = Math.min(Math.round((totalProcessed / estimatedLines) * 100), 99)
          ctx.postMessage({
            type: 'progress',
            progress: pct,
            rowsParsed: totalProcessed,
          } satisfies WorkerOutgoing)
        }
      },
      complete() {
        cachedRows = allRows
        const sampleSize = Math.min(allRows.length, 200)
        const columnMetas: ColumnMeta[] = headers.map((h) => {
          const sample = allRows.slice(0, sampleSize).map((r) => r[h] ?? '')
          return { key: h, type: inferColumnType(sample) }
        })
        ctx.postMessage({
          type: 'complete',
          headers,
          rows: allRows,
          columnMetas,
          delimiter,
          totalRows: allRows.length,
        } satisfies WorkerOutgoing)
        resolve()
      },
      error(err: Error) {
        console.error('CSV parse error:', err)
      },
    })
  })
}

function aggregateChunked(req: AggregateRequest) {
  const { rowDimensions, valueColumns, aggMethod } = req
  const map = new Map<string, Record<string, string | number>>()
  const CHUNK = 50000
  let offset = 0

  function processChunk() {
    const end = Math.min(offset + CHUNK, cachedRows.length)
    for (let i = offset; i < end; i++) {
      const row = cachedRows[i]!
      const dimKey = rowDimensions.map((d) => row[d] ?? '').join('|||')
      if (!map.has(dimKey)) {
        const entry: Record<string, string | number> = {}
        for (const d of rowDimensions) {
          entry[d] = row[d] ?? ''
        }
        for (const v of valueColumns) {
          entry[v] = 0
        }
        entry.__count = 0
        map.set(dimKey, entry)
      }
      const entry = map.get(dimKey)!
      entry.__count = (entry.__count as number) + 1
      for (const v of valueColumns) {
        const num = Number(row[v])
        if (aggMethod === 'sum' && !isNaN(num)) {
          entry[v] = (entry[v] as number) + num
        }
      }
    }
    offset = end

    if (offset < cachedRows.length) {
      if (typeof (self as any).requestIdleCallback === 'function') {
        ;(self as any).requestIdleCallback(processChunk)
      } else {
        setTimeout(processChunk, 0)
      }
    } else {
      finishAggregate(rowDimensions, valueColumns, aggMethod, map)
    }
  }

  processChunk()
}

function finishAggregate(
  rowDimensions: string[],
  valueColumns: string[],
  aggMethod: 'sum' | 'count',
  map: Map<string, Record<string, string | number>>
) {
  const aggHeaders = [
    ...rowDimensions,
    ...valueColumns.map((v) => `${v} (${aggMethod === 'sum' ? '求和' : '计数'})`),
  ]
  const aggRows: Record<string, string>[] = []
  for (const entry of map.values()) {
    const r: Record<string, string> = {}
    for (const d of rowDimensions) {
      r[d] = String(entry[d] ?? '')
    }
    for (const v of valueColumns) {
      r[`${v} (${aggMethod === 'sum' ? '求和' : '计数'})`] =
        aggMethod === 'sum' ? String(entry[v]) : String(entry.__count)
    }
    aggRows.push(r)
  }

  ctx.postMessage({
    type: 'aggregateResult',
    headers: aggHeaders,
    rows: aggRows,
  } satisfies WorkerOutgoing)
}

ctx.onmessage = async (e: MessageEvent<WorkerIncoming>) => {
  const msg = e.data
  if (msg.type === 'parse') {
    await parseCSV(msg.text)
  } else if (msg.type === 'aggregate') {
    aggregateChunked(msg)
  }
}
