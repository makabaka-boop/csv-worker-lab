import { useState, useCallback, useMemo, useRef } from 'react'
import {
  Layout,
  Card,
  Upload,
  Button,
  Progress,
  Tag,
  Space,
  Typography,
  Alert,
  Row,
  Col,
  message,
  Modal,
  Input,
  Select,
  Statistic
} from 'antd'
import {
  UploadOutlined,
  DownloadOutlined,
  ReloadOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import type { UploadProps } from 'antd'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef
} from '@tanstack/react-table'
import type {
  CSVParseResult,
  PivotConfig,
  ColumnInfo,
  AggregationType,
  PivotResult
} from './types'
import { MAX_FILE_SIZE } from './types'

const { Header, Content } = Layout
const { Title, Text } = Typography
const { Option } = Select

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getColumnTypeColor(type: string): string {
  switch (type) {
    case 'number':
      return 'blue'
    case 'date':
      return 'green'
    case 'string':
    default:
      return 'default'
  }
}

function getColumnTypeName(type: string): string {
  switch (type) {
    case 'number':
      return '数字'
    case 'date':
      return '日期'
    case 'string':
    default:
      return '字符串'
  }
}

function exportToCSV(headers: string[], rows: Record<string, any>[], filename: string) {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => 
      headers.map(header => {
        const value = row[header]
        if (value === null || value === undefined) return ''
        const strValue = String(value)
        if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
          return `"${strValue.replace(/"/g, '""')}"`
        }
        return strValue
      }).join(',')
    )
  ].join('\n')

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function App() {
  const [data, setData] = useState<CSVParseResult | null>(null)
  const [progress, setProgress] = useState<number>(0)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [pivotConfig, setPivotConfig] = useState<PivotConfig>({
    rows: [],
    values: []
  })
  const [pivotResult, setPivotResult] = useState<PivotResult | null>(null)
  const [showPivotModal, setShowPivotModal] = useState(false)
  
  const workerRef = useRef<Worker | null>(null)

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./csv.worker.ts', import.meta.url))
    }
    return workerRef.current
  }, [])

  const handleFileUpload: UploadProps['beforeUpload'] = useCallback((file) => {
    if (file.size > MAX_FILE_SIZE) {
      message.error(`文件过大，最大支持 ${formatFileSize(MAX_FILE_SIZE)}`)
      return false
    }

    setError(null)
    setIsProcessing(true)
    setProgress(0)
    setData(null)
    setPivotResult(null)
    setPivotConfig({ rows: [], values: [] })

    const reader = new FileReader()
    
    reader.onload = (e) => {
      const text = e.target?.result as string
      const worker = getWorker()

      worker.onmessage = (event) => {
        const message = event.data

        switch (message.type) {
          case 'parseProgress':
            setProgress(message.payload.progress)
            break

          case 'parseComplete':
            setData(message.payload)
            setProgress(100)
            setIsProcessing(false)
            message.success('解析完成')
            break

          case 'parseError':
            setError(message.payload.message)
            setIsProcessing(false)
            setProgress(0)
            break
        }
      }

      worker.postMessage({
        type: 'parse',
        payload: {
          text: text
        }
      })
    }

    reader.onerror = () => {
      setError('文件读取失败')
      setIsProcessing(false)
    }

    reader.readAsText(file, 'UTF-8')

    return false
  }, [getWorker])

  const tableColumns = useMemo<ColumnDef<Record<string, any>, any>[]>(() => {
    if (!data) return []

    return data.headers.map(header => ({
      accessorKey: header.name,
      header: () => (
        <Space>
          <span>{header.name}</span>
          <Tag color={getColumnTypeColor(header.type)}>
            {getColumnTypeName(header.type)}
          </Tag>
        </Space>
      ),
      cell: info => {
        const value = info.getValue()
        if (value === null || value === undefined) return <span style={{ color: '#999' }}>-</span>
        return String(value)
      },
      enableSorting: true,
      enableColumnFilter: true
    }))
  }, [data])

  const table = useReactTable({
    data: data?.rows || [],
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 20
      }
    }
  })

  const handlePivot = useCallback(() => {
    if (!data || pivotConfig.rows.length === 0 || pivotConfig.values.length === 0) {
      message.warning('请至少选择一个行维度和一个值列')
      return
    }

    setIsProcessing(true)
    
    const worker = getWorker()

    worker.onmessage = (event) => {
      const message = event.data

      switch (message.type) {
        case 'pivotComplete':
          setPivotResult(message.payload)
          setShowPivotModal(false)
          setIsProcessing(false)
          break

        case 'pivotError':
          message.error(message.payload.message)
          setIsProcessing(false)
          break
      }
    }

    worker.postMessage({
      type: 'pivot',
      payload: {
        rows: data.rows,
        config: pivotConfig
      }
    })
  }, [data, pivotConfig, getWorker])

  const handleAddPivotValue = useCallback((column: string) => {
    const columnInfo = data?.headers.find(h => h.name === column)
    const aggregation: AggregationType = columnInfo?.type === 'number' ? 'sum' : 'count'
    
    setPivotConfig(prev => ({
      ...prev,
      values: [...prev.values, { column, aggregation }]
    }))
  }, [data])

  const handleRemovePivotRow = useCallback((column: string) => {
    setPivotConfig(prev => ({
      ...prev,
      rows: prev.rows.filter(r => r !== column)
    }))
  }, [])

  const handleRemovePivotValue = useCallback((index: number) => {
    setPivotConfig(prev => ({
      ...prev,
      values: prev.values.filter((_, i) => i !== index)
    }))
  }, [])

  const handleUpdatePivotAggregation = useCallback((index: number, aggregation: AggregationType) => {
    setPivotConfig(prev => ({
      ...prev,
      values: prev.values.map((v, i) => i === index ? { ...v, aggregation } : v)
    }))
  }, [])

  const handleClearPivot = useCallback(() => {
    setPivotResult(null)
    setPivotConfig({ rows: [], values: [] })
  }, [])

  const availableColumns = useMemo(() => {
    if (!data) return []
    const usedInRows = new Set(pivotConfig.rows)
    const usedInValues = new Set(pivotConfig.values.map(v => v.column))
    return data.headers.filter(h => !usedInRows.has(h.name) && !usedInValues.has(h.name))
  }, [data, pivotConfig])

  const handleDragStart = useCallback((e: React.DragEvent, column: string) => {
    e.dataTransfer.setData('column', column)
  }, [])

  const handleDropToRows = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const column = e.dataTransfer.getData('column')
    if (column && !pivotConfig.rows.includes(column)) {
      setPivotConfig(prev => ({
        ...prev,
        rows: [...prev.rows, column]
      }))
    }
  }, [pivotConfig.rows])

  const handleDropToValues = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const column = e.dataTransfer.getData('column')
    if (column && !pivotConfig.values.some(v => v.column === column)) {
      handleAddPivotValue(column)
    }
  }, [pivotConfig.values, handleAddPivotValue])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const pivotTableColumns = useMemo<ColumnDef<Record<string, any>, any>[]>(() => {
    if (!pivotResult) return []

    return pivotResult.headers.map(header => ({
      accessorKey: header,
      header: header,
      cell: info => {
        const value = info.getValue()
        if (value === null || value === undefined) return <span style={{ color: '#999' }}>-</span>
        return typeof value === 'number' ? value.toLocaleString() : String(value)
      }
    }))
  }, [pivotResult])

  const pivotTable = useReactTable({
    data: pivotResult?.rows || [],
    columns: pivotTableColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 20
      }
    }
  })

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#001529', padding: '0 24px' }}>
        <Title level={3} style={{ color: 'white', margin: 0, lineHeight: '64px' }}>
          CSV Worker Lab
        </Title>
      </Header>
      <Content style={{ padding: '24px' }}>
        {error && (
          <Alert
            message="错误"
            description={error}
            type="error"
            showIcon
            closable
            style={{ marginBottom: '24px' }}
            onClose={() => setError(null)}
          />
        )}

        {isProcessing && (
          <Card style={{ marginBottom: '24px' }}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text strong>正在处理文件...</Text>
              <Progress percent={progress} />
            </Space>
          </Card>
        )}

        {!data && !isProcessing && (
          <Card>
            <Upload.Dragger
              beforeUpload={handleFileUpload}
              multiple={false}
              accept=".csv"
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽 CSV 文件到此处上传</p>
              <p className="ant-upload-hint">
                支持最大 {formatFileSize(MAX_FILE_SIZE)}，将使用 Web Worker 进行解析
              </p>
            </Upload.Dragger>
          </Card>
        )}

        {data && !isProcessing && (
          <>
            <Card style={{ marginBottom: '24px' }}>
              <Row gutter={[16, 16]} align="middle">
                <Col span={6}>
                  <Statistic
                    title="总行数"
                    value={data.rowCount}
                    prefix={<FileTextOutlined />}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="总列数"
                    value={data.headers.length}
                    prefix={<FileTextOutlined />}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="文件大小"
                    value={formatFileSize(data.fileSize)}
                    prefix={<FileTextOutlined />}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="分隔符"
                    value={data.delimiter === '\t' ? 'Tab' : data.delimiter}
                    prefix={<FileTextOutlined />}
                  />
                </Col>
              </Row>
              <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
                <Col>
                  <Space>
                    <Button
                      icon={<DownloadOutlined />}
                      onClick={() => {
                        const headers = data.headers.map(h => h.name)
                        exportToCSV(headers, data.rows, 'export.csv')
                      }}
                    >
                      导出原始数据
                    </Button>
                    <Button
                      icon={<DownloadOutlined />}
                      onClick={() => setShowPivotModal(true)}
                      disabled={data.rowCount === 0}
                    >
                      创建透视表
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => {
                        setData(null)
                        setPivotResult(null)
                        setPivotConfig({ rows: [], values: [] })
                      }}
                    >
                      重新上传
                    </Button>
                  </Space>
                </Col>
              </Row>
            </Card>

            {pivotResult && (
              <Card title="透视表结果" style={{ marginBottom: '24px' }}>
                <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
                  <Col>
                    <Button
                      icon={<DownloadOutlined />}
                      onClick={() => {
                        exportToCSV(pivotResult.headers, pivotResult.rows, 'pivot_export.csv')
                      }}
                    >
                      导出透视表
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={handleClearPivot}
                      style={{ marginLeft: '8px' }}
                    >
                      清除透视表
                    </Button>
                  </Col>
                </Row>
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      {pivotTable.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                          {headerGroup.headers.map(header => (
                            <th
                              key={header.id}
                              style={{
                                border: '1px solid #d9d9d9',
                                padding: '12px',
                                background: '#fafafa',
                                textAlign: 'left',
                                fontWeight: 'bold'
                              }}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                            </th>
                          ))}
                        </tr>
                      ))}
                    </thead>
                    <tbody>
                      {pivotTable.getRowModel().rows.map(row => (
                        <tr key={row.id}>
                          {row.getVisibleCells().map(cell => (
                            <td
                              key={cell.id}
                              style={{
                                border: '1px solid #d9d9d9',
                                padding: '12px'
                              }}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Button
                    onClick={() => pivotTable.previousPage()}
                    disabled={!pivotTable.getCanPreviousPage()}
                  >
                    上一页
                  </Button>
                  <Text>
                    第 {pivotTable.getState().pagination.pageIndex + 1} 页 / 共 {pivotTable.getPageCount()} 页
                  </Text>
                  <Button
                    onClick={() => pivotTable.nextPage()}
                    disabled={!pivotTable.getCanNextPage()}
                  >
                    下一页
                  </Button>
                  <Select
                    value={pivotTable.getState().pagination.pageSize}
                    onChange={value => {
                      pivotTable.setPageSize(value)
                    }}
                    style={{ width: '120px' }}
                  >
                    {[10, 20, 50, 100].map(pageSize => (
                      <Option key={pageSize} value={pageSize}>
                        {pageSize} 条/页
                      </Option>
                    ))}
                  </Select>
                </div>
              </Card>
            )}

            <Card title="数据表格">
              <div style={{ marginBottom: '16px' }}>
                <Text type="secondary">
                  提示：点击列标题可以排序，在搜索框中输入可以筛选数据
                </Text>
              </div>
              <div style={{ overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    {table.getHeaderGroups().map(headerGroup => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map(header => (
                          <th
                            key={header.id}
                            style={{
                              border: '1px solid #d9d9d9',
                              padding: '12px',
                              background: '#fafafa',
                              textAlign: 'left'
                            }}
                          >
                            <div
                              style={{
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                              {{
                                asc: ' 🔼',
                                desc: ' 🔽'
                              }[header.column.getIsSorted() as string] || null}
                            </div>
                            {header.column.getCanFilter() && (
                              <div style={{ marginTop: '8px' }}>
                                <Input
                                  placeholder="筛选..."
                                  value={(header.column.getFilterValue() as string) || ''}
                                  onChange={e => header.column.setFilterValue(e.target.value)}
                                  size="small"
                                />
                              </div>
                            )}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map(row => (
                      <tr key={row.id}>
                        {row.getVisibleCells().map(cell => (
                          <td
                            key={cell.id}
                            style={{
                              border: '1px solid #d9d9d9',
                              padding: '12px'
                            }}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  上一页
                </Button>
                <Text>
                  第 {table.getState().pagination.pageIndex + 1} 页 / 共 {table.getPageCount()} 页
                </Text>
                <Button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  下一页
                </Button>
                <Select
                  value={table.getState().pagination.pageSize}
                  onChange={value => {
                    table.setPageSize(value)
                  }}
                  style={{ width: '120px' }}
                >
                  {[10, 20, 50, 100].map(pageSize => (
                    <Option key={pageSize} value={pageSize}>
                      {pageSize} 条/页
                    </Option>
                  ))}
                </Select>
              </div>
            </Card>
          </>
        )}

        <Modal
          title="创建透视表"
          open={showPivotModal}
          onCancel={() => setShowPivotModal(false)}
          onOk={handlePivot}
          confirmLoading={isProcessing}
          width={800}
        >
          {data && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <Text strong>可用列（拖拽到下方区域）：</Text>
                <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {availableColumns.map(column => (
                    <Tag
                      key={column.name}
                      draggable
                      onDragStart={(e) => handleDragStart(e, column.name)}
                      color={getColumnTypeColor(column.type)}
                      className="column-tag"
                    >
                      {column.name}
                      <Text type="secondary" style={{ marginLeft: '4px', fontSize: '10px' }}>
                        ({getColumnTypeName(column.type)})
                      </Text>
                    </Tag>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <Text strong>行维度：</Text>
                <div
                  className={`pivot-zone ${pivotConfig.rows.length > 0 ? 'has-items' : ''}`}
                  onDrop={handleDropToRows}
                  onDragOver={handleDragOver}
                >
                  {pivotConfig.rows.length === 0 ? (
                    <span className="pivot-zone-title">将列拖拽到此处作为行维度</span>
                  ) : (
                    pivotConfig.rows.map(column => (
                      <Tag
                        key={column}
                        color="blue"
                        closable
                        onClose={() => handleRemovePivotRow(column)}
                      >
                        {column}
                      </Tag>
                    ))
                  )}
                </div>
              </div>

              <div>
                <Text strong>值列：</Text>
                <div
                  className={`pivot-zone ${pivotConfig.values.length > 0 ? 'has-items' : ''}`}
                  onDrop={handleDropToValues}
                  onDragOver={handleDragOver}
                >
                  {pivotConfig.values.length === 0 ? (
                    <span className="pivot-zone-title">将列拖拽到此处作为值（数值列默认求和，其他列计数）</span>
                  ) : (
                    pivotConfig.values.map((value, index) => (
                      <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Tag color="green" closable onClose={() => handleRemovePivotValue(index)}>
                          {value.column}
                        </Tag>
                        <Select
                          value={value.aggregation}
                          onChange={(agg) => handleUpdatePivotAggregation(index, agg)}
                          size="small"
                          style={{ width: '80px' }}
                        >
                          <Option value="sum">求和</Option>
                          <Option value="count">计数</Option>
                        </Select>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </Modal>
      </Content>
    </Layout>
  )
}

export default App
