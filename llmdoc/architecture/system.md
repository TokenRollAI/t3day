# The Daily Artefact 系统架构

## 1. Identity

- **What it is:** 完整的 Cloudflare Workers 无服务器架构，包含 HTTP API、定时任务处理和前端 3D 渲染。
- **Purpose:** 每天自动生成、存储和展示一个代表当日新闻事件的 3D 模型。

## 2. Core Components

- `src/index.ts` (`generateDailyArtefact`, `resumeTask`, `finishGeneration`): Hono 应用入口，处理 HTTP 路由、核心生成逻辑和任务恢复机制。
- `src/types.ts` (`Env`, `DailyModel`, `GeneratedContent`, `TripoTaskStatus`, `TaskState`): TypeScript 类型定义，包括新的 `TaskState` 用于存储图片/模型阶段状态。
- `src/services/tavily.ts` (`searchTodayNews`): 调用 Tavily API 搜索当日新闻，返回最多 10 条结果。
- `src/services/openai.ts` (`generateDailyContent`): 使用 GPT-4o 选择新闻、生成解说词、模型 prompt 和地理坐标。
- `src/services/tripo.ts` (`createImageTask`, `createImageToModelTask`, `waitForImage`, `waitForModel`, `downloadModel`): 与 Tripo 3D API 交互，支持两步流程（图片生成 → 图片转模型）。
- `src/services/storage.ts` (`createPendingRecord`, `completeRecord`, `getRecordByDate`, `getPendingRecord`, `uploadModelToR2`): 操作 D1 数据库和 R2 对象存储，支持任务状态持久化。
- `public/index.html` (Three.js, OrbitControls, GLTFLoader, i18n): 前端 SPA，支持日期路由、中英文自动切换、Umami 统计。
- `migrations/0001_init.sql` (daily_models): 数据库初始化脚本，定义 daily_models 表，包括 status 和 tripo_task_id 字段。

## 3. Execution Flow (LLM Retrieval Map)

### A. Daily Generation Pipeline（两步流程：图片 → 模型）

```
Cloudflare Cron (UTC 00:00) / POST /api/generate
    ↓
src/index.ts:376-466 (generateDailyArtefact 函数)
    │
    ├─ 1. Check Completion: src/index.ts:380-383 (getRecordByDate)
    │    └─ 如果已完成则返回，避免重复生成
    │
    ├─ 2. Check Pending Task: src/index.ts:387-391 (getPendingRecord)
    │    └─ 如果有未完成的任务，调用 resumeTask 恢复
    │
    ├─ 3. Search News: src/services/tavily.ts (searchTodayNews)
    │    └─ POST 请求 api.tavily.com，获取当日最有趣新闻 (最多 10 条)
    │
    ├─ 4. Generate Content: src/services/openai.ts (generateDailyContent)
    │    └─ 调用 GPT-4o，生成内容和 3D prompt
    │    └─ 返回：title, description, latitude, longitude, location_name, model_prompt, source_event
    │
    ├─ STEP 1: Image Generation (nano banana)
    │    │
    │    ├─ 5a. Create Image Task: src/services/tripo.ts:9-33 (createImageTask)
    │    │     └─ POST /v2/openapi/task，type=generate_image
    │    │     └─ model=gemini_2.5_flash_image_preview (nano banana)
    │    │     └─ 返回 imageTaskId
    │    │
    │    ├─ 6a. Save Pending Record: src/services/storage.ts:32-80 (createPendingRecord)
    │    │     └─ INSERT 到 D1，status='generating'
    │    │     └─ tripo_task_id = JSON 格式的状态：{stage:'image', imageTaskId}
    │    │
    │    └─ 7a. Wait for Image: src/services/tripo.ts:128-156 (waitForImage)
    │         └─ 轮询 Tripo API (最多 20 次，每 5 秒)
    │         └─ 等待 status='success'，返回 generated_image URL
    │
    ├─ STEP 2: Image to Model（从图片生成 3D 模型）
    │    │
    │    ├─ 5b. Create Model Task: src/services/tripo.ts:38-72 (createImageToModelTask)
    │    │     └─ POST /v2/openapi/task，type=image_to_model
    │    │     └─ file={type:png, url:imageUrl}
    │    │     └─ 返回 modelTaskId
    │    │
    │    ├─ 6b. Update Task State: src/index.ts:309-315 (updateTaskState)
    │    │     └─ 更新 D1 记录，tripo_task_id = {stage:'model', imageTaskId, imageUrl, modelTaskId}
    │    │
    │    └─ 7b. Wait for Model: src/services/tripo.ts:161-187 (waitForModel)
    │         └─ 轮询 Tripo API (最多 40 次，每 30 秒)
    │         └─ 等待 status='success'，返回 pbr_model URL
    │
    └─ 8. Finish: src/index.ts:364-373 (finishGeneration)
         ├─ Download Model: src/services/tripo.ts:215-221 (downloadModel)
         │  └─ 下载 GLB 二进制文件到内存
         │
         ├─ Upload to R2: src/services/storage.ts:6-20 (uploadModelToR2)
         │  └─ 上传到 R2，路径格式：models/{date}.glb
         │
         └─ Complete Record: src/services/storage.ts:85-99 (completeRecord)
            └─ UPDATE D1，status='completed'，model_url=R2路径
```

### B. HTTP API Flows

**获取最新记录**
```
GET /api/today
    ↓
src/index.ts:48-68
    ↓
src/services/storage.ts (getLatestRecord, getPrevRecord, getNextRecord)
    ↓
返回 DailyModel JSON (含 model_url: /api/model/models/{date}.glb，has_prev, has_next)
```

**按日期获取特定记录**
```
GET /api/date/:date
    ↓
src/index.ts:71-92
    ↓
src/services/storage.ts (getRecordByDate, getPrevRecord, getNextRecord)
    ↓
返回 DailyModel JSON（如果存在且状态为 completed）
```

**代理 R2 模型文件**
```
GET /api/model/:key
    ↓
src/index.ts:152-169
    ↓
c.env.MODELS_BUCKET.get(key)
    ↓
返回 GLB 二进制 (Content-Type: model/gltf-binary)
```

**手动触发生成（当天）**
```
POST /api/generate
    Authorization: Bearer {TRIPO_API_KEY}
    ↓
src/index.ts:172-185
    ↓
调用 generateDailyArtefact(env)
```

**指定日期生成**
```
POST /api/generate/:date
    Authorization: Bearer {TRIPO_API_KEY}
    ↓
src/index.ts:188-207
    ↓
调用 generateDailyArtefact(env, date)
```

**恢复未完成的任务（从图片或模型阶段）**
```
POST /api/resume/:date
    Authorization: Bearer {TRIPO_API_KEY}
    ↓
src/index.ts:236-275 (resumeTask 函数)
    ├─ 获取待处理记录 (status='generating')
    ├─ 解析 tripo_task_id 中的 JSON 状态
    ├─ 如果在图片阶段，等待图片完成后创建模型任务
    ├─ 如果在模型阶段，直接等待模型完成
    └─ 完成后更新为 status='completed'
```

### C. Frontend 3D Rendering

```
public/index.html
    ├─ 1. Fetch Data: fetch('/api/today')
    ├─ 2. Load Model: GLTFLoader.load(data.model_url)
    ├─ 3. Setup Scene: Three.js Scene, PerspectiveCamera, WebGLRenderer
    ├─ 4. Add Lights: AmbientLight, DirectionalLight (×3)
    ├─ 5. Auto Rotate: OrbitControls.autoRotate (由用户交互中断)
    ├─ 6. Display Text:
    │    ├─ 日期格式化 (MMM DD)
    │    ├─ 坐标格式化 (N/S, E/W)
    │    └─ 描述打字机效果 (typeWriter 函数)
    └─ 7. Render Loop: requestAnimationFrame
```

## 4. Data Models

**DailyModel** (src/types.ts)
```
- id: 自增主键
- date: YYYY-MM-DD (唯一约束)
- title: 事件简短标题
- description: 戏谑解说词（中文）
- latitude/longitude: 事件地理坐标
- location_name: 地点名称
- model_url: API 代理路由 (/api/model/...)，完成后才填充
- model_prompt: 用于生成 3D 模型的英文 prompt
- source_event: 原始新闻摘要
- tripo_task_id: JSON 格式的任务状态（支持任务恢复）
  - 图片阶段: {"stage":"image", "imageTaskId":"..."}
  - 模型阶段: {"stage":"model", "imageTaskId":"...", "imageUrl":"...", "modelTaskId":"..."}
- status: 记录状态（'generating' 或 'completed'）
- created_at: 记录创建时间戳
```

## 5. Design Rationale

**为什么采用两步流程（图片 → 模型）而不是直接文本转模型？**
- Tripo 的 text_to_model 速度较慢且成功率不稳定
- 两步流程：先用 nano banana 快速生成中间图片，再从图片生成高质量 3D 模型
- 提高成功率，缩短总耗时，更易调试

**为什么要持久化任务状态（tripo_task_id 字段）？**
- Tripo 生成过程可能耗时很长（图片 5-100 秒，模型 30-120 秒）
- 任务可能在中途中断（网络超时、Worker 超限等）
- JSON 格式保存阶段信息，支持从任意阶段恢复，无需重新开始
- `/api/resume/:date` 端点用于继续未完成的任务

**为什么使用 status 字段跟踪记录状态？**
- 'generating'：内容已生成，正在等待 3D 模型
- 'completed'：整个流程完成，可向用户展示
- 易于区分哪些记录可以显示，哪些需要恢复

**为什么拆分成多个 service 文件？**
- 关注点分离：每个外部 API（Tavily, OpenAI, Tripo）对应一个 service
- 易于测试和维护：可独立测试每个集成点
- 复用性：storage 操作在多处使用

**为什么使用 R2 而不是 D1 直接存储 GLB？**
- GLB 文件通常 10-100MB，不适合放在数据库
- R2 提供优化的对象存储，支持 HTTP Range requests（流式下载）
- 可以配置公开访问或通过 Worker 代理

**前端为什么采用极简设计加新布局？**
- 3D 模型本身是焦点，左侧时间信息和右侧文字作为补充
- 暗色背景优化 3D 渲染视觉效果
- URL 路由支持 `/2025-12-08` 格式，方便分享具体日期的链接
- 中英文自动切换基于浏览器语言，提升国际化体验
