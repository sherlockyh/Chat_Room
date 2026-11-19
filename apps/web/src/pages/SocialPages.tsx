import { useState } from 'react';
import { ReloadOutlined, SearchOutlined, StarOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Avatar,
  Button,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Tabs,
  Tag,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import type {
  FavoriteRecord,
  FriendRecord,
  FriendRequestRecord,
  RoomSummary,
  UserSearchResult,
} from '@chat/shared';
import { api, errorMessage } from '../services/api';
import { usePagedData } from '../hooks/usePagedData';
import ListPagination from '../components/ListPagination';
import { MessageContent } from './MessageContent';
import PageHeading from '../components/PageHeading';
import SceneIllustration from '../components/SceneIllustration';

export function FriendsPage() {
  const friends = usePagedData<FriendRecord>('/friendships');
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const results = usePagedData<UserSearchResult>(
    searchQuery ? '/users/search?q=' + encodeURIComponent(searchQuery) : undefined,
    6,
  );
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<UserSearchResult>();
  const [remarkTarget, setRemarkTarget] = useState<FriendRecord>();
  const [form] = Form.useForm<{ message: string }>();
  const [remarkForm] = Form.useForm<{ remark: string }>();
  async function find() {
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(search)) {
      message.warning('请输入至少 2 位账号前缀');
      return;
    }
    if (searchQuery === search) results.reset();
    else setSearchQuery(search);
  }

  async function request(values: { message: string }) {
    if (!target) return;
    setBusy(true);
    try {
      await api.post('/friend-requests', { receiverId: target.id, message: values.message });
      message.success('好友申请已发送');
      setTarget(undefined);
      form.resetFields();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function direct(friendId: number) {
    setBusy(true);
    try {
      const { data } = await api.post<RoomSummary>('/chatrooms/direct', { friendId });
      navigate('/chat?roomId=' + data.id);
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function remove(friendId: number) {
    try {
      await api.delete('/friendships/' + friendId);
      friends.reload();
      if (searchQuery) results.reload();
      message.success('已解除好友关系');
    } catch (error) {
      message.error(errorMessage(error));
    }
  }
  async function remark(values: { remark: string }) {
    if (!remarkTarget) return;
    setBusy(true);
    try {
      await api.patch('/friendships/' + remarkTarget.friendId, values);
      setRemarkTarget(undefined);
      friends.reload();
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading title="好友" description="常联系的人，都在这里。">
        <Button icon={<ReloadOutlined />} onClick={friends.reload}>
          刷新
        </Button>
      </PageHeading>
      <div className="directory-layout">
        <section className="friend-search-section" aria-label="添加好友">
          <div className="section-toolbar">
            <SceneIllustration kind="friends" className="friend-search-art" />
            <span className="panel-symbol">
              <SearchOutlined />
            </span>
            <div className="friend-search-copy">
              <h2>添加一位新朋友</h2>
              <p>输入朋友的账号，发送好友申请。</p>
            </div>
            <Input.Search
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="输入至少 2 位账号前缀"
              maxLength={32}
              enterButton="搜索"
              loading={results.loading}
              onSearch={() => void find()}
            />
          </div>
          {searchQuery && (
            <>
              {results.error && (
                <Alert
                  type="error"
                  title={results.error}
                  action={<Button onClick={results.reload}>重试</Button>}
                />
              )}
              <List
                loading={results.loading}
                dataSource={results.data}
                locale={{ emptyText: '没有找到匹配的用户' }}
                renderItem={(user) => (
                  <List.Item
                    actions={[
                      <Button
                        key="add"
                        disabled={busy || user.isFriend}
                        onClick={() => {
                          setTarget(user);
                          form.resetFields();
                        }}
                      >
                        {user.isFriend ? '已是好友' : '添加好友'}
                      </Button>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<Avatar src={user.avatar}>{user.nickname.slice(0, 1)}</Avatar>}
                      title={user.nickname}
                      description={'账号：' + user.username}
                    />
                  </List.Item>
                )}
              />
              <ListPagination {...results} />
            </>
          )}
        </section>
        <section className="data-section people-section" aria-label="好友列表">
          <div className="section-label">
            <h2>全部好友</h2>
            <span className="section-caption">联系、备注与管理你的朋友</span>
          </div>
          {friends.error ? (
            <Alert
              type="error"
              title={friends.error}
              action={<Button onClick={friends.reload}>重试</Button>}
            />
          ) : (
            <List
              loading={friends.loading}
              dataSource={friends.data}
              locale={{
                emptyText: (
                  <Empty
                    className="illustrated-empty"
                    image={<SceneIllustration kind="friends" />}
                    description="暂无好友，搜索账号添加吧"
                  />
                ),
              }}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button
                      key="chat"
                      type="link"
                      disabled={busy}
                      onClick={() => void direct(item.friendId)}
                    >
                      私聊
                    </Button>,
                    <Button
                      key="remark"
                      type="text"
                      onClick={() => {
                        setRemarkTarget(item);
                        remarkForm.setFieldsValue({ remark: item.remark ?? '' });
                      }}
                    >
                      备注
                    </Button>,
                    <Popconfirm
                      key="delete"
                      title="解除双方好友关系？"
                      description="历史消息仍保留，重新添加后可继续私聊。"
                      onConfirm={() => remove(item.friendId)}
                      okText="解除"
                      cancelText="取消"
                    >
                      <Button type="text" danger>
                        删除
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar src={item.friend.avatar}>{item.friend.nickname.slice(0, 1)}</Avatar>
                    }
                    title={item.remark || item.friend.nickname}
                    description={item.friend.username}
                  />
                </List.Item>
              )}
            />
          )}
          <ListPagination {...friends} />
        </section>
      </div>
      <Modal
        forceRender
        title={'添加 ' + (target?.nickname ?? '')}
        open={!!target}
        onCancel={() => setTarget(undefined)}
        onOk={() => form.submit()}
        confirmLoading={busy}
        okText="发送申请"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={request}>
          <Form.Item name="message" label="申请说明">
            <Input.TextArea maxLength={200} placeholder="介绍一下自己吧" />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        forceRender
        title="修改备注"
        open={!!remarkTarget}
        onCancel={() => setRemarkTarget(undefined)}
        onOk={() => remarkForm.submit()}
        confirmLoading={busy}
        okText="保存"
        cancelText="取消"
      >
        <Form form={remarkForm} onFinish={remark}>
          <Form.Item name="remark">
            <Input maxLength={50} placeholder="好友备注，留空恢复昵称" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function FriendRequestsPage() {
  const { message } = App.useApp();
  const [tab, setTab] = useState('received');
  const requests = usePagedData<FriendRequestRecord>('/friend-requests?direction=' + tab);
  const [busyId, setBusyId] = useState<number>();
  async function decide(id: number, status: 'ACCEPTED' | 'REJECTED') {
    setBusyId(id);
    try {
      await api.patch('/friend-requests/' + id, { status });
      requests.reload();
      message.success(status === 'ACCEPTED' ? '已添加为好友' : '已拒绝申请');
    } catch (error) {
      message.error(errorMessage(error));
    } finally {
      setBusyId(undefined);
    }
  }
  return (
    <>
      <PageHeading title="好友申请" description="查看新的招呼，认识新的朋友。">
        <Button icon={<ReloadOutlined />} onClick={requests.reload}>
          刷新
        </Button>
      </PageHeading>
      <section className="data-section requests-section" aria-label="好友申请">
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            { key: 'received', label: '收到的申请' },
            { key: 'sent', label: '发出的申请' },
          ]}
        />
        {requests.error ? (
          <Alert type="error" title={requests.error} />
        ) : (
          <List
            loading={requests.loading}
            dataSource={requests.data}
            locale={{
              emptyText: (
                <Empty
                  className="illustrated-empty"
                  image={<SceneIllustration kind="friends" />}
                  description="暂无申请"
                />
              ),
            }}
            renderItem={(item) => {
              const peer = tab === 'received' ? item.sender : item.receiver;
              return (
                <List.Item
                  actions={
                    tab === 'received' && item.status === 'PENDING'
                      ? [
                          <Button
                            key="accept"
                            type="primary"
                            loading={busyId === item.id}
                            disabled={busyId !== undefined}
                            onClick={() => void decide(item.id, 'ACCEPTED')}
                          >
                            接受
                          </Button>,
                          <Button
                            key="reject"
                            disabled={busyId !== undefined}
                            onClick={() => void decide(item.id, 'REJECTED')}
                          >
                            拒绝
                          </Button>,
                        ]
                      : [
                          <Tag
                            key="status"
                            color={item.status === 'ACCEPTED' ? 'success' : 'default'}
                          >
                            {
                              { PENDING: '待处理', ACCEPTED: '已接受', REJECTED: '已拒绝' }[
                                item.status
                              ]
                            }
                          </Tag>,
                        ]
                  }
                >
                  <List.Item.Meta
                    avatar={<Avatar src={peer.avatar}>{peer.nickname.slice(0, 1)}</Avatar>}
                    title={peer.nickname + '（' + peer.username + '）'}
                    description={item.message || '请求添加为好友'}
                  />
                </List.Item>
              );
            }}
          />
        )}
        <ListPagination {...requests} />
      </section>
    </>
  );
}

export function FavoritesPage() {
  const favorites = usePagedData<FavoriteRecord>('/favorites', 6);
  const { message } = App.useApp();
  const navigate = useNavigate();
  async function remove(id: number) {
    try {
      await api.delete('/favorites/' + id);
      favorites.reload();
      message.success('已取消收藏');
    } catch (error) {
      message.error(errorMessage(error));
    }
  }
  return (
    <>
      <PageHeading title="收藏" description="保存值得留住的消息、图片和文件。">
        <Button icon={<ReloadOutlined />} onClick={favorites.reload}>
          刷新
        </Button>
      </PageHeading>
      <section className="data-section favorites-section" aria-label="收藏列表">
        <div className="section-label collection-heading">
          <div>
            <h2>全部收藏</h2>
            <p>消息、图片和文件，随时回来看看。</p>
          </div>
          <span className="section-mark">
            <StarOutlined />
          </span>
        </div>
        <div className="collection-body">
          {favorites.error ? (
            <Alert type="error" title={favorites.error} />
          ) : (
            <List
              rowKey="id"
              grid={{ gutter: 16, xs: 1, sm: 1, md: 2, xl: 2, xxl: 3 }}
              loading={favorites.loading}
              dataSource={favorites.data}
              locale={{
                emptyText: (
                  <Empty
                    className="illustrated-empty"
                    image={<SceneIllustration kind="keepsake" />}
                    description="在聊天中收藏一条消息，它就会出现在这里"
                  />
                ),
              }}
              renderItem={(item) => (
                <List.Item>
                  <article className="favorite-card">
                    <header className="favorite-card-header">
                      <Avatar size={30} src={item.history.sender.avatar}>
                        {item.history.sender.nickname.slice(0, 1)}
                      </Avatar>
                      <div>
                        <strong>{item.history.sender.nickname}</strong>
                        <time dateTime={item.history.createdAt}>
                          {new Date(item.history.createdAt).toLocaleString('zh-CN', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>
                      <StarOutlined className="favorite-card-star" />
                    </header>
                    <div className="favorite-card-content">
                      <MessageContent item={item.history} />
                    </div>
                    <footer>
                      <Button
                        type="link"
                        onClick={() => navigate('/chat?roomId=' + item.history.roomId)}
                      >
                        前往会话
                      </Button>
                      <Popconfirm
                        title="取消这条收藏？"
                        onConfirm={() => remove(item.id)}
                        okText="确定"
                        cancelText="取消"
                      >
                        <Button type="text">取消收藏</Button>
                      </Popconfirm>
                    </footer>
                  </article>
                </List.Item>
              )}
            />
          )}
        </div>
        <ListPagination {...favorites} />
      </section>
    </>
  );
}
