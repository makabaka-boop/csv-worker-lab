import { Upload, message, Button } from 'antd'
import { InboxOutlined, UploadOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { useCallback } from 'react'

const MAX_SIZE_MB = 100
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.csv', '.tsv', '.txt']

function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))
}

interface Props {
  onFileLoaded: (text: string, fileName: string) => void
  disabled: boolean
  compact?: boolean
}

export default function CsvUploader({ onFileLoaded, disabled, compact }: Props) {
  const beforeUpload = useCallback(
    (file: File) => {
      if (!isAllowedFile(file)) {
        message.error(`仅支持 ${ALLOWED_EXTENSIONS.join(' / ')} 格式的文件`)
        return Upload.LIST_IGNORE
      }
      if (file.size > MAX_SIZE_BYTES) {
        message.error(`文件大小超过 ${MAX_SIZE_MB}MB 上限，请选择更小的文件`)
        return Upload.LIST_IGNORE
      }
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        onFileLoaded(text, file.name)
      }
      reader.readAsText(file, 'utf-8')
      return false
    },
    [onFileLoaded]
  )

  const uploadProps: UploadProps = {
    beforeUpload,
    showUploadList: false,
    accept: '.csv,.tsv,.txt',
    disabled,
    multiple: false,
  }

  if (compact) {
    return (
      <Upload {...uploadProps}>
        <Button icon={<UploadOutlined />} disabled={disabled}>
          重新上传 CSV
        </Button>
      </Upload>
    )
  }

  return (
    <Upload.Dragger {...uploadProps} style={{ padding: '24px 16px' }}>
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">点击或拖拽 CSV 文件到此处上传</p>
      <p className="ant-upload-hint">
        支持 .csv / .tsv / .txt，文件大小上限 {MAX_SIZE_MB}MB
      </p>
    </Upload.Dragger>
  )
}
