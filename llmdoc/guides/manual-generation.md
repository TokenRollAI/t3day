# 如何手动触发每日内容生成

手动生成用于测试、调试或在特定时间强制更新内容。

## 方法 1：通过 API 端点（推荐）

这是最直接的方法，适合在任何环境使用。

1. **发送 POST 请求**
```bash
curl -X POST https://your-worker.workers.dev/api/generate \
  -H "Authorization: Bearer <TRIPO_API_KEY>"
```

2. **等待响应**
   - 通常需要 1-3 分钟（Tripo 3D 模型生成时间）
   - 返回完整的 `DailyModel` 对象（JSON）

3. **验证生成**
```bash
curl https://your-worker.workers.dev/api/today
```
- 检查返回数据中的日期是否为今天
- 验证 model_url 可以正常访问

## 方法 2：本地开发环境模拟 Cron

在本地开发时测试完整的 Cron 流程。

1. **启动开发服务器并触发 Cron**
```bash
npm run generate
```
- Wrangler 会启动开发服务器并模拟 Cron 事件
- 观察控制台日志，跟踪生成进度

2. **查看本地数据库**
```bash
sqlite3 .wrangler/state/d1/today-3d-db.db
SELECT * FROM daily_models WHERE date = date('now') ORDER BY date DESC;
```

3. **访问本地前端**
- 打开 http://localhost:8787
- 刷新页面，应显示最新生成的模型

## 方法 3：强制重新生成（生产环境）

如果需要替换今天的内容（例如改进了 GPT prompt）：

1. **删除今日记录**（需要 D1 CLI 访问权限）
```bash
wrangler d1 execute today-3d-db \
  --remote \
  --command "DELETE FROM daily_models WHERE date = date('now');"
```

2. **手动触发生成**
```bash
curl -X POST https://your-worker.workers.dev/api/generate \
  -H "Authorization: Bearer <TRIPO_API_KEY>"
```

3. **验证新内容**
```bash
curl https://your-worker.workers.dev/api/today
```

## 权限说明

- **API Key 安全**：生产环境中 TRIPO_API_KEY 通过 Wrangler Secrets 存储，不会显示在代码或日志中
- **Bearer 认证**：简单的令牌认证，防止未授权调用
- **建议**：在生产环境中用更强的认证机制（JWT、IP 白名单等）

## 常见问题

**Q: 为什么生成失败？**
- 检查 API Keys 是否有效（Tavily、OpenAI、Tripo）
- 查看日志中的具体错误信息（使用 `wrangler tail`）
- 确认账户未超过 API 配额

**Q: 如何只测试流程的某一部分（不调用 Tripo）？**
- 编辑 src/index.ts，在 generateDailyArtefact 中插入 mock 数据
- 例如，跳过 Tripo 调用，使用预生成的 GLB 文件

**Q: 生成成功但前端显示 404？**
- 检查 R2 模型文件是否正确上传
- 确认 /api/model/{key} 路由能正常访问
- 查看浏览器开发者工具的网络标签，确认请求内容

## 监控和日志

**本地开发**：
- 开发服务器控制台直接显示日志
- 可使用 `console.log` 在 src/index.ts 和 services 中追踪

**生产环境**：
```bash
# 实时查看 Worker 日志（最近 30 秒）
wrangler tail

# 过滤特定日志
wrangler tail --status success
wrangler tail --status error
```
