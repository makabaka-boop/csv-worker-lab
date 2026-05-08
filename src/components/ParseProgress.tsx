import { Progress, Typography } from 'antd'

interface Props {
  progress: number
  rowsParsed: number
  fileName: string
}

export default function ParseProgress({ progress, rowsParsed, fileName }: Props) {
  return (
    <div style={{ padding: '24px 0' }}>
      <Typography.Text>
        正在解析 <strong>{fileName}</strong> …
      </Typography.Text>
      <Progress percent={progress} status="active" style={{ marginTop: 8 }} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        已解析 {rowsParsed.toLocaleString()} 行
      </Typography.Text>
    </div>
  )
}
