import { Avatar, Button, Layout, Tooltip } from 'antd';
import {
  CommentOutlined,
  LogoutOutlined,
  MessageFilled,
  MessageOutlined,
  StarOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

const items = [
  { key: '/chat', icon: <CommentOutlined />, label: '消息' },
  { key: '/friendships', icon: <TeamOutlined />, label: '好友' },
  { key: '/chatrooms', icon: <MessageOutlined />, label: '聊天室' },
  { key: '/favorites', icon: <StarOutlined />, label: '收藏' },
  { key: '/friend-requests', icon: <UserAddOutlined />, label: '好友申请' },
  { key: '/users', icon: <UserOutlined />, label: '个人资料' },
];

export default function AppLayout() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  if (!session) return <Navigate to="/login" replace />;
  const current = items.find((item) => item.key === location.pathname);
  return (
    <Layout className="app-layout">
      <aside className="app-sidebar">
        <button className="sidebar-brand" onClick={() => navigate('/chat')} aria-label="聊天室首页">
          <span className="brand-symbol">
            <MessageFilled />
          </span>
          <span>
            Chat Room<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="nav-section-label">沟通</div>
        <nav className="app-nav" aria-label="主导航">
          {items.map((item, index) => (
            <div key={item.key}>
              {index === 3 && <div className="nav-section-label">我的空间</div>}
              <button
                className={'nav-link' + (item.key === location.pathname ? ' active' : '')}
                aria-current={item.key === location.pathname ? 'page' : undefined}
                onClick={() => navigate(item.key)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-account">
          <button
            className="sidebar-profile"
            onClick={() => navigate('/users')}
            aria-label="查看个人资料"
          >
            <Avatar shape="square" size={36} src={session.user.avatar}>
              {session.user.nickname.slice(0, 1)}
            </Avatar>
            <span>
              <strong>{session.user.nickname}</strong>
              <small>@{session.user.username}</small>
            </span>
          </button>
          <Tooltip title="退出登录" placement="top">
            <Button
              type="text"
              className="sidebar-logout"
              icon={<LogoutOutlined />}
              onClick={signOut}
              aria-label="退出登录"
            />
          </Tooltip>
        </div>
      </aside>
      <Layout className="main-layout">
        <Layout.Header className="app-header">
          <span className="header-current">{current?.label ?? '消息'}</span>
          <Button type="text" icon={<LogoutOutlined />} onClick={signOut} aria-label="退出登录" />
        </Layout.Header>
        <Layout.Content
          className={'app-content' + (location.pathname === '/chat' ? ' chat-page-content' : '')}
        >
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
