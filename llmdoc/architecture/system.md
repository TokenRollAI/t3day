# The Daily Artefact 系统架构

## 1. Identity

- **What it is:** 完整的 Cloudflare Workers 无服务器架构，包含 HTTP API、定时任务处理和前端 3D 渲染。
- **Purpose:** 每天自动生成、存储和展示一个代表当日新闻事件的 3D 模型。

## 2. Core Components

- `src/index.ts` (`generateDailyArtefact`, `resumeTask`, `finishGeneration`): Hono 应用入口，处理 HTTP 路由、核心生成逻辑、任务恢复机制和翻译 API。
- `src/types.ts` (`Env`, `DailyModel`, `GeneratedContent`, `TripoTaskStatus`, `TaskState`): TypeScript 类型定义，包括新的 `TaskState` 用于存储图片/模型阶段状态。
- `src/services/tavily.ts` (`searchTodayNews`): 调用 Tavily API 搜索当日新闻，返回最多 10 条结果。
- `src/services/openai.ts` (`generateDailyContent`): 使用 GPT-4o 选择新闻、生成解说词、模型 prompt 和地理坐标。
- `src/services/tripo.ts` (`createImageTask`, `createImageToModelTask`, `waitForImage`, `waitForModel`, `downloadModel`): 与 Tripo 3D API 交互，支持两步流程（图片生成 → 图片转模型）。
- `src/services/cache.ts` (`getFromCache`, `setCache`, `invalidateCache`, `invalidateCacheByPrefix`, `invalidateOnRecordComplete`, `invalidateOnTranslationUpdate`): Worker 内存缓存模块，在单个 Worker 实例的多个请求间共享缓存，减少 D1 查询。
- `src/services/storage.ts` (`createPendingRecord`, `completeRecord`, `getRecordByDate`, `getPendingRecord`, `uploadModelToR2`, `updateTranslations`, `getRecordsWithoutTranslations`): 操作 D1 数据库和 R2 对象存储，支持任务状态持久化、翻译管理和缓存集成。
- `src/services/translate.ts` (`translateContent`, `translateToLanguage`): 使用 OpenAI SDK 调用 DeepSeek API 进行多语言翻译（en, ja, ko, es, ru, pt），支持并行翻译所有目标语言。
- `public/index.html` (Three.js, OrbitControls, GLTFLoader, i18n): 前端 SPA，支持日期路由、多语言自动切换、优先显示翻译内容、Umami 统计。
- `migrations/0001_init.sql` (daily_models): 数据库初始化脚本，定义 daily_models 表，包括 status 和 tripo_task_id 字段。
- `migrations/0002_add_translations.sql` (translations): 添加 translations 列，存储 JSON 格式的多语言翻译。

## 3. Execution Flow (LLM Retrieval Map)

### A. Daily Generation Pipeline（两步流程：图片 → 模型）

```text
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
    ├─ 8. Finish: src/index.ts:364-373 (finishGeneration)
    │    ├─ Download Model: src/services/tripo.ts:215-221 (downloadModel)
    │    │  └─ 下载 GLB 二进制文件到内存
    │    │
    │    ├─ Upload to R2: src/services/storage.ts:6-20 (uploadModelToR2)
    │    │  └─ 上传到 R2，路径格式：models/{date}.glb
    │    │
    │    └─ Complete Record: src/services/storage.ts:85-99 (completeRecord)
    │       └─ UPDATE D1，status='completed'，model_url=R2路径
    │
    └─ 9. Parallel Translations (非阻塞，与生成并行)：src/index.ts:496-500
         └─ translateContent: src/services/translate.ts:41-75
            ├─ 创建 OpenAI 客户端实例（复用 OPENAI_API_KEY 和 OPENAI_BASE_URL）
            ├─ 并行调用 translateToLanguage 到 6 个目标语言（en, ja, ko, es, ru, pt）
            │  └─ 每个语言调用 openai.chat.completions.create (DeepSeek model)
            │  └─ 温度 0.3，response_format 为 json_object，确保一致性
            ├─ 使用 Promise.allSettled 容错，翻译失败不影响其他语言
            └─ updateTranslations: src/services/storage.ts (将翻译结果 JSON 保存到 translations 列)
```

### B. HTTP API Flows

#### 获取最新记录

```text
GET /api/today
    ↓
src/index.ts:48-68
    ↓
src/services/storage.ts (getLatestRecord, getPrevRecord, getNextRecord)
    ↓
返回 DailyModel JSON (含 model_url: /api/model/models/{date}.glb，has_prev, has_next)
```

#### 按日期获取特定记录

```text
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

**重新翻译指定日期的记录**
```
POST /api/translate/:date
    Authorization: Bearer {TRIPO_API_KEY}
    ↓
src/index.ts:262-296
    ├─ 获取指定日期记录
    ├─ 调用 translateContent 翻译 title, description, location_name, source_event 到 6 个语言
    └─ 保存翻译结果 JSON 到 translations 列
    ↓
返回 {success: true, translations: {...}}
```

**批量翻译所有缺少翻译的记录**
```
POST /api/translate-all
    Authorization: Bearer {TRIPO_API_KEY}
    ↓
src/index.ts:299-340
    ├─ 查询所有 translations 为 NULL 的记录
    ├─ 逐个翻译（可并发或顺序，具体见实现）
    └─ 返回每条记录的翻译结果
    ↓
返回 [{date, success, error?}, ...]
```

### C. Worker Memory Cache Layer（内存缓存层）

```text
读取操作（getRecordByDate, getLatestRecord, getPrevRecord, getNextRecord, getAllDates）
    ↓
src/services/cache.ts (缓存检查)
    ├─ 缓存命中 → 直接返回缓存数据
    │
    └─ 缓存未命中 → 查询 D1 数据库
         ↓
    src/services/storage.ts (数据库查询)
         ↓
    写入缓存（根据 TTL 配置）
         ↓
    返回数据
```

**缓存策略详情：**

| 缓存键 | 函数 | TTL | 场景 |
|------|------|-----|------|
| `record:{date}` | `getRecordByDate` | 24 小时 | 查询特定日期的已完成记录 |
| `latest_record` | `getLatestRecord` | 1 小时 | 前端获取最新展示的模型 |
| `prev:{date}` | `getPrevRecord` | 24 小时 | 导航前一条有内容的记录 |
| `next:{date}` | `getNextRecord` | 24 小时 | 导航后一条有内容的记录 |
| `all_dates` | `getAllDates` | 1 小时 | 前端日历或日期列表 |

**缓存失效时机：**

- **记录完成** (`completeRecord`)：清除 `latest_record`、`all_dates`、相邻日期的 `prev/next` 缓存（因为导航关系变化）
- **翻译更新** (`updateTranslations`)：清除 `record:{date}` 和 `latest_record`（内容可能展示不同的翻译）

**设计优势：**

- **零额外成本**：不需要 Redis 或 KV 绑定，直接使用 Worker 内存
- **高读性能**：同一 Worker 实例的多个请求间共享缓存，大幅减少 D1 查询
- **适合读多写少**：每天仅生成 1 条新记录，但有大量读取请求（前端、导航等）
- **长期缓存**：历史记录完成后基本不变，24 小时 TTL 很适合

**限制与注意：**

- 缓存只在单个 Worker 实例内共享，不同实例间不共享（但同边缘节点会复用实例）
- Worker 进程重启或更新时缓存清空（无持久性）
- 适合只读场景和非关键业务数据

### D. Frontend 3D Rendering

```
public/index.html
    ├─ 1. Fetch Data: fetch('/api/today')
    ├─ 2. Load Model: GLTFLoader.load(data.model_url)
    ├─ 3. Setup Scene: Three.js Scene, PerspectiveCamera, WebGLRenderer
    ├─ 4. Add Lights: 专业三点布光 + 顶部聚光灯
    │    ├─ 环境光 (AmbientLight): 强度 0.05
    │    ├─ 主光 (Key Light): 强度 2，位置 (4,4,4)，暖色 0xffeedd
    │    ├─ 补光 (Fill Light): 强度 2，位置 (-4,2,3)，冷色 0x8888ff
    │    ├─ 轮廓光 (Rim Light): 强度 4，位置 (0,3,-5)，白色 0xffffff
    │    └─ 顶部聚光灯 (Spot Light): 强度 2，位置 (0,3,0)，角度 30°，暖色 0xfff5e6
    ├─ 5. Material: roughness=0.19, metalness=0.08
    ├─ 6. Auto Rotate: OrbitControls.autoRotate (由用户交互中断)
    ├─ 7. Display Text:
    │    ├─ 日期格式化 (MMM DD)
    │    ├─ 坐标格式化 (N/S, E/W)
    │    └─ 描述打字机效果 (typeWriter 函数)
    └─ 8. Render Loop: requestAnimationFrame
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
- translations: JSON 格式的多语言翻译
  {
    "en": { "title": "...", "description": "...", "location_name": "...", "source_event": "..." },
    "ja": { "title": "...", "description": "...", "location_name": "...", "source_event": "..." },
    "ko": { ... },
    "es": { ... },
    "ru": { ... },
    "pt": { ... }
  }
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

**为什么采用非阻塞的翻译流程？**
- 翻译与 3D 模型生成并行执行，不延迟生成完成时间
- 翻译失败（如 API 超时）不影响用户能否看到 3D 模型
- 使用 Promise.allSettled 容错，确保部分翻译失败不中断其他语言翻译
- 前端可以根据 translations 字段判断是否有翻译，优先显示翻译内容

**为什么选择 DeepSeek API 进行翻译？**
- 复用现有的 OPENAI_API_KEY 和 OPENAI_BASE_URL（aihubmix 接口）
- 支持 JSON 模式确保翻译结果格式一致
- 低温度（0.3）确保翻译的一致性和准确性

**为什么使用 OpenAI SDK 而不是原生 fetch API？**
- 代码风格统一：与 openai.ts 保持一致的 SDK 用法
- 更好的错误处理：SDK 内置了重试、超时管理等机制，无需手动检查 response.ok
- 实例复用：OpenAI 客户端在 translateContent 中创建一次，传递给多个 translateToLanguage 调用，提高效率
- 类型安全：OpenAI SDK 提供完整的类型定义，减少运行时错误

**为什么支持 6 个目标语言（en, ja, ko, es, ru, pt）？**
- 覆盖全球主要互联网用户：英语、日语、韩语、西班牙语、俄语、葡萄牙语
- 用户可根据浏览器语言自动选择最合适的翻译

**为什么在 Worker 内存中缓存而不是使用 KV？**
- Worker KV 存在网络延迟（虽然很低），内存缓存更快（零延迟）
- KV 有写入频率限制和潜在成本，内存缓存零成本
- 场景决定：本项目是读多写少（历史记录基本不变，只有导航和前端展示会频繁查询）
- 单个 Worker 实例内的多个请求间共享缓存效果显著（同地域的用户复用实例概率高）
- 缓存失效策略明确：新记录完成时主动清除，翻译更新时清除相关缓存

**缓存键设计为什么采用前缀模式？**
- `record:{date}` 和 `prev:{date}` 等分别存储不同日期的数据，支持独立的 TTL 管理
- 按前缀失效时无需遍历所有键，直接 `invalidateCacheByPrefix('prev:')` 效率更高
- 语义清晰，易于调试和监控
