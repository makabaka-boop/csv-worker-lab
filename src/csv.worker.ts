type ColumnType = 'string' | 'number' | 'date'

interface ColumnInfo {
  name: string
  type: ColumnType
}

interface PivotConfig {
  rows: string[]
  values: {
    column: string
    aggregation: 'sum' | 'count'
  }[]
}

interface PivotResult {
  headers: string[]
  rows: Record<string, any>[]
}

interface WorkerMessage {
  type: 'parse' | 'pivot'
  payload: any
}

function detectDelimiter(text: string): string {
  const delimiters = [',', ';', '\t', '|']
  const firstLine = text.split('\n')[0]
  
  let bestDelimiter = ','
  let maxCount = 0

  for (const delimiter of delimiters) {
    const count = firstLine.split(delimiter).length
    if (count > maxCount) {
      maxCount = count
      bestDelimiter = delimiter
    }
  }

  return bestDelimiter
}

function inferColumnType(values: string[]): ColumnType {
  let isNumber = true
  let isDate = true

  for (const value of values.slice(0, Math.min(values.length, 100))) {
    if (value === null || value === undefined || value === '') continue

    if (isNumber) {
      const num = Number(value)
      isNumber = !isNaN(num) && !isNaN(parseFloat(value))
    }

    if (isDate) {
      const date = new Date(value)
      isDate = !isNaN(date.getTime()) && (value.includes('-') || value.includes('/') || !!value.match(/\d{4}/))
    }
  }

  if (isNumber) return 'number'
  if (isDate) return 'date'
  return 'string'
}

function parseValue(value: string, type: ColumnType): any {
  if (value === null || value === undefined || value === '') {
    return null
  }
  
  if (type === 'number') {
    const num = Number(value)
    return isNaN(num) ? null : num
  }
  
  if (type === 'date') {
    const date = new Date(value)
    return isNaN(date.getTime()) ? value : date.toISOString()
  }
  
  return value
}

function parseCSV(text: string): {
  headers: ColumnInfo[]
  rows: Record<string, any>[]
  delimiter: string
  fileSize: number
  rowCount: number
} {
  const delimiter = detectDelimiter(text)
  const lines = text.split('\n').filter(line => line.trim())
  
  if (lines.length < 2) {
    throw new Error('CSV 文件格式错误或为空')
  }

  const headerLine = lines[0]
  const headerNames = headerLine.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''))
  const dataLines = lines.slice(1)

  const columns: ColumnInfo[] = headerNames.map((name, index) => {
    const columnValues = dataLines.map(line => {
      const cells = line.split(delimiter)
      return cells[index]?.trim().replace(/^"|"$/g, '') || ''
    })
    return {
      name,
      type: inferColumnType(columnValues)
    }
  })

  const rows: Record<string, any>[] = dataLines.map(line => {
    const cells = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''))
    const row: Record<string, any> = {}
    
    columns.forEach((col, index) => {
      row[col.name] = parseValue(cells[index] || '', col.type)
    })
    
    return row
  })

  return {
    headers: columns,
    rows,
    delimiter,
    fileSize: text.length,
    rowCount: rows.length
  }
}

function performPivot(data: {
  rows: any[]
  config: PivotConfig
}): PivotResult {
  const { rows, config } = data

  const grouped = new Map<string, Record<string, any>>()

  for (const row of rows) {
    const groupKey = config.rows.map(r => String(row[r])).join('|')

    if (!grouped.has(groupKey)) {
      const groupRow: Record<string, any> = {}
      config.rows.forEach(r => {
        groupRow[r] = row[r]
      })
      
      config.values.forEach(v => {
        const key = `${v.column}_${v.aggregation}`
        if (v.aggregation === 'sum') {
          groupRow[key] = 0
        } else {
          groupRow[key] = 0
        }
      })
      
      grouped.set(groupKey, groupRow)
    }

    const group = grouped.get(groupKey)!

    config.values.forEach(v => {
      const key = `${v.column}_${v.aggregation}`
      
      if (v.aggregation === 'sum' && row[v.column] !== null) {
        group[key] = (group[key] || 0) + (Number(row[v.column]) || 0)
      } else if (v.aggregation === 'count') {
        group[key] = (group[key] || 0) + 1
      }
    })
  }

  const pivotRows = Array.from(grouped.values())

  const pivotHeaders: string[] = [
    ...config.rows,
    ...config.values.map(v => `${v.column} (${v.aggregation === 'sum' ? '求和' : '计数'})`)
  ]

  const mappedRows = pivotRows.map(row => {
    const mapped: Record<string, any> = {}
    config.rows.forEach(r => {
      mapped[r] = row[r]
    })
    config.values.forEach(v => {
      const originalKey = `${v.column}_${v.aggregation}`
      const newKey = `${v.column} (${v.aggregation === 'sum' ? '求和' : '计数'})`
      mapped[newKey] = row[originalKey]
    })
    return mapped
  })

  return {
    headers: pivotHeaders,
    rows: mappedRows
  }
}

self.addEventListener('message', (e) => {
  const message = e.data as WorkerMessage

  switch (message.type) {
    case 'parse':
      self.postMessage({
        type: 'parseProgress',
        payload: {
          progress: 10
        }
      })

      try {
        const result = parseCSV(message.payload.text)
        
        self.postMessage({
          type: 'parseComplete',
          payload: result
        })
      } catch (error: any) {
        self.postMessage({
          type: 'parseError',
          payload: {
            message: error.message || '解析失败'
          }
        })
      }
      break

    case 'pivot':
      try {
        const result = performPivot(message.payload)
        self.postMessage({
          type: 'pivotComplete',
          payload: result
        })
      } catch (error: any) {
        self.postMessage({
          type: 'pivotError',
          payload: {
            message: error.message || '透视失败'
          }
        })
      }
      break
  }
})
