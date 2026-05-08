import { useCallback } from 'react'
import { Button, Space, Tooltip, Typography } from 'antd'
import { DownloadOutlined, TableOutlined, BarChartOutlined } from '@ant-design/icons'
import { exportCSV } from '../utils/helpers'

interface Props {
  headers: string[]
  rows: Record<string, string>[]
  aggResult: { headers: string[]; rows: Record<string, string>[] } | null
  viewMode: 'table' | 'pivot'
  onViewModeChange: (m: 'table' | 'pivot') => void
}

export default function Toolbar({ headers, rows, aggResult, viewMode, onViewModeChange }: Props) {
  const handleExport = useCallback(() => {
    if (viewMode === 'pivot' && aggResult) {
      exportCSV(aggResult.headers, aggResult.rows)
    } else {
      exportCSV(headers, rows)
    }
  }, [headers, rows, aggResult, viewMode])

  return (
    <Space style={{ marginBottom: 12 }}>
      <Tooltip title="数据表视图">
        <Button
          icon={<TableOutlined />}
          type={viewMode === 'table' ? 'primary' : 'default'}
          onClick={() => onViewModeChange('table')}
        >
          数据表
        </Button>
      </Tooltip>
      <Tooltip title="透视汇总视图">
        <Button
          icon={<BarChartOutlined />}
          type={viewMode === 'pivot' ? 'primary' : 'default'}
          onClick={() => onViewModeChange('pivot')}
        >
          透视
        </Button>
      </Tooltip>
      <Button icon={<DownloadOutlined />} onClick={handleExport}>
        导出 CSV
      </Button>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        导出当前{viewMode === 'pivot' && aggResult ? '透视' : '筛选后'}的结果
      </Typography.Text>
    </Space>
  )
}
