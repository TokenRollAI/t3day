# 环境变量参考

系统使用的所有环境变量和配置参数完整列表。

## 概述

环境变量分为两类：
1. **Cloudflare 绑定**（自动注入）：DB, MODELS_BUCKET
2. **API Keys**（通过 Wrangler Secrets 设置）：OPENAI_API_KEY, TAVILY_API_KEY, TRIPO_API_KEY
3. **应用配置**（wrangler.toml 中定义）：ENVIRONMENT

## 详细列表

### API Keys (敏感信息)

这些应通过 `wrangler secret put` 设置，**不应提交到 git**。

| 变量名 | 说明 | 获取方式 | 示例 |
|--------|------|---------|------|
| OPENAI_API_KEY | OpenAI API 密钥，用于 GPT-4o 调用 | https://platform.openai.com/account/api-keys | `sk-proj-...` |
| TAVILY_API_KEY | Tavily API 密钥，用于新闻搜索 | https://tavily.com/dashboard | `tvly-...` |
| TRIPO_API_KEY | Tripo 3D API 密钥，用于模型生成 | https://www.tripo3d.ai/account/api-keys | `...` |

**设置方法**

```bash
wrangler secret put OPENAI_API_KEY
# 粘贴值，Enter 两次确认

wrangler secret put TAVILY_API_KEY
wrangler secret put TRIPO_API_KEY
```

**验证已设置的密钥**

```bash
# 列出已设置的 secrets（不显示值）
wrangler secret list
```

### Cloudflare 绑定 (自动注入)

由 wrangler.toml 中的绑定配置自动注入 `env` 对象。

| 变量名 | 类型 | 说明 | 来源 |
|--------|------|------|------|
| DB | D1Database | SQLite 数据库实例 | wrangler.toml `[[d1_databases]]` |
| MODELS_BUCKET | R2Bucket | 3D 模型存储桶 | wrangler.toml `[[r2_buckets]]` |

**配置示例** (wrangler.toml)

```toml
[[d1_databases]]
binding = "DB"
database_name = "today-3d-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

[[r2_buckets]]
binding = "MODELS_BUCKET"
bucket_name = "today-3d-models"
```

### 应用配置 (wrangler.toml)

| 变量名 | 值 | 说明 |
|--------|----|----|
| ENVIRONMENT | "development" 或 "production" | 当前运行环境 |
| compatibility_date | "2025-01-01" | Cloudflare Workers 兼容性日期 |

**查询当前值**

```typescript
// 在代码中访问
const env = c.env; // Hono context
console.log(env.ENVIRONMENT); // "development"
```

## 按场景的配置

### 本地开发

1. **创建 `.env.local` 文件**（仅限本地，已在 .gitignore）
```
OPENAI_API_KEY=sk-...
TAVILY_API_KEY=tvly-...
TRIPO_API_KEY=...
```

2. **加载环境变量**
```bash
# 使用 Wrangler dev，它会自动读取 .env.local
npm run dev
```

3. **本地数据库**
- D1 自动在 `.wrangler/state/d1/` 创建本地 SQLite 文件
- 无需手动配置

### 生产环境

1. **设置 Secrets**
```bash
wrangler secret put OPENAI_API_KEY --env production
wrangler secret put TAVILY_API_KEY --env production
wrangler secret put TRIPO_API_KEY --env production
```

2. **验证绑定**
- 确保 wrangler.toml 中的 database_id 和 bucket_name 正确
- 这些不需要通过 secrets 设置，因为 Cloudflare 仪表板已关联

3. **部署**
```bash
wrangler deploy --env production
```

## 类型定义

在 TypeScript 中，所有环境变量通过 `Env` 接口定义：

```typescript
// src/types.ts
export interface Env {
  DB: D1Database;
  MODELS_BUCKET: R2Bucket;
  OPENAI_API_KEY: string;
  TAVILY_API_KEY: string;
  TRIPO_API_KEY: string;
  ENVIRONMENT: string;
}
```

**在代码中使用**

```typescript
// Hono 中自动类型化
export default {
  async fetch(request: Request, env: Env) {
    const apiKey = env.OPENAI_API_KEY; // 类型安全
  }
}
```

## 访问外部 API 时的使用

### OpenAI (GPT-4o)
```typescript
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
// 见 src/services/openai.ts:36
```

### Tavily (新闻搜索)
```typescript
const response = await fetch('https://api.tavily.com/search', {
  body: JSON.stringify({
    api_key: env.TAVILY_API_KEY,
    // ...
  })
});
// 见 src/services/tavily.ts:16
```

### Tripo (3D 生成)
```typescript
const response = await fetch(`${TRIPO_API_BASE}/task`, {
  headers: {
    'Authorization': `Bearer ${env.TRIPO_API_KEY}`,
    // ...
  }
});
// 见 src/services/tripo.ts:16
```

## 故障排除

**问题：Local Dev 显示 "API Key not provided"**
- 检查 `.env.local` 文件是否存在且包含正确的 keys
- 确保 `npm run dev` 正确读取了该文件
- 尝试重启开发服务器

**问题：生产部署失败 "undefined secret"**
- 检查已设置的 secrets: `wrangler secret list`
- 确认 src/index.ts 中的变量名与 secret 名完全匹配（区分大小写）
- 使用 `wrangler secret put` 重新设置

**问题：API 调用返回 401 Unauthorized**
- 检查 API Key 是否有效（在对应的服务网站测试）
- 确认 Key 未过期或已被撤销
- 确认 Key 有足够的权限（例如 OpenAI 的 gpt-4o 模型访问权限）

**问题：本地和生产表现不同**
- 本地使用 `.env.local`，生产使用 wrangler secrets
- 确保两端的 API Keys 相同
- 检查 database_id 在本地和生产是否不同（本地用本地 DB，生产用远程 DB）

## 安全最佳实践

1. **永不在代码中硬编码 Keys**
2. **不提交 .env.local 到版本控制**
   - 已在 .gitignore 中
3. **定期轮换 API Keys**
4. **使用最小权限原则**
   - 给予 API Keys 仅需的最小权限
5. **监控 API 使用**
   - 定期检查各 API 的使用情况和账单

## 代码参考

- **环境变量定义**：`src/types.ts:2-13`
- **本地开发示例**：`.env.local` (git ignore)
- **生产配置**：`wrangler.toml`
