import { useState } from 'react';
import { App, Button, Form, Input, Tabs, Typography } from 'antd';
import { LockOutlined, MessageFilled, SmileOutlined, UserOutlined } from '@ant-design/icons';
import { Navigate, useNavigate } from 'react-router-dom';
import type { AuthResult } from '@chat/shared';
import { useAuth } from '../auth/AuthProvider';
import { api, errorMessage } from '../services/api';
import RegistrationCaptcha from './RegistrationCaptcha';
import SceneIllustration from '../components/SceneIllustration';

interface LoginValues {
  username: string;
  password: string;
  nickname?: string;
  captchaId?: string;
  captchaCode?: string;
}

export default function LoginPage() {
  const { session, signIn } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [captchaRefreshKey, setCaptchaRefreshKey] = useState(0);
  const [form] = Form.useForm<LoginValues>();
  const captchaId = Form.useWatch('captchaId', form);
  if (session) return <Navigate to="/chat" replace />;
  async function submit(values: LoginValues) {
    setLoading(true);
    try {
      const payload =
        mode === 'login'
          ? { username: values.username, password: values.password }
          : {
              username: values.username,
              password: values.password,
              nickname: values.nickname,
              captchaId: values.captchaId,
              captchaCode: values.captchaCode,
            };
      const { data } = await api.post<AuthResult>('/users/' + mode, payload);
      signIn(data);
      navigate('/chat', { replace: true });
    } catch (error) {
      message.error(errorMessage(error));
      if (mode === 'register') setCaptchaRefreshKey((value) => value + 1);
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-intro">
          <div className="login-wordmark">
            <span className="brand-symbol">
              <MessageFilled />
            </span>
            Chat Room<span className="brand-dot">.</span>
          </div>
          <div className="login-intro-content">
            <SceneIllustration kind="conversation" className="login-art" />
            <h2>
              和熟悉的人，
              <br />
              聊点新鲜事。
            </h2>
            <p>
              一对一的分享，或一群人的热闹。
              <br />
              让每一段对话，自然发生。
            </p>
          </div>
          <div className="login-features">
            <span>好友私聊</span>
            <i />
            <span>群组讨论</span>
            <i />
            <span>文件分享</span>
          </div>
        </section>
        <section className="login-panel">
          <div className="login-form">
            <div className="login-brand">
              <span className="brand-symbol mobile-login-brand">
                <MessageFilled />
              </span>
              <Typography.Title level={1}>
                {mode === 'login' ? '欢迎回来' : '创建你的账号'}
              </Typography.Title>
              <p>{mode === 'login' ? '登录账号，继续你的对话。' : '简单几步，和朋友保持联系。'}</p>
            </div>
            <Tabs
              activeKey={mode}
              onChange={(key) => {
                setMode(key);
                form.resetFields();
              }}
              items={[
                { key: 'login', label: '账号登录', disabled: loading },
                { key: 'register', label: '注册账号', disabled: loading },
              ]}
            />
            <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} size="large">
              <Form.Item
                name="username"
                label="账号"
                rules={[
                  { required: true, message: '请输入账号' },
                  { pattern: /^[a-zA-Z0-9_]{3,32}$/, message: '请输入 3–32 位字母、数字或下划线' },
                ]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="请输入账号"
                  autoComplete="username"
                  maxLength={32}
                />
              </Form.Item>
              {mode === 'register' && (
                <Form.Item
                  name="nickname"
                  label="昵称"
                  rules={[{ required: true, whitespace: true, message: '请输入昵称' }]}
                >
                  <Input
                    prefix={<SmileOutlined />}
                    placeholder="请输入昵称"
                    maxLength={50}
                    autoComplete="nickname"
                  />
                </Form.Item>
              )}
              <Form.Item
                name="password"
                label="密码"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 8, max: 72, message: '密码长度为 8–72 位' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="请输入至少 8 位密码"
                  maxLength={72}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </Form.Item>
              {mode === 'register' && (
                <RegistrationCaptcha refreshKey={captchaRefreshKey} disabled={loading} />
              )}
              <Button
                type="primary"
                htmlType="submit"
                block
                className="login-submit"
                loading={loading}
                disabled={mode === 'register' && !captchaId}
              >
                {mode === 'login' ? '登录' : '注册并登录'}
              </Button>
            </Form>
          </div>
        </section>
      </div>
    </main>
  );
}
