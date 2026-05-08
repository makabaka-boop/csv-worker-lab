import { useState, useRef, useCallback } from 'react'
import { Layout, Typography, Card, message } from 'antd'
import CsvUploader from './components/CsvUploader'
import ParseProgressBar from './components/ParseProgress'
import DataTable from './components/DataTable'
import PivotPanel from './components/PivotPanel'
import Toolbar from './components/Toolbar'
import type { ColumnMeta, WorkerOutgoing, AggregateRequest } from './types'

const { Header, Content } = Layout

type AppStage = 'idle' | 'parsing' | 'done'

export default function App() {
  const [stage, setStage] = useState<AppStage>('idle')
  const [fileName, setFileName] = useState('')
  const [progress, setProgress] = useState(0)
  const [rowsParsed, setRowsParsed] = useState(0)
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [columnMetas, setColumnMetas] = useState<ColumnMeta[]>([])
  const [delimiter, setDelimiter] = useState(',')
  const [totalRows, setTotalRows] = useState(0)
  const [viewMode, setViewMode] = useState<'table' | 'pivot'>('table')
  const [aggResult, setAggResult] = useState<{
    headers: string[]
    rows: Record<string, string>[]
  } | null>(null)

  const workerRef = useRef<Worker | null>(null)

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current
    const w = new Worker(new URL('./workers/csv.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<WorkerOutgoing>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        setProgress(msg.progress)
        setRowsParsed(msg.rowsParsed)
      } else if (msg.type === 'complete') {
        setHeaders(msg.headers)
        setRows(msg.rows)
        setColumnMetas(msg.columnMetas)
        setDelimiter(msg.delimiter)
        setTotalRows(msg.totalRows)
        setProgress(100)
        setStage('done')
        message.success(`解析完成，共 ${msg.totalRows.toLocaleString()} 行`)
      } else if (msg.type === 'aggregateResult') {
        setAggResult({ headers: msg.headers, rows: msg.rows })
      }
    }
    w.onerror = (err) => {
      console.error('Worker error:', err)
      message.error('Worker 执行出错')
      setStage('idle')
    }
    workerRef.current = w
    return w
  }, [])

  const handleFileLoaded = useCallback(
    (text: string, name: string) => {
      setFileName(name)
      setStage('parsing')
      setProgress(0)
      setRowsParsed(0)
      setAggResult(null)
      setViewMode('table')
      const w = getWorker()
      w.postMessage({ type: 'parse', text })
    },
    [getWorker]
  )

  const handleAggregate = useCallback(
    (rowDimensions: string[], valueColumns: string[], aggMethod: 'sum' | 'count') => {
      const w = getWorker()
      const req: AggregateRequest = {
        type: 'aggregate',
        rowDimensions,
        valueColumns,
        aggMethod,
      }
      w.postMessage(req)
    },
    [getWorker]
  )

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}>
        <Typography.Title level={3} style={{ margin: '12px 0' }}>
          📊 CSV 分析页
        </Typography.Title>
      </Header>
      <Content style={{ padding: 24, maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        {stage === 'idle' && (
          <Card>
            <CsvUploader onFileLoaded={handleFileLoaded} disabled={false} />
          </Card>
        )}

        {stage === 'parsing' && (
          <Card>
            <ParseProgressBar progress={progress} rowsParsed={rowsParsed} fileName={fileName} />
          </Card>
        )}

        {stage === 'done' && (
          <>
            <Toolbar
              headers={headers}
              rows={rows}
              aggResult={aggResult}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />

            {viewMode === 'table' && (
              <Card>
                <DataTable
                  headers={headers}
                  rows={rows}
                  columnMetas={columnMetas}
                  totalRows={totalRows}
                  delimiter={delimiter}
                />
              </Card>
            )}

            {viewMode === 'pivot' && (
              <PivotPanel
                headers={headers}
                columnMetas={columnMetas}
                onAggregate={handleAggregate}
                aggResult={aggResult}
              />
            )}

            <div style={{ marginTop: 16 }}>
              <CsvUploader onFileLoaded={handleFileLoaded} disabled={false} compact />
            </div>
          </>
        )}
      </Content>
    </Layout>
  )
}
