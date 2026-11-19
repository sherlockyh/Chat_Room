import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ServerResponse } from 'node:http';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_error, _request, response) => {
            if (response instanceof ServerResponse && !response.headersSent) {
              response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
              response.end(
                JSON.stringify({
                  statusCode: 502,
                  message: '后端服务尚未就绪，请启动服务后重试',
                }),
              );
            }
          });
        },
      },
      '/socket.io': { target: 'http://127.0.0.1:3000', changeOrigin: true, ws: true },
    },
  },
});
