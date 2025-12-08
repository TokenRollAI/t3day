# The Daily Artefact - 部署指南

## 项目概述

每天自动从全球新闻中选择一个事件，生成一个 3D 物件来纪念它。

**技术栈:**
- Cloudflare Workers + Hono (后端)
- Cloudflare D1 (数据库)
- Cloudflare R2 (模型存储)
- Cloudflare Cron Triggers (定时任务)
- Three.js (前端 3D 渲染)

---

## 部署步骤

### 1. 登录 Cloudflare

```bash
npx wrangler login
```

### 2. 创建 D1 数据库

```bash
npx wrangler d1 create today-3d-db
```

复制输出的 `database_id`，更新 `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "today-3d-db"
database_id = "你的-database-id"   # <-- 替换这里
```

### 3. 执行数据库迁移

```bash
# 本地测试
npm run db:migrate

# 远程生产环境
npm run db:migrate:prod
```

### 4. 创建 R2 存储桶

```bash
npx wrangler r2 bucket create today-3d-models
```

### 5. 设置 API 密钥

```bash
# OpenAI API Key
npx wrangler secret put OPENAI_API_KEY

# Tavily API Key
npx wrangler secret put TAVILY_API_KEY

# Tripo 3D API Key
npx wrangler secret put TRIPO_API_KEY
```

### 6. 本地开发

创建 `.dev.vars` 文件:

```bash
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填入真实的 API Key
```

启动开发服务器:

```bash
npm run dev
```

访问 http://localhost:8787

### 7. 部署到生产环境

```bash
npm run deploy
```

---

## 手动触发生成

部署后，可以手动触发今日内容生成:

```bash
curl -X POST https://your-worker.workers.dev/api/generate \
  -H "Authorization: Bearer 你的TRIPO_API_KEY"
```

或者测试 Cron:

```bash
npm run generate
```

---

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/health` | GET | 健康检查 |
| `/api/today` | GET | 获取今日/最新模型数据 |
| `/api/model/:key` | GET | 获取 R2 中的 GLB 模型文件 |
| `/api/generate` | POST | 手动触发生成 (需认证) |

---

## 项目结构

```
today-3d/
├── src/
│   ├── index.ts          # 主入口，Hono 应用
│   ├── types.ts          # TypeScript 类型定义
│   └── services/
│       ├── tavily.ts     # Tavily 搜索 API
│       ├── openai.ts     # GPT 内容生成
│       ├── tripo.ts      # Tripo 3D 模型生成
│       └── storage.ts    # D1 + R2 存储操作
├── migrations/
│   └── 0001_init.sql     # 数据库初始化
├── public/
│   └── index.html        # 前端页面
├── wrangler.toml         # Cloudflare 配置
└── package.json
```

---

## Cron 触发时间

默认配置为 UTC 00:00 (北京时间 08:00):

```toml
[triggers]
crons = ["0 0 * * *"]
```

可根据需要调整。

---

## 费用估算 (月度)

| 服务 | 免费额度 | 预计使用 |
|------|---------|---------|
| Workers | 100K 请求/天 | ✅ 免费 |
| D1 | 5GB | ✅ 免费 |
| R2 | 10GB 存储 | ✅ 免费 |
| OpenAI | - | ~$1-3 |
| Tavily | 1000次/月 | ✅ 免费 |
| Tripo | 按量计费 | ~$5-10 |

总计: **~$10-15/月** (主要是 3D 生成费用)
