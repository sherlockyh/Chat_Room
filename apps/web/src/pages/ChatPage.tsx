import { useEffect, useState } from 'react';
import { Alert, Avatar, Button, Empty, Input, List, Segmented, Select, Spin } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { RoomSummary } from '@chat/shared';
import { useAuth } from '../auth/AuthProvider';
import { usePagedData } from '../hooks/usePagedData';
import { api, errorMessage } from '../services/api';
import axios from 'axios';
import { ChatConversation } from './ChatConversation';
import SceneIllustration from '../components/SceneIllustration';
import ListPagination from '../components/ListPagination';

export default function ChatPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const rooms = usePagedData<RoomSummary>('/chatrooms', 12);
  const [searchParams, setSearchParams] = useSearchParams();
  const roomId = Number(searchParams.get('roomId')) || undefined;
  const [roomDetail, setRoomDetail] = useState<{
    id: number;
    data?: RoomSummary;
    error?: string;
  }>();
  const [detailVersion, setDetailVersion] = useState(0);
  const [roomSearch, setRoomSearch] = useState('');
  const [roomKind, setRoomKind] = useState('ALL');
  const selectedId = roomId ?? rooms.data?.[0]?.id;
  const listedRoom = rooms.data?.find((room) => room.id === selectedId);
  const detail = roomDetail?.id === roomId ? roomDetail : undefined;
  const activeRoom = listedRoom ?? detail?.data;
  const availableRooms =
    detail?.data && !listedRoom ? [detail.data, ...(rooms.data ?? [])] : rooms.data;
  const roomTitle = (room: RoomSummary) =>
    room.type === 'DIRECT'
      ? (room.members.find((member) => member.userId !== session?.user.id)?.user.nickname ??
        room.name)
      : room.name;
  const visibleRooms = availableRooms?.filter(
    (room) =>
      (roomKind === 'ALL' || room.type === roomKind) &&
      roomTitle(room).toLocaleLowerCase().includes(roomSearch.trim().toLocaleLowerCase()),
  );
  function selectRoom(id: number) {
    setSearchParams({ roomId: String(id) });
  }
  useEffect(() => {
    if (!roomId || listedRoom || rooms.loading) return;
    const controller = new AbortController();
    // 从管理列表或收藏进入较早的会话时，按 ID 加载，不依赖侧栏当前内容。
    api
      .get<RoomSummary>('/chatrooms/' + roomId, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setRoomDetail({ id: roomId, data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !axios.isCancel(error)) {
          setRoomDetail({ id: roomId, error: errorMessage(error) });
        }
      });
    return () => controller.abort();
  }, [roomId, listedRoom, rooms.loading, detailVersion]);
  return (
    <div className="chat-workspace">
      <aside className="room-list">
        <div className="room-list-title">
          <div>
            <h1>
              会话 <span className="room-count">本页 {rooms.data?.length ?? '—'}</span>
            </h1>
          </div>
          <div className="room-list-actions">
            <Button
              type="text"
              aria-label="刷新会话"
              icon={<ReloadOutlined />}
              onClick={rooms.reload}
            />
            <Button
              type="primary"
              aria-label="发起聊天"
              icon={<PlusOutlined />}
              onClick={() => navigate('/chatrooms')}
            />
          </div>
        </div>
        <div className="room-list-tools">
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索会话"
            aria-label="搜索会话"
            allowClear
            value={roomSearch}
            onChange={(event) => setRoomSearch(event.target.value)}
          />
          <Segmented
            block
            value={roomKind}
            onChange={(value) => setRoomKind(String(value))}
            options={[
              { label: '全部', value: 'ALL' },
              { label: '私聊', value: 'DIRECT' },
              { label: '群聊', value: 'GROUP' },
            ]}
          />
        </div>
        {rooms.error && (
          <Alert
            type="error"
            title={rooms.error}
            action={<Button onClick={rooms.reload}>重试</Button>}
          />
        )}
        <div className="mobile-room-select">
          <Select
            aria-label="选择会话"
            placeholder="选择一个会话"
            value={activeRoom?.id}
            options={availableRooms?.map((room) => ({ label: roomTitle(room), value: room.id }))}
            onChange={selectRoom}
          />
        </div>
        <List
          className="room-list-items"
          rowKey="id"
          loading={rooms.loading}
          dataSource={visibleRooms}
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  roomSearch || roomKind !== 'ALL' ? '没有匹配的会话' : '添加好友，开启第一段对话'
                }
              />
            ),
          }}
          renderItem={(room) => (
            <List.Item className="room-item-wrapper">
              <button
                className={'room-item' + (room.id === selectedId ? ' selected' : '')}
                onClick={() => selectRoom(room.id)}
                aria-current={room.id === selectedId ? 'true' : undefined}
              >
                <Avatar
                  shape="square"
                  size={42}
                  className={room.type === 'GROUP' ? 'group-avatar' : ''}
                  src={
                    room.type === 'DIRECT'
                      ? room.members.find((member) => member.userId !== session?.user.id)?.user
                          .avatar
                      : undefined
                  }
                >
                  {room.type === 'GROUP' ? <TeamOutlined /> : roomTitle(room).slice(0, 1)}
                </Avatar>
                <span className="room-item-copy">
                  <strong>{roomTitle(room)}</strong>
                  <small>
                    {room.type === 'DIRECT'
                      ? '好友私聊'
                      : '群聊 · ' + room._count.members + ' 位成员'}
                  </small>
                </span>
              </button>
            </List.Item>
          )}
        />
        <ListPagination {...rooms} />
      </aside>
      <section className="conversation">
        {!activeRoom ? (
          <div className="chat-empty">
            {roomId ? (
              detail?.error ? (
                <Alert
                  type="error"
                  title={detail.error}
                  action={
                    <Button onClick={() => setDetailVersion((value) => value + 1)}>重试</Button>
                  }
                />
              ) : (
                <Spin description="正在加载会话" />
              )
            ) : (
              <>
                <SceneIllustration kind="conversation" className="chat-empty-art" />
                <h2>从一声你好开始</h2>
                <p>选择一个会话，或邀请朋友一起聊聊。</p>
                <div className="empty-chat-actions">
                  <Button type="primary" onClick={() => navigate('/friendships')}>
                    添加好友
                  </Button>
                  <Button onClick={() => navigate('/chatrooms')}>创建群聊</Button>
                </div>
              </>
            )}
          </div>
        ) : (
          session && (
            <ChatConversation
              key={activeRoom.id}
              room={activeRoom}
              title={roomTitle(activeRoom)}
              token={session.accessToken}
              userId={session.user.id}
            />
          )
        )}
      </section>
    </div>
  );
}
