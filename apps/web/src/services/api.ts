import axios from 'axios';

export const SESSION_KEY = 'chat-room:session';
export const api = axios.create({ baseURL: '/api', timeout: 15000 });

api.interceptors.request.use((config) => {
  const session = sessionStorage.getItem(SESSION_KEY);
  if (session) config.headers.Authorization = 'Bearer ' + JSON.parse(session).accessToken;
  return config;
});
api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      sessionStorage.getItem(SESSION_KEY)
    ) {
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(error);
  },
);

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const message: unknown = error.response?.data?.message;
    if (Array.isArray(message)) return message.join('；');
    if (typeof message === 'string') return message;
    return error.response ? '请求失败，请稍后重试' : '无法连接服务器，请检查服务是否启动';
  }
  return error instanceof Error ? error.message : '操作失败';
}
