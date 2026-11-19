module.exports = {
  apps: [
    {
      name: 'chat-server',
      cwd: '/workspace/apps/server',
      script: 'dist/main.js',
      // 基础框架单实例；Redis Adapter 已为后续广播扩容预留。
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      kill_timeout: 10000,
      time: true,
      env: { NODE_ENV: 'production', PORT: 3000 },
    },
  ],
};
