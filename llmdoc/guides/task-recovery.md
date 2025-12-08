# 如何恢复中断的 3D 生成任务

两步流程（图片 → 模型）可能在任何阶段中断（网络超时、Worker 超限等）。本指南说明如何恢复未完成的任务。

## 1. 检查待处理任务

查询数据库中指定日期是否有待处理（未完成）的任务：

```bash
# 查询日期的任务状态
curl -s https://your-domain.com/api/date/2025-12-08
```

如果返回 404，说明没有待处理任务；如果返回记录且 `status` 为 `generating`，说明有中断的任务。

## 2. 通过 API 恢复任务

使用 POST `/api/resume/:date` 端点从中断处继续执行任务：

```bash
curl -X POST https://your-domain.com/api/resume/2025-12-08 \
  -H "Authorization: Bearer YOUR_TRIPO_API_KEY"
```

系统会自动：
- 解析保存在 `tripo_task_id` 中的阶段信息
- 如果在图片阶段，继续等待图片生成，然后创建模型任务
- 如果在模型阶段，直接等待模型生成完成
- 完成后更新记录为 `status='completed'`

## 3. 监控恢复进度

可通过日志查看恢复过程（仅在开发环境可见）：

```
Image task status: success, progress: 100%
Image generated: https://...
Creating image-to-model task...
Model task created: task-id-yyy
Model task status: processing, progress: 45%
...
Generation complete!
```

## 4. 强制重新生成

如果想从头开始重新生成（删除旧记录）：

```bash
curl -X POST https://your-domain.com/api/regenerate/2025-12-08 \
  -H "Authorization: Bearer YOUR_TRIPO_API_KEY"
```

这会：
1. 删除指定日期的旧记录
2. 执行完整的生成流程（搜索新闻、生成内容、两步建模）

## 5. 常见问题

**Q: 为什么会中断？**
A: 生成过程耗时较长（图片 5-100 秒，模型 30-120 秒），可能因网络超时、Worker CPU 时间超限或 API 暂时不可用而中断。

**Q: 恢复会重复计费吗？**
A: 不会。恢复只会继续已开始的任务，不会重新调用新闻搜索和内容生成 API。

**Q: 任务状态（tripo_task_id）的格式是什么？**
A: 它是 JSON 字符串，记录当前阶段和 Tripo 任务 ID：
- 图片阶段：`{"stage":"image", "imageTaskId":"xxx"}`
- 模型阶段：`{"stage":"model", "imageTaskId":"xxx", "imageUrl":"...", "modelTaskId":"yyy"}`

**Q: 如果恢复本身也超时了怎么办？**
A: 重复调用 `/api/resume/:date` 即可。Tripo API 会检测任务已在进行，直接继续处理。

## 代码参考

- **恢复逻辑**：`src/index.ts:280-340` (resumeTask 函数)
- **任务状态类型**：`src/index.ts:32-37` (TaskState 接口)
- **数据库操作**：`src/services/storage.ts` (getPendingRecord, updateTaskState)
- **Tripo 查询**：`src/services/tripo.ts` (getTaskStatus, waitForImage, waitForModel)
