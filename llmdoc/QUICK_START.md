# 快速开始卡片

## 5 分钟了解项目

### 项目是什么？
"每日一物"3D 纪念碑应用 - 每天自动从全球新闻中选一个有趣事件，用 GPT 生成戏谑解说词，用 Tripo 3D API 生成三维模型，存到 R2，前端用 Three.js 渲染。

### 技术栈一句话
Cloudflare Workers (Hono) + D1 + R2 + Three.js + OpenAI + Tavily + Tripo 3D

### 数据流（30 秒版本）
```
Cron (每日 UTC 00:00)
  ↓
Tavily (搜新闻) → GPT-4o (写段落和 prompt) → Tripo (生成 GLB)
  ↓
上传到 R2，记录到 D1
  ↓
前端：Three.js 渲染模型 + 极简 UI
```

## 快速操作

### 本地开发 (2 分钟)
```bash
npm install
npm run dev                    # 访问 localhost:8787
npm run generate              # 手动触发（模拟 Cron）
```

### 部署 (5 分钟)
```bash
wrangler secret put OPENAI_API_KEY
wrangler secret put TAVILY_API_KEY
wrangler secret put TRIPO_API_KEY
npm run deploy
```

### 手动生成内容
```bash
curl -X POST https://your-worker.dev/api/generate \
  -H "Authorization: Bearer <TRIPO_API_KEY>"
```

### 查看最新内容
```bash
curl https://your-worker.dev/api/today
```

## 文件导航 (30 秒)

| 我需要... | 查看这个文件 |
|---------|-----------|
| 理解项目 | overview/project.md |
| 看系统架构 | architecture/system.md |
| 部署或本地开发 | guides/deployment.md |
| 查 API 端点 | reference/api.md |
| 配置环境变量 | reference/environment-variables.md |
| 查数据库结构 | reference/database-schema.md |

## 关键文件地图

```
src/index.ts              ← 主入口，路由和 Cron 处理
src/services/
  ├── tavily.ts           ← 新闻搜索
  ├── openai.ts           ← GPT 内容生成
  ├── tripo.ts            ← 3D 模型任务管理
  └── storage.ts          ← D1 和 R2 操作
public/index.html         ← 前端渲染
migrations/0001_init.sql  ← 数据库初始化
```

## 常用命令速查

```bash
npm run dev                      # 启动开发服务器
npm run generate                 # 测试生成（模拟 Cron）
npm run db:migrate               # 本地数据库迁移
npm run db:migrate:prod          # 生产数据库迁移
npm run deploy                   # 部署到生产
```

## 调试技巧

**查看 Worker 日志**
```bash
wrangler tail --format pretty
```

**测试单个 API**
```bash
curl https://your-worker.dev/api/health          # 健康检查
curl https://your-worker.dev/api/today           # 获取最新
```

**本地数据库操作**
```bash
sqlite3 .wrangler/state/d1/today-3d-db.db "SELECT COUNT(*) FROM daily_models;"
```

## 常见问题速答

**Q: 生成失败？**
A: 检查 API Keys（Tavily, OpenAI, Tripo），查看日志：`wrangler tail`

**Q: 模型 404？**
A: 检查 R2 权限，确认 model_url 路径正确

**Q: 本地和生产不一样？**
A: 本地用 .env.local，生产用 wrangler secrets；确保 database_id 不同

## 文档全导航

- 📖 [完整文档索引](index.md)
- 🎯 [项目概述](overview/project.md)
- 🏗️ [系统架构](architecture/system.md)
- 🚀 [部署指南](guides/deployment.md)
- ⚙️ [手动生成](guides/manual-generation.md)
- 🔌 [API 参考](reference/api.md)
- 🗄️ [数据库](reference/database-schema.md)
- 🔑 [环保变量](reference/environment-variables.md)

---

**提示**：新手建议顺序阅读 project.md → system.md → deployment.md
