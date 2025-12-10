# The Daily Artefact - 每日一物 3D 纪念碑

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

一个全自动的"每日一物"3D 纪念碑应用，每天从全球新闻中精选一个有趣事件，生成戏谑解说词和三维模型来纪念它。

🌐 **在线体验**：[https://today.tokenroll.ai](https://today.tokenroll.ai) - 在线体验应用

## ✨ 特性

- **完全自动化**：每日内容生成，无需人工干预
- **AI 驱动**：使用 GPT 从新闻中创建戏谑解说词和 3D 模型提示词
- **两步生成**：图片 → 模型工作流程，提高成功率和质量
- **任务恢复**：可从中断点恢复生成过程
- **多语言支持**：前端根据浏览器语言自动显示中文或英文
- **3D 可视化**：使用 Three.js 渲染的交互式 3D 模型
- **URL 路由**：支持`/YYYY-MM-DD`格式分享特定日期
- **零服务器**：完全基于 Cloudflare 全球分布式基础设施

## 🏗️ 架构

The Daily Artefact 是一个完全自动化的内容生成管道，运行在 Cloudflare Workers 无服务器平台上。系统每天自动：

1. **搜集**：使用 Tavily API 搜索当日全球新闻，筛选有趣的事件
2. **创作**：调用 GPT 生成：
   - 事件的戏谑解说词（中文，2-3 句话，像朋友聊天）
   - 代表事件的虚拟"物件"
   - 该物件的 3D 生成提示词（英文）
   - 地理坐标和位置信息
3. **建模**（两步流程）：
   - **Step 1**：使用 Tripo Nano Banana 快速生成中间图片
   - **Step 2**：使用生成的图片调用 Tripo 3D API 生成高质量 GLB 3D 模型
   - **任务恢复**：如果流程中断，可通过`/api/resume/:date`从中断处继续
4. **存储**：将模型上传到 Cloudflare R2，记录元数据到 D1 SQLite 数据库
5. **展示**：前端通过 Three.js 实时渲染 3D 模型，配合新布局和交互体验

整个流程完全自动化，通过 Cloudflare Cron Triggers 每天 UTC 00:00（北京时间 08:00）自动执行。用户访问页面时，实时获取最新生成的模型和内容。

## 🚀 快速开始

### 前置要求

- Node.js 18+
- Cloudflare 账户
- OpenAI、Tavily 和 Tripo 的 API 密钥

### 安装

1. 克隆此仓库：

```bash
git clone https://github.com/yourusername/today-3d.git
cd today-3d
```

2. 安装依赖：

```bash
npm install
```

3. 登录 Cloudflare：

```bash
npx wrangler login
```

4. 创建 D1 数据库：

```bash
npx wrangler d1 create today-3d-db
```

5. 使用你的数据库 ID 更新`wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "today-3d-db"
database_id = "你的-database-id"  # 替换这里
```

6. 创建 R2 存储桶：

```bash
npx wrangler r2 bucket create today-3d-models
```

7. 设置环境变量：

```bash
# 为本地开发创建.dev.vars
cp .dev.vars.example .dev.vars
# 编辑.dev.vars填入真实的API密钥

# 设置生产环境密钥
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put TAVILY_API_KEY
npx wrangler secret put TRIPO_API_KEY
```

8. 运行数据库迁移：

```bash
# 本地
npm run db:migrate

# 生产环境
npm run db:migrate:prod
```

### 开发

启动开发服务器：

```bash
npm run dev
```

访问 http://localhost:8787 查看应用。

### 部署

部署到生产环境：

```bash
npm run deploy
```

## 📡 API 端点

| 端点                    | 方法 | 描述                             |
| ----------------------- | ---- | -------------------------------- |
| `/api/health`           | GET  | 健康检查                         |
| `/api/today`            | GET  | 获取今日/最新模型数据            |
| `/api/date/:date`       | GET  | 获取指定日期的模型数据           |
| `/api/date/:date/prev`  | GET  | 获取前一天的模型                 |
| `/api/date/:date/next`  | GET  | 获取后一天的模型                 |
| `/api/dates`            | GET  | 获取所有可用日期                 |
| `/api/model/:key`       | GET  | 从 R2 获取 GLB 模型文件          |
| `/api/generate`         | POST | 手动触发生成（需要认证）         |
| `/api/generate/:date`   | POST | 为指定日期生成（需要认证）       |
| `/api/regenerate/:date` | POST | 强制重新生成指定日期（需要认证） |
| `/api/resume/:date`     | POST | 恢复中断的任务（需要认证）       |
| `/api/translate/:date`  | POST | 翻译指定日期的记录（需要认证）   |
| `/api/translate-all`    | POST | 批量翻译所有记录（需要认证）     |

## 🛠️ 技术栈

- **后端**：Cloudflare Workers + Hono 框架（TypeScript）
- **数据库**：Cloudflare D1（SQLite）
- **存储**：Cloudflare R2
- **前端**：原生 JavaScript + Three.js + OrbitControls + GLTFLoader
- **外部 API**：
  - Tavily API（新闻搜索）
  - OpenAI API（内容生成）
  - Tripo 3D API（图片和模型生成）
- **分析**：Umami 用户行为追踪

## 📁 项目结构

```
today-3d/
├── src/
│   ├── index.ts          # 主入口，Hono应用
│   ├── types.ts          # TypeScript类型定义
│   └── services/
│       ├── tavily.ts     # Tavily搜索API
│       ├── openai.ts     # GPT内容生成
│       ├── tripo.ts      # Tripo 3D模型生成
│       ├── storage.ts    # D1 + R2存储操作
│       └── translate.ts  # 翻译服务
├── migrations/
│   ├── 0001_init.sql     # 数据库初始化
│   ├── 0002_add_task_id.sql
│   └── 0002_add_translations.sql
├── public/
│   └── index.html        # 前端应用
├── scripts/              # 实用脚本
├── llmdoc/              # 项目文档
├── wrangler.toml        # Cloudflare配置
└── package.json
```

## 🌍 国际化

前端支持多种语言，并自动检测用户的浏览器语言：

- 中文（zh）- 默认
- 英文（en）
- 日文（ja）
- 韩文（ko）
- 西班牙文（es）
- 俄文（ru）
- 葡萄牙文（pt）

内容最初以中文生成，并使用 OpenAI API 自动翻译成其他语言。

## 💰 费用估算（月度）

| 服务    | 免费额度     | 预计使用 |
| ------- | ------------ | -------- |
| Workers | 10 万请求/天 | ✅ 免费  |
| D1      | 5GB 存储     | ✅ 免费  |
| R2      | 10GB 存储    | ✅ 免费  |
| OpenAI  | -            | ~$1-3    |
| Tavily  | 1000 次/月   | ✅ 免费  |
| Tripo   | 按量计费     | ~$5-10   |

**总计：约$10-15/月**（主要是 3D 生成费用）

## 🤝 贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 此项目
2. 创建你的功能分支（`git checkout -b feature/AmazingFeature`）
3. 提交你的更改（`git commit -m 'Add some AmazingFeature'`）
4. 推送到分支（`git push origin feature/AmazingFeature`）
5. 打开 Pull Request

## 📄 许可证

此项目采用 MIT 许可证 - 查看[LICENSE](LICENSE)文件了解详情。

## 🙏 致谢

- [Tripo](https://tripo3d.ai/) - 3D 模型生成 API
- [Cloudflare](https://www.cloudflare.com/) - 无服务器平台和服务
- [Three.js](https://threejs.org/) - 3D 图形库
- [Hono](https://hono.dev/) - Web 框架
- [Tavily](https://tavily.com/) - 搜索 API
- [OpenAI](https://openai.com/) - AI 内容生成

## 📞 联系

如果您有任何问题或建议，请随时提出 issue 或联系项目维护者。

---

**用 ❤️ 和 AI 构建**
