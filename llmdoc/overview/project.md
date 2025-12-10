# The Daily Artefact 项目

## 1. Identity

- **What it is:** 一个全自动的"每日一物"3D 纪念碑应用，每天从全球新闻中精选一个有趣事件，生成戏谑解说词和三维模型。
- **Purpose:** 用创意和幽默的方式记录世界每天发生的故事，将抽象事件具象化为三维艺术品。

## 2. High-Level Description

The Daily Artefact 是一个完全自动化的内容生成管道，运行在 Cloudflare Workers 无服务器平台上。系统每天自动：

1. **搜集**：使用 Tavily API 搜索当日全球新闻，筛选有趣的事件
2. **创作**：调用 gemini-3.0-pro 生成：
   - 事件的戏谑解说词（中文，2-3 句话，像朋友聊天）
   - 代表事件的虚拟"物件"
   - 该物件的 3D 生成 prompt（英文）
   - 地理坐标和位置信息
3. **建模**（两步流程）：
   - **Step 1**: 使用 Tripo Nano Banana (gemini_2.5_flash_image_preview) 快速生成中间图片
   - **Step 2**: 使用生成的图片调用 Tripo 3D API 生成高质量 GLB 3D 模型
   - **任务恢复**: 如果流程中断，可通过 `/api/resume/:date` 从中断处继续
4. **存储**：将模型上传到 Cloudflare R2，记录元数据到 D1 SQLite 数据库
5. **展示**：前端通过 Three.js 实时渲染 3D 模型，配合新布局和交互体验

整个流程完全自动化，通过 Cloudflare Cron Triggers 每天 UTC 00:00（北京时间 08:00）自动执行。用户访问页面时，实时获取最新生成的模型和内容。

## 3. Key Characteristics

- **零服务器**：完全基于 Cloudflare 全球分布式基础设施
- **实时内容**：每天自动更新，无需人工干预
- **两步生成流程**：先图片后模型，提高成功率和质量，支持中断恢复
- **任务持久化**：支持从图片或模型阶段恢复，避免重复计算
- **创意驱动**：通过 AI 让新闻变得有趣和可视化
- **极简美学**：前端采用暗色设计，左侧时间信息 + 右侧文字描述
- **国际化支持**：前端自动根据浏览器语言显示中文或英文
- **URL 路由**：支持 `/2025-12-08` 格式分享具体日期的链接
- **数据统计**：集成 Umami 埋点追踪用户行为

## 4. Technical Stack

- **后端**：Cloudflare Workers + Hono 框架 (TypeScript)
- **数据库**：Cloudflare D1 (SQLite)
- **对象存储**：Cloudflare R2
- **前端**：Vanilla JavaScript + Three.js + OrbitControls + GLTFLoader
- **外部 API**：
  - Tavily API（新闻搜索）
  - OpenAI API（内容生成）
  - Tripo 3D API（图片和模型生成）
- **分析**：Umami 埋点统计

## 5. Recent Major Updates (Dec 2025)

### 生成流程重构

- 从单步 `text_to_model` 改为两步流程：图片生成 → 模型生成
- 使用 Tripo Nano Banana 快速生成图片中间物
- 支持任务状态持久化和中断恢复

### 前端增强

- **URL 路由**：支持 `/2025-12-08` 格式访问特定日期
- **新布局**：左侧时间面板（年份、日期、月份、坐标、地点），右侧描述面板（标题、描述、来源）
- **国际化**：自动根据浏览器语言显示中英文
- **SPA 支持**：通过 wrangler assets binding 实现完整的单页应用路由

### 基础设施

- 添加 favicon 和 apple-touch-icon
- Umami 用户行为分析
- "Powered by Tripo" 链接和点击统计
