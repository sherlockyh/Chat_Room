import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth/AuthProvider';
import 'antd/dist/reset.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#5267df',
          colorInfo: '#5267df',
          colorSuccess: '#39a589',
          colorText: '#24324b',
          colorTextSecondary: '#8b96a9',
          colorBorder: '#e3e8f1',
          colorBgLayout: '#f0f3f9',
          borderRadius: 8,
          controlHeight: 36,
          controlHeightLG: 44,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
        },
        components: {
          Button: { primaryShadow: 'none', defaultShadow: 'none', fontWeight: 500 },
          Input: { activeShadow: '0 0 0 3px rgba(82, 103, 223, 0.08)' },
          Modal: { borderRadiusLG: 14 },
          Tabs: { titleFontSize: 14 },
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  </React.StrictMode>,
);
