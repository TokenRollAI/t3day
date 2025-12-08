# 如何部署 The Daily Artefact

本指南涵盖本地开发和生产部署的完整流程。

## 前置要求

1. **安装工具**
   - Node.js 18+
   - Wrangler CLI: `npm install -g wrangler`

2. **Cloudflare 账户**
   - 已创建 Cloudflare 账户并关联域名
   - 获得 Cloudflare API Token (具有 Workers 和 D1 权限)

3. **外部 API 密钥**
   - OpenAI API Key (gpt-4o 模型)
   - Tavily API Key (新闻搜索)
   - Tripo 3D API Key (3D 模型生成)

## 步骤 1：克隆项目并安装依赖

```bash
git clone <repository-url>
cd today-3d
npm install
```

## 步骤 2：配置本地环境

1. **创建 `.env.local` 文件**（本地开发用）：
```
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=...
TRIPO_API_KEY=...
```

2. **初始化 Cloudflare 配置**（编辑 `wrangler.toml`）：
   - 更新 `database_id` 为实际的 D1 数据库 ID
   - 确保 `bucket_name` 对应现有的 R2 bucket

## 步骤 3：本地开发和测试

1. **启动开发服务器**
```bash
npm run dev
```
- 访问 http://localhost:8787
- 前端页面加载，显示最新模型（如果数据库有记录）

2. **测试生成逻辑**（手动触发）
```bash
npm run generate
```
- 通过 Cloudflare Cron 模拟器触发 `scheduled` 事件
- 观察日志输出，验证流程正确

3. **查看数据库**（本地 SQLite）
```bash
# 数据库文件位于 .wrangler/state/d1/ 目录
sqlite3 .wrangler/state/d1/today-3d-db.db
SELECT * FROM daily_models ORDER BY date DESC LIMIT 5;
```

## 步骤 4：部署到生产环境

1. **配置生产密钥**（使用 Wrangler Secrets）
```bash
# 逐个设置敏感信息（这些不会被提交到 git）
wrangler secret put OPENAI_API_KEY
wrangler secret put TAVILY_API_KEY
wrangler secret put TRIPO_API_KEY
```

2. **创建 D1 数据库**（如未创建）
```bash
wrangler d1 create today-3d-db
# 获得 database_id，更新到 wrangler.toml
```

3. **运行数据库迁移**
```bash
# 本地迁移
npm run db:migrate

# 生产迁移
npm run db:migrate:prod
```

4. **创建 R2 Bucket**（如未创建）
```bash
# 通过 Cloudflare 仪表板创建 bucket，命名为 today-3d-models
# 或使用 wrangler（需要额外配置）
```

5. **部署 Worker**
```bash
npm run deploy
```
- Worker 代码已部署到 Cloudflare Edge
- Cron Trigger 已激活（每天 UTC 00:00）

6. **验证部署**
```bash
# 查看已部署的 Worker
wrangler deployments list

# 访问生产 URL
curl https://your-worker.workers.dev/api/health
# 应返回 {"status":"ok","timestamp":"..."}
```

## 步骤 5：测试生产环境

1. **手动触发生成**（用于测试）
```bash
curl -X POST https://your-worker.workers.dev/api/generate \
  -H "Authorization: Bearer <TRIPO_API_KEY>"
```

2. **检查生成结果**
```bash
curl https://your-worker.workers.dev/api/today
# 返回最新的 DailyModel 数据
```

3. **前端验证**
- 访问 https://your-worker.workers.dev
- 等待 3D 模型加载
- 验证文本、坐标、描述显示正确

## 步骤 6：监控和维护

1. **查看 Worker 日志**
```bash
wrangler tail --format pretty
```

2. **监控 Cron 执行**
- Cloudflare 仪表板 → Workers → 选择 Worker → Analytics 标签
- 查看请求数、执行时间、错误率

3. **定期备份**
```bash
# 导出 D1 数据库
wrangler d1 backup create today-3d-db

# 检查 R2 bucket 容量
# 通过 Cloudflare 仪表板 R2 部分查看
```

## 故障排除

**问题：部署失败，说 database_id 不存在**
- 检查 wrangler.toml 中的 database_id 是否正确
- 运行 `wrangler d1 list` 查看所有 D1 数据库

**问题：生成任务卡在"Waiting for model"**
- 检查 Tripo API Key 是否有效
- 查看 Tripo 仪表板，确认账户配额未用尽
- 增加 waitForModel 的 maxAttempts 参数

**问题：模型文件 404**
- 检查 R2 bucket 权限配置
- 验证 model_url 中的路径是否正确（应为 /api/model/models/{date}.glb）

**问题：GPT 返回格式错误**
- 检查 GPT 系统 prompt（src/services/openai.ts 第 4-27 行）
- 确保 response_format: { type: 'json_object' } 仍然有效
- 查看 OpenAI 文档，确认 gpt-4o 支持 JSON mode

## 本地开发常用命令

```bash
npm run dev              # 启动开发服务器
npm run generate        # 手动触发生成（模拟 Cron）
npm run db:migrate      # 本地迁移数据库
npm run deploy          # 部署到生产环境
```

完成以上步骤后，The Daily Artefact 应该在生产环境中自动运行，每天 UTC 00:00 生成新内容。
