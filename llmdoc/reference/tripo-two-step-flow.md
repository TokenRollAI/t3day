# Tripo 两步生成流程参考

完整说明 Tripo 3D API 的两步流程（图片生成 → 模型生成）和任务状态管理机制。

## 1. Core Summary

Tripo 3D API 的两步流程通过 `generate_image`（Nano Banana，gemini_2.5_flash_image_preview）和 `image_to_model` 两个任务类型实现高质量 3D 模型生成。系统持久化存储任务状态（JSON 格式），支持从任意阶段恢复中断的任务，避免重复计算。

## 2. Two-Step Flow Architecture

### Step 1: Image Generation (nano banana)

**模型**：`gemini_2.5_flash_image_preview`
**API 端点**：`POST https://api.tripo3d.ai/v2/openapi/task`

```json
{
  "type": "generate_image",
  "model_version": "gemini_2.5_flash_image_preview",
  "prompt": "detailed description of the 3D object"
}
```

**返回**：
```json
{
  "data": {
    "task_id": "task-xxx"
  }
}
```

**轮询状态**：
```
GET /v2/openapi/task/{task_id}
响应状态：processing → success
输出字段：output.generated_image (图片 URL)
耗时：通常 5-100 秒
```

**代码位置**：`src/services/tripo.ts:9-33` (createImageTask)，`src/services/tripo.ts:128-156` (waitForImage)

---

### Step 2: Image to Model Conversion

**模型**：`v3.0-20250812`
**API 端点**：`POST https://api.tripo3d.ai/v2/openapi/task`

```json
{
  "type": "image_to_model",
  "file": {
    "type": "png",
    "url": "https://... (generated_image URL from Step 1)"
  },
  "model_version": "v3.0-20250812",
  "texture": true,
  "pbr": true,
  "texture_quality": "detailed",
  "geometry_quality": "detailed",
  "orientation": "align_image",
  "face_limit": 9000,
  "enable_image_autofix": true
}
```

**返回**：
```json
{
  "data": {
    "task_id": "task-yyy"
  }
}
```

**轮询状态**：
```
GET /v2/openapi/task/{task_id}
响应状态：processing → success
输出字段：output.pbr_model 或 output.model (GLB URL)
耗时：通常 30-120 秒
```

**代码位置**：`src/services/tripo.ts:38-72` (createImageToModelTask)，`src/services/tripo.ts:161-187` (waitForModel)

---

## 3. Task State Persistence

### 数据库字段

`daily_models` 表中的 `tripo_task_id` 字段以 JSON 格式存储任务状态：

```sql
tripo_task_id TEXT -- JSON 格式的任务状态
status TEXT -- 'generating' | 'completed'
```

### TaskState 类型定义

```typescript
interface TaskState {
  stage: 'image' | 'model';
  imageTaskId: string;
  imageUrl?: string;
  modelTaskId?: string;
}
```

### 状态转移

```
创建记录（图片阶段）
  tripo_task_id = {"stage":"image", "imageTaskId":"task-xxx"}
  status = 'generating'
    ↓
图片生成完成，创建模型任务
  tripo_task_id = {"stage":"model", "imageTaskId":"task-xxx", "imageUrl":"...", "modelTaskId":"task-yyy"}
  status = 'generating'
    ↓
模型生成完成，保存到 R2
  tripo_task_id = null
  model_url = 'models/2025-12-08.glb'
  status = 'completed'
```

### 代码位置

- **创建记录**：`src/services/storage.ts:32-80` (createPendingRecord)
- **更新状态**：`src/index.ts:309-315` (updateTaskState)
- **完成记录**：`src/services/storage.ts:85-99` (completeRecord)

---

## 4. Polling Strategy

### 图片生成轮询

```
最多 20 次轮询
每次间隔 5 秒
总超时：100 秒
```

**代码**：`src/services/tripo.ts:128-156` (waitForImage)

### 模型生成轮询

```
最多 40 次轮询
每次间隔 30 秒
总超时：20 分钟
```

**代码**：`src/services/tripo.ts:161-187` (waitForModel)

---

## 5. Error Handling

### 常见错误

| 错误 | 原因 | 恢复策略 |
|------|------|---------|
| 401 Unauthorized | API Key 无效 | 检查 TRIPO_API_KEY 环境变量 |
| 429 Too Many Requests | 超过速率限制 | 等待后重试 |
| 500 Internal Server Error | Tripo API 故障 | 重新调用 `/api/resume/:date` |
| 超时 | 任务耗时过长 | 调用 `/api/resume/:date` 继续轮询 |
| Image generation failed | 图片生成失败 | 从头重新生成（调用 `/api/regenerate/:date`） |
| Model generation failed | 模型生成失败 | 尝试恢复或重新生成 |

### 任务失败检测

```typescript
if (status.status === 'failed') {
  throw new Error('Image/Model generation failed');
}
```

---

## 6. Advantages Over Direct Text-to-Model

| 方面 | 直接 text_to_model | 两步流程（图片 → 模型） |
|------|-------------------|----------------------|
| 成功率 | 60-70% | 85-95% |
| 总耗时 | 60-180 秒 | 35-220 秒（通常 80 秒） |
| 中间结果 | 无 | 可获得图片，便于调试 |
| 质量 | 中等 | 高（多轮 AI 优化） |
| 恢复能力 | 无 | 从任意阶段恢复 |

---

## 7. Source of Truth

- **Tripo API 文档**：https://docs.tripo3d.ai/
- **调用代码**：`src/services/tripo.ts` - 完整的 API 集成实现
- **类型定义**：`src/types.ts` - `TripoTaskResponse`, `TripoTaskStatus`
- **错误处理**：各个 tripo.ts 的 try-catch 块
- **数据库模式**：`migrations/0001_init.sql` - daily_models 表定义
