# HTTP API 参考

完整的 HTTP API 端点说明，包括请求/响应格式。

## 端点列表

### 1. 获取最新记录 GET /api/today

返回数据库中最新的每日模型记录（仅返回已完成的记录）。

**请求**
```
GET /api/today
```

**响应 (200 OK)**
```json
{
  "id": 1,
  "date": "2025-12-08",
  "title": "某有趣事件",
  "description": "这是关于该事件的戏谑解说词。",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "location_name": "纽约，美国",
  "model_url": "/api/model/models/2025-12-08.glb",
  "model_prompt": "a detailed 3D model of ...",
  "source_event": "原始新闻事件摘要",
  "tripo_task_id": null,
  "status": "completed",
  "created_at": "2025-12-08T08:00:00Z",
  "has_prev": true,
  "has_next": false
}
```

**错误响应 (404 Not Found)**
```json
{
  "error": "No records found"
}
```

### 2. 按日期获取记录 GET /api/date/:date

获取指定日期的记录（仅返回已完成的记录）。

**请求**
```
GET /api/date/2025-12-08
```

**响应 (200 OK)**
返回格式同上，包含 `has_prev` 和 `has_next` 导航信息。

**错误响应 (404 Not Found)**
```json
{
  "error": "Record not found"
}
```

### 3. 获取前一天记录 GET /api/date/:date/prev

获取指定日期的前一天记录。

**请求**
```
GET /api/date/2025-12-08/prev
```

**响应 (200 OK)**
返回前一天（2025-12-07）的完整记录。

**错误响应 (404 Not Found)**
```json
{
  "error": "No previous record"
}
```

### 4. 获取后一天记录 GET /api/date/:date/next

获取指定日期的后一天记录。

**请求**
```
GET /api/date/2025-12-08/next
```

**响应 (200 OK)**
返回后一天（2025-12-09）的完整记录。

**错误响应 (404 Not Found)**
```json
{
  "error": "No next record"
}
```

### 5. 获取所有日期 GET /api/dates

获取数据库中所有完成的记录的日期列表。

**请求**
```
GET /api/dates
```

**响应 (200 OK)**
```json
{
  "dates": ["2025-12-08", "2025-12-07", "2025-12-06", ...]
}
```

### 6. 获取模型文件 GET /api/model/:key

代理 R2 中的 GLB 3D 模型文件。

**请求**
```
GET /api/model/models/2025-12-08.glb
```

**响应 (200 OK)**
- Content-Type: `model/gltf-binary`
- Content-Length: 模型文件大小（字节）
- Cache-Control: `public, max-age=31536000` (1 年缓存)
- Body: 原始 GLB 二进制数据

**错误响应 (404 Not Found)**
```json
{
  "error": "Model not found"
}
```

### 7. 手动触发生成（当天）POST /api/generate

立即触发当天的生成流程。需要 Bearer Token 认证。

**请求**
```
POST /api/generate
Authorization: Bearer <TRIPO_API_KEY>
```

**响应 (200 OK)**
返回完整生成的 DailyModel 记录（两步流程完成后）。

**错误响应 (401 Unauthorized)**
```json
{
  "error": "Unauthorized"
}
```

**错误响应 (500 Internal Server Error)**
```json
{
  "error": "具体的错误信息（例如 API 调用失败）"
}
```

### 8. 指定日期生成 POST /api/generate/:date

立即触发指定日期的生成流程。需要 Bearer Token 认证。

**请求**
```
POST /api/generate/2025-12-10
Authorization: Bearer <TRIPO_API_KEY>
```

**响应 (200 OK)**
返回完整生成的 DailyModel 记录。

**错误响应 (400 Bad Request)**
```json
{
  "error": "Invalid date format, use YYYY-MM-DD"
}
```

### 9. 强制重新生成 POST /api/regenerate/:date

删除指定日期的旧记录并强制重新生成。需要 Bearer Token 认证。

**请求**
```
POST /api/regenerate/2025-12-08
Authorization: Bearer <TRIPO_API_KEY>
```

**响应 (200 OK)**
返回新生成的 DailyModel 记录。

### 10. 恢复未完成的任务 POST /api/resume/:date

从中断处继续执行未完成的任务（图片生成或模型生成）。需要 Bearer Token 认证。

**请求**
```
POST /api/resume/2025-12-08
Authorization: Bearer <TRIPO_API_KEY>
```

**响应 (200 OK)**
如果任务在图片阶段中断，会继续等待图片完成，然后创建模型任务。
如果任务在模型阶段中断，会直接等待模型完成。
最终返回完整的 DailyModel 记录（status='completed'）。

**错误响应 (404 Not Found)**
```json
{
  "error": "No pending task found for this date"
}
```

**错误响应 (500 Internal Server Error)**
```json
{
  "error": "Tripo API error or timeout"
}
```

### 11. 重新翻译指定日期的记录 POST /api/translate/:date

翻译指定日期记录的 title、description、location_name、source_event 字段到 6 个目标语言。需要 Bearer Token 认证。

**请求**
```
POST /api/translate/2025-12-08
Authorization: Bearer <TRIPO_API_KEY>
```

**响应 (200 OK)**
```json
{
  "success": true,
  "translations": {
    "en": {
      "title": "Something Happened",
      "description": "A funny story about an event...",
      "location_name": "New York, USA",
      "source_event": "News event summary in English"
    },
    "ja": {
      "title": "何かが起こった",
      "description": "イベントについての面白い話...",
      "location_name": "ニューヨーク、アメリカ",
      "source_event": "日本語のニュースイベント要約"
    },
    "ko": { ... },
    "es": { ... },
    "ru": { ... },
    "pt": { ... }
  }
}
```

**错误响应 (404 Not Found)**
```json
{
  "error": "Record not found"
}
```

**错误响应 (500 Internal Server Error)**
```json
{
  "error": "DeepSeek API error or translation failed"
}
```

### 12. 批量翻译所有缺少翻译的记录 POST /api/translate-all

找出所有 translations 列为 NULL 的记录，批量调用翻译 API。需要 Bearer Token 认证。

**请求**
```
POST /api/translate-all
Authorization: Bearer <TRIPO_API_KEY>
```

**响应 (200 OK)**
```json
{
  "totalRecords": 3,
  "results": [
    {
      "date": "2025-12-08",
      "success": true
    },
    {
      "date": "2025-12-07",
      "success": true
    },
    {
      "date": "2025-12-06",
      "success": false,
      "error": "API timeout"
    }
  ]
}
```

**错误响应 (500 Internal Server Error)**
```json
{
  "error": "Batch translation failed"
}
```

### 13. 健康检查 GET /api/health

检查 Worker 是否运行正常。

**请求**
```
GET /api/health
```

**响应 (200 OK)**
```json
{
  "status": "ok",
  "timestamp": "2025-12-08T08:00:00.000Z"
}
```

## 数据结构

### DailyModel

完整的每日模型记录结构。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | integer | 数据库自增主键 |
| date | string (YYYY-MM-DD) | 记录日期，UNIQUE 约束 |
| title | string | 事件简短标题 |
| description | string | 戏谑解说词（中文），2-3 句话 |
| latitude | number | 事件发生地的纬度 |
| longitude | number | 事件发生地的经度 |
| location_name | string | 地点名称（例："北京，中国"） |
| model_url | string | API 代理路由，客户端请求此 URL 获取 GLB 文件 |
| model_prompt | string | 用于生成 3D 模型的英文 prompt |
| source_event | string | 原始新闻事件的一句话摘要 |
| translations | string (JSON) | 多语言翻译，JSON 格式，支持 en, ja, ko, es, ru, pt |
| tripo_task_id | string (JSON) | 任务状态（JSON 格式），支持任务恢复 |
| status | string | 记录状态：'generating' 或 'completed' |
| created_at | string (ISO 8601) | 记录创建时间戳 |

### TaskState (tripo_task_id 的 JSON 格式)

图片阶段：
```json
{
  "stage": "image",
  "imageTaskId": "task-id-xxx"
}
```

模型阶段：
```json
{
  "stage": "model",
  "imageTaskId": "task-id-xxx",
  "imageUrl": "https://...",
  "modelTaskId": "task-id-yyy"
}
```

### Translations (translations 字段的 JSON 格式)

多语言翻译结果，包含 6 个目标语言。任何语言的翻译失败都不会阻止整个生成流程。

```json
{
  "en": {
    "title": "Something Funny Happened",
    "description": "An amusing story about the event...",
    "location_name": "New York, USA",
    "source_event": "News headline in English"
  },
  "ja": {
    "title": "何か面白いことが起こった",
    "description": "イベントについての面白い話...",
    "location_name": "ニューヨーク、アメリカ",
    "source_event": "日本語のニュースヘッドライン"
  },
  "ko": {
    "title": "뭔가 재미있는 일이 일어났다",
    "description": "이 사건에 대한 재미있는 이야기...",
    "location_name": "뉴욕, 미국",
    "source_event": "한국어 뉴스 헤드라인"
  },
  "es": {
    "title": "Algo Divertido Sucedió",
    "description": "Una historia divertida sobre el evento...",
    "location_name": "Nueva York, Estados Unidos",
    "source_event": "Titular de noticias en español"
  },
  "ru": {
    "title": "Произошло что-то забавное",
    "description": "Забавная история о событии...",
    "location_name": "Нью-Йорк, США",
    "source_event": "Заголовок новостей на русском"
  },
  "pt": {
    "title": "Algo Engraçado Aconteceu",
    "description": "Uma história engraçada sobre o evento...",
    "location_name": "Nova York, EUA",
    "source_event": "Manchete de notícias em português"
  }
}
```

## CORS 策略

所有 `/api/*` 路由已启用 CORS（src/index.ts）。

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

## 速率限制

目前无全局速率限制，但受 Cloudflare Workers 和外部 API 的限制：
- **Tavily API**: 每天上限（具体见 Tavily 计划）
- **OpenAI API**: 基于账户限制
- **Tripo 3D API**: 基于账户 token/配额

## 超时配置

- **Tavily 搜索**: 10 秒
- **OpenAI 调用**: 30 秒
- **图片生成**: 最多 20 次轮询，每次 5 秒间隔（总计 100 秒）
- **模型生成**: 最多 40 次轮询，每次 30 秒间隔（总计 20 分钟）

如果任何步骤超时，会返回 500 错误。

## 代码参考

- **路由定义**: `src/index.ts:40-275`
- **生成逻辑**: `src/index.ts:375-466`
- **任务恢复**: `src/index.ts:280-340`
- **错误处理**: 各个 service 文件中的 try-catch 块
