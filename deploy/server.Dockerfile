FROM node:22-bookworm-slim AS build
WORKDIR /workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm db:generate && pnpm --filter @chat/shared build && pnpm --filter @chat/server build

# 单独的迁移任务与 API 共用已生成的 Prisma 客户端和迁移文件。
FROM build AS runtime
ENV NODE_ENV=production
RUN mkdir -p /workspace/.pm2 && chown node:node /workspace/.pm2
ENV PM2_HOME=/workspace/.pm2
COPY deploy/ecosystem.config.cjs deploy/ecosystem.config.cjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# 运行时直接调用镜像内的程序，避免切换用户后 Corepack 再次联网下载 pnpm。
CMD ["node", "apps/server/node_modules/pm2/bin/pm2-runtime", "deploy/ecosystem.config.cjs"]
