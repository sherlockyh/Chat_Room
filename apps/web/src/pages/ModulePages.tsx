import {
  Alert,
  App,
  Avatar,
  Button,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Skeleton,
} from 'antd';
import { ArrowRightOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import RoomMembersModal from './RoomMembersModal';
import type { RoomSummary, UserProfile } from '@chat/shared';
import { useApiData } from '../hooks/useApiData';
import { api, errorMessage } from '../services/api';
import PageHeading from '../components/PageHeading';
import SceneIllustration from '../components/SceneIllustration';
import ListPagination from '../components/ListPagination';
import { usePagedData } from '../hooks/usePagedData';

export function ProfilePage() {
  const { data, loading, error, reload } = useApiData<UserProfile>('/users/me');
  const { signOut } = useAuth();
  return (
    <>
      <PageHeading title="个人资料" description="你的账号与个人信息。" />
      <section className="profile-panel" aria-label="个人资料">
        {error ? (
          <Alert type="error" title={error} action={<Button onClick={reload}>重试</Button>} />
        ) : (
          <Skeleton loading={loading}>
            {data && (
              <>
                <div className="profile-identity">
                  <Avatar size={64} shape="square" src={data.avatar}>
                    {data.nickname.slice(0, 1)}
                  </Avatar>
                  <div>
                    <h2>{data.nickname}</h2>
                    <p>@{data.username}</p>
                  </div>
                </div>
                <div className="profile-details">
                  <h3>账号信息</h3>
                  <Descriptions
                    column={1}
                    items={[
                      { key: 'id', label: '用户 ID', children: data.id },
                      { key: 'username', label: '账号', children: data.username },
                      { key: 'nickname', label: '昵称', children: data.nickname },
                    ]}
                  />
                </div>
                <div className="profile-footer">
                  <span>当前账号已登录</span>
                  <Button onClick={signOut}>退出登录</Button>
                </div>
              </>
            )}
          </Skeleton>
        )}
      </section>
    </>
  );
}
export function ChatroomsPage() {
  const rooms = usePagedData<RoomSummary>('/chatrooms');
  const { data, loading, error, reload } = rooms;
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [membersRoom, setMembersRoom] = useState<RoomSummary>();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<{ name: string }>();
  async function create(values: { name: string }) {
    setSaving(true);
    try {
      await api.post('/chatrooms', values);
      setOpen(false);
      form.resetFields();
      rooms.reset();
      message.success('聊天室已创建');
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeading title="聊天室" description="让每一次讨论，都有一个自己的空间。">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          创建聊天室
        </Button>
      </PageHeading>
      <section className="data-section rooms-collection" aria-label="聊天室列表">
        <div className="section-label collection-heading">
          <div>
            <h2>我的聊天室</h2>
            <p>你加入的群聊和好友会话，都在这里。</p>
          </div>
          <span className="section-mark">
            <TeamOutlined />
          </span>
        </div>
        <div className="collection-body">
          {error ? (
            <Alert type="error" title={error} action={<Button onClick={reload}>重试</Button>} />
          ) : (
            <List
              rowKey="id"
              grid={{ gutter: 16, xs: 1, sm: 1, md: 2, xl: 3, xxl: 3 }}
              loading={loading}
              dataSource={data}
              locale={{
                emptyText: (
                  <Empty
                    className="illustrated-empty"
                    image={<SceneIllustration kind="conversation" />}
                    description="创建一个聊天室，邀请朋友加入吧"
                  />
                ),
              }}
              renderItem={(room) => {
                const peer = room.members.find(
                  (member) => member.userId !== session?.user.id,
                )?.user;
                const name = room.type === 'DIRECT' ? (peer?.nickname ?? room.name) : room.name;
                return (
                  <List.Item>
                    <article className="room-card">
                      <div className="room-card-identity">
                        <Avatar
                          size={44}
                          shape="square"
                          src={room.type === 'DIRECT' ? peer?.avatar : undefined}
                          className={room.type === 'GROUP' ? 'group-avatar' : ''}
                        >
                          {room.type === 'GROUP' ? <TeamOutlined /> : name.slice(0, 1)}
                        </Avatar>
                        <div>
                          <h2 title={name}>{name}</h2>
                          <span>
                            {room.type === 'DIRECT'
                              ? '好友私聊'
                              : '群聊 · ' + room._count.members + ' 位成员'}
                          </span>
                        </div>
                      </div>
                      <div className="room-card-members">
                        <Avatar.Group size={24}>
                          {room.members.slice(0, 4).map((member) => (
                            <Avatar key={member.userId} src={member.user.avatar}>
                              {member.user.nickname.slice(0, 1)}
                            </Avatar>
                          ))}
                        </Avatar.Group>
                        <Button type="text" size="small" onClick={() => setMembersRoom(room)}>
                          查看成员
                        </Button>
                      </div>
                      <Button
                        className="room-card-enter"
                        block
                        onClick={() => navigate('/chat?roomId=' + room.id)}
                      >
                        进入聊天 <ArrowRightOutlined />
                      </Button>
                    </article>
                  </List.Item>
                );
              }}
            />
          )}
        </div>
        <ListPagination {...rooms} />
      </section>
      {membersRoom && (
        <RoomMembersModal
          room={membersRoom}
          onClose={() => setMembersRoom(undefined)}
          onChange={reload}
        />
      )}
      <Modal
        forceRender
        title="创建聊天室"
        open={open}
        onCancel={() => {
          setOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={create}>
          <Form.Item
            name="name"
            label="聊天室名称"
            rules={[{ required: true, whitespace: true, message: '请输入聊天室名称' }]}
          >
            <Input maxLength={80} placeholder="例如：项目讨论组" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
