import { useState } from 'react';
import { Alert, App, Avatar, Button, List, Modal, Select, Space, Typography } from 'antd';
import type { FriendRecord, RoomSummary } from '@chat/shared';
import { useAuth } from '../auth/AuthProvider';
import { usePagedData } from '../hooks/usePagedData';
import { api, errorMessage } from '../services/api';
import ListPagination from '../components/ListPagination';

export default function RoomMembersModal({
  room: initialRoom,
  onClose,
  onChange,
}: {
  room: RoomSummary;
  onClose: () => void;
  onChange: () => void;
}) {
  const [room, setRoom] = useState(initialRoom);
  const friends = usePagedData<FriendRecord>('/friendships', 12);
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const { session } = useAuth();
  const { message } = App.useApp();
  const canInvite = room.type === 'GROUP' && room.ownerId === session?.user.id;
  async function invite() {
    setSaving(true);
    try {
      const { data } = await api.post<RoomSummary>('/chatrooms/' + room.id + '/members', {
        userIds: selected,
      });
      setRoom(data);
      setSelected([]);
      onChange();
      message.success('已邀请好友入群');
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      title="聊天室成员"
      onCancel={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      <List
        dataSource={room.members}
        renderItem={(member) => (
          <List.Item>
            <List.Item.Meta
              avatar={<Avatar src={member.user.avatar}>{member.user.nickname.slice(0, 1)}</Avatar>}
              title={
                member.user.nickname +
                (room.type === 'GROUP' && member.userId === room.ownerId ? '（群主）' : '')
              }
              description={member.user.username}
            />
          </List.Item>
        )}
      />
      {canInvite && (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Typography.Text strong>邀请好友</Typography.Text>
          {friends.error && (
            <Alert
              type="error"
              title={friends.error}
              action={<Button onClick={friends.reload}>重试</Button>}
            />
          )}
          <Select
            mode="multiple"
            placeholder="选择尚未入群的好友"
            style={{ width: '100%' }}
            value={selected}
            onChange={setSelected}
            loading={friends.loading}
            disabled={saving}
            maxCount={50}
            optionFilterProp="label"
            options={friends.data
              ?.filter(
                (friend) => !room.members.some((member) => member.userId === friend.friendId),
              )
              .map((friend) => ({
                value: friend.friendId,
                label:
                  (friend.remark || friend.friend.nickname) + '（' + friend.friend.username + '）',
              }))}
          />
          <ListPagination {...friends} />
          <Button
            type="primary"
            onClick={() => void invite()}
            disabled={!selected.length}
            loading={saving}
          >
            邀请入群
          </Button>
        </Space>
      )}
    </Modal>
  );
}
