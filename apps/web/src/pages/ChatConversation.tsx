import { Fragment, useEffect, useRef, useState } from 'react';
import { Alert, App, Avatar, Button, Input, Space, Spin, Tag, Typography, Upload } from 'antd';
import { PaperClipOutlined, SendOutlined, StarOutlined, TeamOutlined } from '@ant-design/icons';
import type { ChatMessage, RoomSummary } from '@chat/shared';
import SceneIllustration from '../components/SceneIllustration';
import { useChatSocket } from '../hooks/useChatSocket';
import { api, errorMessage } from '../services/api';
import { MessageContent } from './MessageContent';

const connectionLabels = {
  connecting: '连接中',
  syncing: '同步消息中',
  ready: '已连接',
  offline: '已断线',
  error: '同步失败',
};

export function ChatConversation({
  room,
  title,
  token,
  userId,
}: {
  room: RoomSummary;
  title: string;
  token: string;
  userId: number;
}) {
  const { message } = App.useApp();
  const {
    status,
    syncError,
    messages,
    hasOlder,
    loadingOlder,
    pending,
    sendText,
    loadOlder,
    mergeMessages,
    retryConnection,
    dismissPending,
  } = useChatSocket(room.id, token, userId);
  const ready = status === 'ready';
  const loading = status === 'connecting' || status === 'syncing';
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const pendingFile = useRef<{ file: File; clientMessageId: string } | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.at(-1)?.id]);

  function send() {
    if (sendText(draft)) setDraft('');
  }
  async function favorite(historyId: number) {
    try {
      await api.post('/favorites', { historyId });
      message.success('已收藏');
    } catch (error) {
      message.error(errorMessage(error));
    }
  }
  async function upload(file: File) {
    if (!ready || uploading) return false;
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      message.warning('请选择 10 MB 以内的非空文件');
      return false;
    }
    if (
      !pendingFile.current ||
      pendingFile.current.file.name !== file.name ||
      pendingFile.current.file.size !== file.size ||
      pendingFile.current.file.lastModified !== file.lastModified
    )
      pendingFile.current = { file, clientMessageId: crypto.randomUUID() };
    const data = new FormData();
    data.append('clientMessageId', pendingFile.current.clientMessageId);
    data.append('file', file);
    setUploading(true);
    try {
      const response = await api.post<ChatMessage>('/chat/rooms/' + room.id + '/files', data, {
        timeout: 60000,
      });
      pendingFile.current = undefined;
      mergeMessages([response.data]);
      message.success('附件已发送');
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
    return false;
  }
  return (
    <>
      <div className="conversation-header">
        <div className="conversation-identity">
          <Avatar
            shape="square"
            size={42}
            className={room.type === 'GROUP' ? 'group-avatar' : ''}
            src={
              room.type === 'DIRECT'
                ? room.members.find((member) => member.userId !== userId)?.user.avatar
                : undefined
            }
          >
            {room.type === 'GROUP' ? <TeamOutlined /> : title.slice(0, 1)}
          </Avatar>
          <div>
            <Typography.Text strong>
              {title}
              {room.type === 'GROUP' && (
                <span className="conversation-member-count">（{room._count.members}）</span>
              )}
            </Typography.Text>
            <p>{room.type === 'DIRECT' ? '好友私聊' : '群组会话'}</p>
          </div>
        </div>
        <Tag className="connection-tag" variant="filled" color={ready ? 'success' : 'default'}>
          <span className={'connection-dot' + (ready ? ' ready' : '')} />
          {connectionLabels[status]}
        </Tag>
      </div>
      {(status === 'offline' || status === 'error') && (
        <Alert
          type={status === 'error' ? 'error' : 'warning'}
          title={syncError ?? '实时连接已断开，正在尝试恢复'}
          action={
            <Button size="small" onClick={retryConnection}>
              重试连接
            </Button>
          }
        />
      )}
      <div className="message-list" aria-live="polite">
        {hasOlder && (
          <Button
            className="load-history"
            type="text"
            size="small"
            loading={loadingOlder}
            disabled={!ready}
            onClick={() =>
              void loadOlder().catch((error: unknown) => message.error(errorMessage(error)))
            }
          >
            加载更早消息
          </Button>
        )}
        {loading && <Spin />}
        {!loading && !messages.length && (
          <div className="first-message">
            <SceneIllustration kind="conversation" className="first-message-art" />
            <p>暂无消息，发送第一条消息吧</p>
          </div>
        )}
        {messages.map((item, index) => (
          <Fragment key={item.id}>
            {(index === 0 ||
              new Date(item.createdAt).toDateString() !==
                new Date(messages[index - 1].createdAt).toDateString()) && (
              <div className="message-date">
                <span>
                  {new Date(item.createdAt).toLocaleDateString('zh-CN', {
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
            )}
            <div className={'message-row ' + (item.senderId === userId ? 'mine' : '')}>
              <Avatar shape="square" size={36} src={item.sender.avatar}>
                {item.sender.nickname.slice(0, 1)}
              </Avatar>
              <div className="message-body">
                <div className="message-meta">
                  <span>{item.senderId === userId ? '我' : item.sender.nickname}</span>
                  <time dateTime={item.createdAt}>
                    {new Date(item.createdAt).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <div className="message-bubble">
                  <MessageContent item={item} />
                </div>
                <Button
                  type="text"
                  className="message-favorite"
                  aria-label="收藏消息"
                  title="收藏消息"
                  size="small"
                  icon={<StarOutlined />}
                  onClick={() => void favorite(item.id)}
                />
              </div>
            </div>
          </Fragment>
        ))}
        <div ref={bottomRef} />
      </div>
      {pending && (
        <Alert
          type={pending.status === 'sending' ? 'info' : 'warning'}
          title={pending.status === 'sending' ? '消息发送中' : pending.error}
          description={
            <Typography.Text ellipsis style={{ maxWidth: '100%' }}>
              {pending.content}
            </Typography.Text>
          }
          action={
            pending.status !== 'sending' && (
              <Space>
                <Button size="small" type="primary" disabled={!ready} onClick={() => sendText()}>
                  重试发送
                </Button>
                <Button size="small" onClick={dismissPending}>
                  移除提示
                </Button>
              </Space>
            )
          }
        />
      )}
      <div className="message-composer">
        <div className="composer-input">
          <div className="composer-toolbar">
            <Upload showUploadList={false} beforeUpload={upload} disabled={!ready || uploading}>
              <Button
                type="text"
                icon={<PaperClipOutlined />}
                disabled={!ready}
                loading={uploading}
              >
                文件 / 图片
              </Button>
            </Upload>
          </div>
          <Input.TextArea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="消息内容"
            placeholder="输入消息"
            maxLength={4000}
            autoSize={{ minRows: 2, maxRows: 4 }}
            onPressEnter={(event) => {
              if (!event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
          />
          <div className="composer-bottom">
            <span className="composer-hint">Enter 发送 · Shift + Enter 换行</span>
            <Button
              type="primary"
              icon={<SendOutlined />}
              className="send-button"
              disabled={!ready || !draft.trim() || !!pending}
              loading={pending?.status === 'sending'}
              onClick={send}
            >
              发送
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
