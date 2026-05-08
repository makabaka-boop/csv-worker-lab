import { useState, useCallback, useMemo } from 'react'
import { Card, Select, Tag, Space, Button, Typography, Table as AntTable, Empty } from 'antd'
import { SwapOutlined, BarChartOutlined } from '@ant-design/icons'
import type { ColumnMeta } from '../types'

interface Props {
  headers: string[]
  columnMetas: ColumnMeta[]
  onAggregate: (rowDimensions: string[], valueColumns: string[], method: 'sum' | 'count') => void
  aggResult: { headers: string[]; rows: Record<string, string>[] } | null
}

export default function PivotPanel({ headers, columnMetas, onAggregate, aggResult }: Props) {
  const [rowDims, setRowDims] = useState<string[]>([])
  const [valueCols, setValueCols] = useState<string[]>([])
  const [method, setMethod] = useState<'sum' | 'count'>('sum')

  const metaMap = useMemo(() => {
    const m = new Map<string, ColumnMeta>()
    columnMetas.forEach((c) => m.set(c.key, c))
    return m
  }, [columnMetas])

  const dimOptions = headers.map((h) => ({ label: h, value: h }))
  const valOptions = headers.map((h) => ({
    label: `${h} (${metaMap.get(h)?.type === 'number' ? '数字' : metaMap.get(h)?.type === 'date' ? '日期' : '文本'})`,
    value: h,
  }))

  const handleAgg = useCallback(() => {
    if (rowDims.length === 0) return
    onAggregate(rowDims, valueCols, method)
  }, [rowDims, valueCols, method, onAggregate])

  const aggColumns = useMemo(() => {
    if (!aggResult) return []
    return aggResult.headers.map((h) => ({
      title: h,
      dataIndex: h,
      key: h,
      ellipsis: true,
    }))
  }, [aggResult])

  return (
    <Card
      title={
        <Space>
          <BarChartOutlined />
          透视汇总
        </Space>
      }
      size="small"
      style={{ marginTop: 16 }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <Typography.Text strong>行维度</Typography.Text>
          <Select
            mode="multiple"
            placeholder="选择行维度（拖拽排序占位）"
            value={rowDims}
            onChange={setRowDims}
            options={dimOptions}
            style={{ width: '100%', marginTop: 4 }}
            maxTagCount={5}
          />
        </div>

        <div>
          <Typography.Text strong>数值列</Typography.Text>
          <Select
            mode="multiple"
            placeholder="选择数值列"
            value={valueCols}
            onChange={setValueCols}
            options={valOptions}
            style={{ width: '100%', marginTop: 4 }}
            maxTagCount={5}
          />
        </div>

        <div>
          <Typography.Text strong>聚合方式</Typography.Text>
          <Select
            value={method}
            onChange={setMethod}
            style={{ width: 160, marginTop: 4, display: 'block' }}
            options={[
              { label: '求和 (SUM)', value: 'sum' },
              { label: '计数 (COUNT)', value: 'count' },
            ]}
            suffixIcon={<SwapOutlined />}
          />
        </div>

        <Button type="primary" onClick={handleAgg} disabled={rowDims.length === 0} block>
          生成透视
        </Button>

        {rowDims.length > 0 && (
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              行维度：
            </Typography.Text>
            {rowDims.map((d) => (
              <Tag key={d} color="blue" style={{ margin: 2 }}>
                {d}
              </Tag>
            ))}
            {valueCols.length > 0 && (
              <>
                <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                  数值：
                </Typography.Text>
                {valueCols.map((v) => (
                  <Tag key={v} color="orange" style={{ margin: 2 }}>
                    {v}
                  </Tag>
                ))}
              </>
            )}
          </div>
        )}

        {aggResult ? (
          <AntTable
            columns={aggColumns}
            dataSource={aggResult.rows.map((r, i) => ({ ...r, _key: i }))}
            rowKey="_key"
            size="small"
            pagination={{ pageSize: 50, size: 'small' }}
            scroll={{ x: 'max-content' }}
          />
        ) : (
          <Empty description="选择维度后点击「生成透视」" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Space>
    </Card>
  )
}
