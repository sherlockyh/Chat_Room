import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ChatMessage,
  ClientToServerEvents,
  MessageSyncPage,
  ServerToClientEvents,
} from '@chat/shared';
import { api, errorMessage } from '../services/api';

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type ConnectionStatus = 'connecting' | 'syncing' | 'ready' | 'offline' | 'error';
type PendingText = {
  clientMessageId: string;
  content: string;
  status: 'sending' | 'uncertain' | 'failed';
  error?: string;
};
const historyLimit = 30;

/** 一个会话视图持有一条连接，离开视图时取消同步并清理订阅。 */
export function useChatSocket(roomId: number, token: string, userId: number) {
  const path = '/chat/rooms/' + roomId + '/messages';
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [syncError, setSyncError] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [pending, setPending] = useState<PendingText>();
  const pendingRef = useRef<PendingText | undefined>(undefined);
  const socketRef = useRef<ChatSocket | null>(null);
  const view = useRef<AbortController | null>(null);
  const syncAgain = useRef<(() => void) | undefined>(undefined);

  const updatePending = useCallback((value?: PendingText) => {
    pendingRef.current = value;
    setPending(value);
  }, []);

  const mergeMessages = useCallback(
    (incoming: ChatMessage[]) => {
      if (!socketRef.current || !incoming.length) return;
      const received = incoming.filter((item) => item.roomId === roomId);
      setMessages((previous) => {
        const byId = new Map(previous.map((item) => [item.id, item]));
        for (const item of received) byId.set(item.id, item);
        if (byId.size === previous.length) return previous;
        return Array.from(byId.values()).sort((a, b) => a.id - b.id);
      });
      const current = pendingRef.current;
      if (
        current &&
        received.some(
          (item) => item.senderId === userId && item.clientMessageId === current.clientMessageId,
        )
      )
        updatePending();
    },
    [roomId, userId, updatePending],
  );

  useEffect(() => {
    const socket: ChatSocket = io({
      transports: ['websocket'],
      auth: { token },
      autoConnect: false,
    });
    const lifetime = new AbortController();
    view.current = lifetime;
    socketRef.current = socket;
    // 只用 HTTP 已确认的范围推进游标，较新的实时事件可能先到。
    let checkpoint: number | undefined;
    let sync: AbortController | undefined;
    async function synchronize() {
      sync?.abort();
      const controller = new AbortController();
      sync = controller;
      const { signal } = controller;
      setStatus('syncing');
      setSyncError(undefined);
      try {
        const joined = await socket.timeout(5000).emitWithAck('room:join', { roomId });
        if (signal.aborted) return;
        if (!joined.ok) throw new Error(joined.error);
        if (checkpoint === undefined) {
          const { data } = await api.get<ChatMessage[]>(path, {
            params: { limit: historyLimit },
            signal,
          });
          if (signal.aborted) return;
          mergeMessages(data);
          checkpoint = data[0]?.id ?? 0;
          setHasOlder(data.length === historyLimit);
        } else {
          let after = checkpoint;
          let through: number | undefined;
          for (;;) {
            const { data } = await api.get<MessageSyncPage>(path + '/sync', {
              params: { after, through, limit: historyLimit },
              signal,
            });
            if (signal.aborted) return;
            through = data.through;
            mergeMessages(data.items);
            checkpoint = data.nextAfter ?? through;
            if (data.nextAfter === null) break;
            after = data.nextAfter;
          }
        }
        setStatus('ready');
      } catch (error) {
        if (signal.aborted) return;
        setStatus('error');
        setSyncError(errorMessage(error));
      }
    }
    function retry() {
      setSyncError(undefined);
      if (socket.connected) void synchronize();
      else {
        setStatus('connecting');
        socket.connect();
      }
    }
    function disconnect() {
      sync?.abort();
      setStatus('offline');
      setSyncError(undefined);
      const current = pendingRef.current;
      if (current?.status === 'sending')
        updatePending({ ...current, status: 'uncertain', error: '连接中断，尚未确认是否发送成功' });
    }
    function expire() {
      if (!lifetime.signal.aborted) window.dispatchEvent(new Event('auth:expired'));
    }
    function connectionError(error: Error & { data?: { code?: string } }) {
      if (error.data?.code === 'AUTH_EXPIRED') {
        expire();
        return;
      }
      setStatus('offline');
      setSyncError(undefined);
    }
    function onMessage(item: ChatMessage) {
      mergeMessages([item]);
    }
    syncAgain.current = retry;
    socket.on('connect', synchronize);
    socket.on('disconnect', disconnect);
    socket.on('connect_error', connectionError);
    socket.on('message:new', onMessage);
    socket.on('session:expired', expire);
    socket.connect();
    return () => {
      lifetime.abort();
      sync?.abort();
      socket.off('connect', synchronize);
      socket.off('disconnect', disconnect);
      socket.off('connect_error', connectionError);
      socket.off('message:new', onMessage);
      socket.off('session:expired', expire);
      socketRef.current = null;
      view.current = null;
      syncAgain.current = undefined;
      socket.disconnect();
    };
  }, [path, roomId, token, mergeMessages, updatePending]);

  function sendText(content?: string) {
    const socket = socketRef.current;
    const current = pendingRef.current;
    if (status !== 'ready' || !socket?.connected || current?.status === 'sending') return false;
    if (content !== undefined && current) return false;
    const body = content ?? current?.content;
    if (!body?.trim()) return false;
    const attempt: PendingText = {
      content: body,
      clientMessageId: current?.clientMessageId ?? crypto.randomUUID(),
      status: 'sending',
    };
    updatePending(attempt);
    const { clientMessageId } = attempt;
    socket.volatile
      .timeout(5000)
      .emit('message:send', { roomId, content: body, clientMessageId }, (error, result) => {
        if (socketRef.current !== socket) return;
        if (!error && result.ok) {
          mergeMessages([result.data]);
        } else if (pendingRef.current === attempt) {
          updatePending({
            ...attempt,
            status: error ? 'uncertain' : 'failed',
            error: !error && !result.ok ? result.error : '未收到发送确认，重试会复用同一消息编号',
          });
        }
      });
    return true;
  }

  async function loadOlder() {
    const before = messages[0]?.id;
    const signal = view.current?.signal;
    if (!before || !signal || loadingOlder || status !== 'ready') return;
    setLoadingOlder(true);
    try {
      const { data } = await api.get<ChatMessage[]>(path, {
        params: { before, limit: historyLimit },
        signal,
      });
      if (signal.aborted) return;
      setHasOlder(data.length === historyLimit);
      mergeMessages(data);
    } catch (error) {
      if (!signal.aborted) throw error;
    } finally {
      if (!signal.aborted) setLoadingOlder(false);
    }
  }

  return {
    status,
    syncError,
    messages,
    hasOlder,
    loadingOlder,
    pending,
    sendText,
    loadOlder,
    mergeMessages,
    retryConnection: () => syncAgain.current?.(),
    dismissPending: () => {
      if (pendingRef.current?.status !== 'sending') updatePending();
    },
  };
}
