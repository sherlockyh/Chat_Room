import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Spin } from 'antd';
import axios from 'axios';
import type { CaptchaChallenge } from '@chat/shared';
import { api, errorMessage } from '../services/api';

export default function RegistrationCaptcha({
  refreshKey,
  disabled,
}: {
  refreshKey: number;
  disabled: boolean;
}) {
  const form = Form.useFormInstance();
  const [challenge, setChallenge] = useState<CaptchaChallenge>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    setChallenge(undefined);
    form.setFieldsValue({ captchaId: undefined, captchaCode: undefined });
    api
      .get<CaptchaChallenge>('/users/captcha', { signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        setChallenge(data);
        form.setFieldValue('captchaId', data.captchaId);
      })
      .catch((err: unknown) => {
        if (!axios.isCancel(err)) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [form, refreshKey, version]);

  return (
    <>
      <Form.Item
        name="captchaId"
        hidden
        preserve={false}
        rules={[{ required: true, message: '请先获取图形验证码' }]}
      >
        <Input />
      </Form.Item>
      <Form.Item label="图形验证码" required style={{ marginBottom: 0 }}>
        <div className="captcha-row">
          <Form.Item
            name="captchaCode"
            preserve={false}
            rules={[
              { required: true, message: '请输入图形验证码' },
              { pattern: /^[a-zA-Z0-9]{4}$/, message: '请输入图片中的 4 位字符' },
            ]}
          >
            <Input
              placeholder="不区分大小写"
              maxLength={4}
              autoComplete="off"
              disabled={disabled || !challenge}
            />
          </Form.Item>
          <button
            type="button"
            className="captcha-image"
            onClick={() => setVersion((value) => value + 1)}
            disabled={disabled || loading}
            aria-label="刷新图形验证码"
            title="看不清？点击换一张"
          >
            {loading ? (
              <Spin size="small" />
            ) : challenge ? (
              <img src={challenge.image} alt="注册图形验证码" width={132} height={44} />
            ) : (
              '点击重试'
            )}
          </button>
        </div>
      </Form.Item>
      {error ? (
        <Alert
          type="error"
          title={error}
          action={
            <Button
              size="small"
              type="link"
              onClick={() => setVersion((value) => value + 1)}
              disabled={disabled || loading}
            >
              重试
            </Button>
          }
          className="captcha-error"
        />
      ) : (
        <p className="captcha-tip">5 分钟内有效，看不清可点击图片换一张</p>
      )}
    </>
  );
}
