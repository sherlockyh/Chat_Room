/** 用户公开资料，禁止包含密码散列。 */
export interface UserProfile {
  id: number;
  username: string;
  nickname: string;
  avatar: string | null;
}

export interface UserSearchResult extends UserProfile {
  isFriend: boolean;
}

export interface CursorPage<T> {
  items: T[];
  hasMore: boolean;
  nextBefore: number | null;
}

export interface AuthResult {
  accessToken: string;
  user: UserProfile;
}

/** 注册图形验证码；响应只包含图片，不返回答案。 */
export interface CaptchaChallenge {
  captchaId: string;
  image: string;
  expiresIn: number;
}

export interface RoomSummary {
  id: number;
  name: string;
  ownerId: number;
  type: 'GROUP' | 'DIRECT';
  createdAt: string;
  _count: { members: number };
  members: { userId: number; user: UserProfile }[];
}

export interface ChatMessage {
  id: number;
  roomId: number;
  senderId: number;
  content: string;
  type: 'TEXT' | 'IMAGE' | 'FILE';
  createdAt: string;
  sender: UserProfile;
  clientMessageId?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
}

export interface MessageSyncPage {
  items: ChatMessage[];
  through: number;
  nextAfter: number | null;
}

export interface FriendRecord {
  id: number;
  friendId: number;
  remark: string | null;
  friend: UserProfile;
}
export interface FriendRequestRecord {
  id: number;
  senderId: number;
  receiverId: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  message: string | null;
  sender: UserProfile;
  receiver: UserProfile;
}
export interface FavoriteRecord {
  id: number;
  history: ChatMessage;
}

export type SocketResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface ServerToClientEvents {
  'message:new': (message: ChatMessage) => void;
  'session:expired': () => void;
}

export interface ClientToServerEvents {
  'room:join': (data: { roomId: number }, ack: (result: SocketResult<null>) => void) => void;
  'room:leave': (data: { roomId: number }, ack: (result: SocketResult<null>) => void) => void;
  'message:send': (
    data: { roomId: number; content: string; clientMessageId?: string },
    ack: (result: SocketResult<ChatMessage>) => void,
  ) => void;
}
