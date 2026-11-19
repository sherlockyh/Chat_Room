# Chat Room

使用 pnpm workspace 管理的聊天室 monorepo，前后端统一使用 TypeScript，已实现好友、私聊、群聊、收藏及附件消息的基础闭环。

## 工程结构

```text
Chat_Room/
├── apps/
│   ├── web/                         # React + Ant Design + Vite
│   │   └── src/
│   │       ├── auth/                # 登录会话与路由保护
│   │       ├── layouts/             # 应用导航和布局
│   │       ├── pages/               # 登录页与六个模块入口
│   │       └── services/            # HTTP 客户端与统一错误解析
│   └── server/                      # NestJS + Prisma + Socket.IO
│       ├── prisma/                  # 七张业务表与 SQL 迁移
│       └── src/
│           ├── common/              # JWT 守卫、异常处理、分页与限流
│           ├── config/              # 启动配置校验
│           ├── infrastructure/      # Prisma、Redis、MinIO 与广播适配器
│           └── modules/             # user / friendship / chatroom / chat /
│                                    # favorite / friend-request
├── packages/shared/                 # 前后端共享资料、消息与事件类型
├── deploy/                          # Dockerfile、PM2 与 Nginx
└── docker-compose.yml
```

## 当前实现范围

项目定位为基础聊天室，当前范围如下，后续维护以验收和问题修复为主。

| 模块         | 已提供                                                                        |
| ------------ | ----------------------------------------------------------------------------- |
| 用户         | 图形验证码注册、登录、JWT、公开资料及账号前缀搜索、登录页                     |
| 好友管理     | 好友列表、备注、双向删除、发起私聊                                            |
| 聊天室管理   | 创建群聊、私聊复用、成员列表、群主邀请好友入群                                |
| 聊天         | JWT 鉴权、实时文本、文件/图片、私有附件下载、图片预览、历史分页、消息幂等     |
| 收藏管理     | 收藏消息、收藏列表、取消收藏、前往会话                                        |
| 好友请求管理 | 发送、收发列表、接受、拒绝、防重复申请                                        |
| 基础设施     | Redis 广播与限流、MinIO 私有桶、Swagger、依赖健康检查、Compose/PM2/Nginx 部署 |

群主可在聊天室管理的成员弹窗中选择自己的好友入群，单次最多 50 人。私聊只能由好友发起，同一对用户始终复用一个会话；删除好友会同时移除双方关系并禁止继续发送私聊消息，历史记录和原有群成员身份保留，重新添加后可继续使用原私聊。

界面采用雾蓝背景、靛蓝主题和浅色分组导航，统一字号、头像、圆角与边框。聊天页使用会话列表与消息区组成的独立窗口，支持按名称搜索以及私聊/群聊筛选；好友页采用上方添加好友、下方好友列表的上下布局，聊天室与收藏使用带标题和分页的卡片面板。移动端使用底部导航和会话选择器。

## 本地开发

要求 Node.js >= 20.19、pnpm 9.15.9、Docker Engine 与 Docker Compose v2。

```bash
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install

# 如果文件尚不存在，复制示例；两处配置的数据库、Redis、MinIO 凭据需要对应。
cp .env.example .env
cp apps/server/.env.example apps/server/.env

pnpm infra:up
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm dev
```

`pnpm db:seed` 会创建可重复使用的本地演示数据，不会清空其他数据。演示账号为 `demo_alice`、`demo_bob`、`demo_carol`，统一密码为 `Demo_123456`；退出登录后可以切换账号体验好友申请、私聊、群聊、收藏和附件流程。

本次搭建已在本机生成被 Git 忽略的两份 .env，并写入随机凭据；已有文件会保留。已有配置时跳过上面的复制步骤。

| 服务              | 地址                                          | 来源                                   |
| ----------------- | --------------------------------------------- | -------------------------------------- |
| 前端              | http://localhost:5173                         | apps/web/vite.config.ts                |
| API               | http://localhost:3000/api                     | apps/server/.env 中 PORT               |
| Swagger           | http://localhost:3000/api/docs                | Nest Swagger 自动生成                  |
| 存活 / 就绪       | /api/health/live / /api/health/ready          | 就绪检查 MySQL、Redis、MinIO 桶        |
| MySQL             | localhost:3306                                | 根目录 MYSQL_PORT                      |
| Redis             | localhost:6379                                | 根目录 REDIS_PORT                      |
| MinIO S3 / 控制台 | http://localhost:9000 / http://localhost:9001 | 根目录 MINIO_PORT / MINIO_CONSOLE_PORT |

Vite 将 /api 与 /socket.io 代理到 3000，前端不需要额外的环境文件。修改后端端口时需要同步 Vite 代理目标。

验证码图片请求失败时，先检查 http://localhost:3000/api/health/ready。仅启动前端时无法获取验证码；需启动 Docker、执行 pnpm infra:up 和 pnpm db:deploy，再执行 pnpm dev 启动前后端。开发代理在后端不可用时返回 502 和明确的服务未就绪提示，服务恢复后点击验证码“重试”即可。

MySQL、Redis、MinIO 端口只绑定宿主机 127.0.0.1。开发使用 localhost，容器内部使用 mysql:3306、redis:6379、minio:9000；映射端口不影响容器之间通信。

## 数据模型与迁移

七张业务表：users、friendship、chatroom、user_chatroom、chat_history、friend_request、favorite。Prisma 还会自动维护 _prisma_migrations 迁移元数据表。

- 用户账号唯一；公开资料查询和消息发送者查询不会返回 password_hash。
- friendship 使用 user_id + friend_id 唯一约束，约定接受好友申请时使用事务创建双向关系。
- 好友申请处理、双向删除和私聊创建按固定顺序锁定双方用户，避免并发重复建关系或建会话。
- user_chatroom 使用 user_id + room_id 唯一约束，限制重复入群。
- chat_history 使用 room_id + id 索引，列表按 ID 倒序，以 before 继续向前查询，单次最多 100 条。
- chat_history 使用 sender_id + client_message_id 唯一约束去重；附件元数据与 MinIO object_key 保存在消息记录中。
- friend_request 对发送方、接收方去重；待处理申请重复发送返回原记录，已处理申请可重新提交并复用原记录；接受或拒绝后禁止直接覆盖终态。对方已有待处理申请时，提示先处理收到的申请。
- favorite 使用 user_id + history_id 去重，外键保证消息存在。
- chatroom 的 direct_key 对排序后的用户 ID 对唯一，GROUP 的该字段为空。
- 已提供初始化与 20261027010000_chat_features 两份迁移；新迁移在原七张业务表上增加私聊去重、消息编号和附件元数据字段。

```bash
# 首次建表、已有迁移部署
pnpm db:deploy

# 修改 schema 后创建新迁移（仅开发环境）
pnpm db:migrate --name describe_change

# 查看数据库
pnpm db:studio
```

migrate dev 需要可用的 shadow database；Compose 的普通数据库用户仅有业务库权限。新增迁移时请使用具有建库权限的开发账号，或在 Prisma datasource 配置 shadowDatabaseUrl 并提供独立影子库。生产使用 migrate deploy。

## 前后端联调

HTTP 响应直接返回业务对象；错误响应包含 message，参数错误可能是字符串数组。通过 Swagger 的 Authorize 填写登录接口返回的 accessToken，或发送 Authorization: Bearer <token>。

| 方法       | 路径                                  | 用途                                                                             |
| ---------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| GET        | /api/users/captcha                    | { captchaId, image, expiresIn }，匿名获取注册验证码                              |
| POST       | /api/users/register                   | { username, password, nickname, captchaId, captchaCode } → { accessToken, user } |
| POST       | /api/users/login                      | { username, password } → { accessToken, user }                                   |
| GET        | /api/users/me                         | 当前用户公开资料                                                                 |
| GET        | /api/users/search?q=al                | 按账号前缀搜索，至少 2 位；排除当前用户                                          |
| GET        | /api/friendships                      | 当前用户好友                                                                     |
| PATCH      | /api/friendships/:friendId            | 修改备注 { remark }，空字符串清除                                                |
| DELETE     | /api/friendships/:friendId            | 双向解除好友关系                                                                 |
| GET / POST | /api/chatrooms                        | 当前用户聊天室 / 创建 { name }                                                   |
| GET        | /api/chatrooms/:roomId                | 当前成员读取会话详情，支持进入侧栏范围外的较早会话                               |
| POST       | /api/chatrooms/direct                 | { friendId } → 创建或返回同一私聊                                                |
| POST       | /api/chatrooms/:roomId/members        | 群主邀请自己的好友 { userIds: [1, 2] }                                           |
| GET        | /api/chat/rooms/:roomId/messages      | 当前成员读取历史消息                                                             |
| GET        | /api/chat/rooms/:roomId/messages/sync | 当前成员按 `after` 补拉；续页复用首页的 `through`，直到 `nextAfter` 为 `null`    |
| POST       | /api/chat/rooms/:roomId/files         | multipart/form-data：file + clientMessageId；上传并发送附件                      |
| GET        | /api/chat/messages/:id/file           | 当前会话成员鉴权下载附件                                                         |
| GET / POST | /api/favorites                        | 当前用户收藏 / 新增 { historyId }，重复收藏返回原记录                            |
| DELETE     | /api/favorites/:id                    | 取消当前用户自己的收藏                                                           |
| GET / POST | /api/friend-requests                  | 收发申请列表 / 发送 { receiverId, message? }                                     |
| PATCH      | /api/friend-requests/:id              | 接收方处理 { status: 'ACCEPTED' 或 'REJECTED' }                                  |

列表接口支持 `?limit=30&before=上一页最后一条ID`，默认按 ID 倒序返回数组。好友、聊天室、申请、收藏、用户搜索可加 `paged=true`，返回 `{ items, hasMore, nextBefore }`；服务端多查一条判断是否还有下一页，不使用深 offset，也不限制只能查看前 100 条。好友申请支持 `direction=received|sent`，先按方向过滤再分页；用户搜索额外返回 `isFriend`，不依赖当前好友页判断关系。

前端好友、聊天室、申请每页 12 条，收藏和账号搜索每页 6 条，聊天侧栏和邀请好友选择器也支持每页 12 条，均支持上一页和下一页。切换申请方向、重新搜索会回到首页；删除导致空页时自动回退。聊天页的搜索和私聊/群聊筛选作用于当前侧栏页；从其他列表进入较早会话时会单独加载详情，并加入当前侧栏。聊天历史每批 30 条并支持加载更早消息。

注册前先获取图形验证码，将 image 设置为图片 src，提交时附带 captchaId 和图片中的 4 位 captchaCode。验证码不区分大小写，Redis 保存 5 分钟，通过 GETDEL 原子读取并删除；无论校验成功还是失败均不可再次使用。注册失败后页面会自动清空输入并刷新图片，也可点击图片手动更换。接口禁止缓存，并限制同一 IP 每分钟获取 20 次；登录不需要图形验证码。该功能不增加数据库表，需 Redis 可用。

Socket.IO 使用默认命名空间、/socket.io 路径，仅启用 websocket 传输，握手 auth 为 { token: accessToken }。

| 事件            | 请求 / 数据                           | 确认                            |
| --------------- | ------------------------------------- | ------------------------------- |
| room:join       | { roomId }                            | { ok: true, data: null }        |
| room:leave      | { roomId }                            | { ok: true, data: null }        |
| message:send    | { roomId, content, clientMessageId? } | { ok: true, data: ChatMessage } |
| message:new     | 服务端向房间成员推送 ChatMessage      | 无                              |
| session:expired | JWT 到期，服务端通知并断开连接        | 无                              |

失败确认统一为 { ok: false, error }。首次打开会话，先入房，再请求最近 30 条历史。连接和订阅由前端 `useChatSocket` 管理；重连后以已同步的 ID 为起点分批补拉，首页确定这轮同步上界，期间新到的实时消息与补拉结果按 ID 合并排序。文本和附件落库前短暂锁定对应房间，防止同房高 ID 先提交导致补拉漏读较低 ID；不需要数据库迁移，部署时应先更新所有写入实例。JWT 有效期 7 天，到期主动通知并断开连接，客户端回到登录页。HTTP 登录接口单独限流，Socket 事件使用 Redis 按用户每秒最多 20 次操作。

发送超时代表结果未知，当前会话显示待确认提示；点击重试复用 UUID v4 的 clientMessageId，服务端返回原消息。同一编号用于不同房间或文本内容时拒绝。确认、实时广播或同步接口找到该消息时清除提示，移除提示不会撤回服务器上的消息。自定义客户端应始终传入该编号，省略时不保证去重。前端按数据库消息 ID 去重；同步游标和待确认状态只保留在当前会话视图，离开或刷新后不自动恢复，也不自动重发。

附件通过 HTTP 上传，落库后通过 message:new 广播。单文件上限 10 MiB，上传接口每 IP 每分钟最多 10 次；Nginx 请求体上限 12 MiB 用于容纳 multipart。服务端按文件签名识别 PNG、JPEG、GIF、WebP，其余类型（含 SVG）作为普通文件下载。MinIO 桶保持私有，下载校验会话成员身份，图片预览使用鉴权请求获得 Blob，关闭和卸载时释放对象地址。中文文件名可正常上传下载。

附件重试必须复用同一个 clientMessageId，该编号标识同一次发送，重试会返回原附件。对象上传后写入消息失败时，服务端先查询该编号的实际提交结果，再删除未被消息引用的本次对象；无法对账时保留对象并记录待核查日志。当前未实现持久化补偿任务：进程在上传后、消息提交前退出可能留下孤立对象，需要根据消息表的 object_key 核查清理。

会话存储在 sessionStorage，退出登录清除本地会话，尚未实现服务端令牌撤销。

## Docker Compose 部署

```bash
# 首次部署：配置根目录 .env，填写 WEB_ORIGIN 为浏览器实际访问源。
# 本地默认 WEB_ORIGIN=http://localhost:8080，GATEWAY_PORT=8080。
docker compose up -d --build
docker compose ps
docker compose logs -f server gateway
```

启动顺序：MySQL 健康 → migrate 应用迁移；MinIO 健康 → minio-init 创建私有桶；迁移、Redis 和桶初始化完成 → PM2 启动 Nest；后端就绪 → Nginx 网关启动。minio-init 与 migrate 是一次性任务，正常状态为 Exited (0)。

访问 http://localhost:8080；Swagger 在 /api/docs。Nginx 托管前端构建产物，支持 SPA 路由回退，并代理 /api/ 与 /socket.io/。PM2 在后端容器中以单实例管理 Nest，日志输出到容器标准输出。当前后端镜像保留构建工具链，便于同镜像执行迁移；后续可进一步拆分精简镜像。

迁移和 PM2 的容器启动命令直接调用镜像内已安装的程序，启动阶段无需下载 pnpm，避免构建用户与运行用户的 Corepack 缓存不同导致启动失败。

凭据从根目录 .env 注入 Compose；本地 Node 开发读取 apps/server/.env。DATABASE_URL、REDIS_URL 中的密码必须符合 URL 编码要求；当前随机凭据使用十六进制字符。手工更换凭据后同步配置，已有数据卷的 MySQL 初始密码不会因修改环境变量自动更新。

```bash
# 停止容器并保留数据卷
docker compose down
```

## 验证

```bash
pnpm db:generate
pnpm db:seed
pnpm typecheck
pnpm build
pnpm test
# 前置：本地依赖已启动、迁移已应用、Nest 已启动，并且 apps/server/.env 与其配置一致
pnpm test:integration
# 完整部署验收：先启动 docker compose，本地 .env 连接同一组 MySQL、Redis、MinIO
CHAT_TEST_BASE_URL=http://localhost:8080 pnpm test:integration
# 六类列表真实游标分页回归，覆盖超过 100 条、权限与旧响应兼容，自动清理临时数据
CHAT_TEST_BASE_URL=http://localhost:8080 pnpm test:pagination
# 可选：本地 3000 后端也已启动且使用相同配置时，同时验证跨进程 Redis 广播
CHAT_TEST_BASE_URL=http://localhost:8080 CHAT_TEST_PEER_URL=http://127.0.0.1:3000 pnpm test:integration
pnpm format:check
docker compose --env-file .env.example config --quiet
```

pnpm test 使用仓储替身，覆盖真实 Nest HTTP 路由、JWT、DTO 校验、Swagger、Socket.IO 握手和广播，以及附件写入失败、响应丢失、并发去重与对账不可用时的补偿边界。

pnpm test:integration 使用本机真实 MySQL、Redis、MinIO，三个账号均通过图形验证码注册和密码登录，再验证好友、私聊、群邀请、收藏、上传下载、越权拦截及断线消息补拉。指定 CHAT_TEST_BASE_URL 后经由部署网关验证前端路由回退、资源缓存和 API/Socket.IO 代理；CHAT_TEST_PEER_URL 可让第三个账号连接另一个后端进程，验证 Redis 广播。脚本读取 apps/server/.env，拒绝其 NODE_ENV 为 production，仅用于本地验收，结束时清理自己创建的账号、会话及对象。注册限流为每 IP 每分钟 5 次，本脚本恰好使用 5 次，连续重跑需间隔至少一分钟。

页面验收路径：注册两个账号 → 搜索并发送好友申请 → 另一账号接受 → 私聊互发文本及图片/文件 → 收藏并取消 → 创建群聊并邀请好友 → 群内互聊 → 删除好友并确认私聊不能继续发送。另用第三个非成员账号验证会话、附件和收藏权限。

建议中文提交信息：feat: 完善好友私聊群聊收藏及附件消息流程

## 本次验证记录

- TypeScript 检查、前后端生产构建、Prisma schema 校验与格式检查通过。
- 16 项测试全部通过：10 项 HTTP / Socket.IO 冒烟测试覆盖验证码、注册登录、权限、参数和广播；6 项附件故障测试覆盖补偿清理与未知提交结果。
- 示例环境与本地环境的 Compose 配置解析通过；两份迁移均已应用到本机 Compose MySQL，业务表仍为七张。
- Vite 开发服务已启动，HTTP 请求登录入口成功；未进行浏览器视觉验收。
- 页面自检应为 L3（包含 Socket 订阅与清理）。当前 Work 设置禁用本地浏览器工具，因此控制台、交互、响应式和内存趋势未验证。
- 本机 MySQL、Redis、MinIO 容器健康，MinIO 私有桶初始化成功；后端与前端已启动。通过前端代理完成验证码获取、刷新、Redis TTL、错误拦截、一次性消费、真实 MySQL 注册落库和登录验证，临时账号已清理。
- 三账号真实联调通过：并发接受申请、双向好友、拒绝与重新申请、并发私聊复用、实时私聊与三人群聊、邀请权限和去重、收藏权限和去重、真实 MinIO 文件读写、中文文件名、图片识别、伪造图片降级、上传限制、历史分页与解除好友后禁止私聊发送；测试数据已清理。
- 2026-10-27 完整 Compose 部署已通过：migrate 和 minio-init 退出码均为 0，MySQL、Redis、MinIO、server、gateway 全部健康；Nginx 配置校验通过，PM2 启动 Nest 正常。
- 通过 http://localhost:8080 部署入口验证了前端七个路由回退、静态资源缓存、API/Swagger 代理、验证码注册登录、实时消息、10 MiB 上传边界与超限拒绝、下载权限、收藏、好友和群邀请等流程；容器与本地两个后端进程之间的 Redis 广播通过，断线后重新入房与补拉历史通过。
- 雾蓝与靛蓝主题整体改版后的类型检查、生产构建和格式检查通过，已更新 8080 网关且容器健康；七个前端路由、五个 JS/CSS 资源（含延迟加载页面）与本次构建逐项比对一致，API 就绪检查返回 200。本轮含会话搜索和分类状态，需要 L2 页面自检，但 Work 设置仍禁用本地浏览器工具，视觉与响应式尚未验收；此前的交互及内存趋势验收也未完成。
- 前端构建成功，但主入口约 965 kB（gzip 约 320 kB），仍有构建包体积提示。
- 2026-11-19：类型检查、生产构建、18 项测试、真实依赖业务与分页集成通过。Edge 实测自动重连分四批补齐 100 条（同步期间仍接收实时消息）、确认丢失后重试只落一条、390 px 无横向溢出；切房 8 次后仍只有一条存活连接，采样的 DOM 节点与事件监听器数量稳定。本轮未做长时间运行或吞吐压测。
