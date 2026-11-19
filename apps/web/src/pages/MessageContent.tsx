import { App, Button, Modal, Space } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@chat/shared';
import { api, errorMessage } from '../services/api';
import { DownloadOutlined, FileTextOutlined, PictureOutlined } from '@ant-design/icons';

export function MessageContent({ item }: { item: ChatMessage }) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const active = useRef(true);
  const previewRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);
  function closePreview() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = undefined;
    setPreviewUrl(undefined);
  }
  async function preview() {
    setLoading(true);
    try {
      const { data } = await api.get<Blob>('/chat/messages/' + item.id + '/file', {
        responseType: 'blob',
      });
      if (!active.current) return;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = URL.createObjectURL(data);
      setPreviewUrl(previewRef.current);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      if (active.current) setLoading(false);
    }
  }
  async function download() {
    setLoading(true);
    let url: string | undefined;
    try {
      const { data } = await api.get<Blob>('/chat/messages/' + item.id + '/file', {
        responseType: 'blob',
      });
      if (!active.current) return;
      url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.fileName || '附件';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // 浏览器处理下载后再释放对象地址。
      const downloadUrl = url;
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      url = undefined;
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (active.current) setLoading(false);
    }
  }
  if (item.type === 'TEXT')
    return <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.content}</span>;
  return (
    <div className="attachment-message">
      <div className="attachment-summary">
        <span className="attachment-icon">
          {item.type === 'IMAGE' ? <PictureOutlined /> : <FileTextOutlined />}
        </span>
        <div>
          <strong>{item.fileName || item.content}</strong>
          <small>
            {item.type === 'IMAGE' ? '图片' : '文件'}
            {item.fileSize ? ' · ' + (item.fileSize / 1024).toFixed(1) + ' KB' : ''}
          </small>
        </div>
      </div>
      <Space>
        {item.type === 'IMAGE' && (
          <Button type="link" size="small" disabled={loading} onClick={() => void preview()}>
            预览图片
          </Button>
        )}
        <Button
          type="link"
          size="small"
          icon={<DownloadOutlined />}
          loading={loading}
          onClick={() => void download()}
        >
          下载文件
        </Button>
      </Space>
      <Modal
        open={!!previewUrl}
        title={item.fileName ?? '图片预览'}
        footer={null}
        onCancel={closePreview}
      >
        {previewUrl && (
          <img
            src={previewUrl}
            alt={item.fileName ?? '聊天图片'}
            style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: 'auto' }}
          />
        )}
      </Modal>
    </div>
  );
}
