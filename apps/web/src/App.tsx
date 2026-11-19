import { lazy, Suspense } from 'react';
import { Spin } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import { ChatroomsPage, ProfilePage } from './pages/ModulePages';

const FriendsPage = lazy(() =>
  import('./pages/SocialPages').then((module) => ({ default: module.FriendsPage })),
);
const FriendRequestsPage = lazy(() =>
  import('./pages/SocialPages').then((module) => ({ default: module.FriendRequestsPage })),
);
const FavoritesPage = lazy(() =>
  import('./pages/SocialPages').then((module) => ({ default: module.FavoritesPage })),
);

const ChatPage = lazy(() => import('./pages/ChatPage'));
export default function App() {
  return (
    <Suspense
      fallback={
        <div className="page-loading">
          <Spin size="large" />
        </div>
      }
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chatrooms" element={<ChatroomsPage />} />
          <Route path="/friendships" element={<FriendsPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/friend-requests" element={<FriendRequestsPage />} />
          <Route path="/users" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </Suspense>
  );
}
