import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, DailyModel } from './types';
import { searchTodayNews } from './services/tavily';
import { generateDailyContent } from './services/openai';
import {
  createImageTask,
  createImageToModelTask,
  waitForImage,
  waitForModel,
  downloadModel,
  getTaskStatus,
} from './services/tripo';
import {
  uploadModelToR2,
  createPendingRecord,
  completeRecord,
  failRecord,
  getLatestRecord,
  getRecordByDate,
  getPrevRecord,
  getNextRecord,
  getPendingRecord,
  hasTodayCompleted,
  getAllDates,
  getRecentRecords,
  updateTranslations,
  getRecordsWithoutTranslations,
} from './services/storage';
import { translateContent } from './services/translate';

const app = new Hono<{ Bindings: Env }>();

// 任务状态接口
interface TaskState {
  stage: 'image' | 'model';
  imageTaskId: string;
  imageUrl?: string;
  modelTaskId?: string;
}

// 启用 CORS
app.use('/api/*', cors());

// 健康检查
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 获取最新记录
app.get('/api/today', async (c) => {
  try {
    const record = await getLatestRecord(c.env.DB);
    if (!record) {
      return c.json({ error: 'No records found' }, 404);
    }
    // 添加导航信息
    const [prev, next] = await Promise.all([
      getPrevRecord(c.env.DB, record.date),
      getNextRecord(c.env.DB, record.date),
    ]);
    return c.json({
      ...record,
      has_prev: !!prev,
      has_next: !!next,
    });
  } catch (error) {
    console.error('Error fetching today record:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// 按日期获取记录
app.get('/api/date/:date', async (c) => {
  const date = c.req.param('date');
  try {
    const record = await getRecordByDate(c.env.DB, date);
    if (!record || record.status !== 'completed') {
      return c.json({ error: 'Record not found' }, 404);
    }
    // 添加导航信息
    const [prev, next] = await Promise.all([
      getPrevRecord(c.env.DB, date),
      getNextRecord(c.env.DB, date),
    ]);
    return c.json({
      ...record,
      has_prev: !!prev,
      has_next: !!next,
    });
  } catch (error) {
    console.error('Error fetching record:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// 获取前一天记录
app.get('/api/date/:date/prev', async (c) => {
  const date = c.req.param('date');
  try {
    const record = await getPrevRecord(c.env.DB, date);
    if (!record) {
      return c.json({ error: 'No previous record' }, 404);
    }
    const [prev, next] = await Promise.all([
      getPrevRecord(c.env.DB, record.date),
      getNextRecord(c.env.DB, record.date),
    ]);
    return c.json({
      ...record,
      has_prev: !!prev,
      has_next: !!next,
    });
  } catch (error) {
    console.error('Error fetching prev record:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// 获取后一天记录
app.get('/api/date/:date/next', async (c) => {
  const date = c.req.param('date');
  try {
    const record = await getNextRecord(c.env.DB, date);
    if (!record) {
      return c.json({ error: 'No next record' }, 404);
    }
    const [prev, next] = await Promise.all([
      getPrevRecord(c.env.DB, record.date),
      getNextRecord(c.env.DB, record.date),
    ]);
    return c.json({
      ...record,
      has_prev: !!prev,
      has_next: !!next,
    });
  } catch (error) {
    console.error('Error fetching next record:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// 获取所有日期
app.get('/api/dates', async (c) => {
  try {
    const dates = await getAllDates(c.env.DB);
    return c.json({ dates });
  } catch (error) {
    console.error('Error fetching dates:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// 代理 R2 模型文件
app.get('/api/model/:key{.+}', async (c) => {
  const key = c.req.param('key');
  try {
    const object = await c.env.MODELS_BUCKET.get(key);
    if (!object) {
      return c.json({ error: 'Model not found' }, 404);
    }

    const headers = new Headers();
    headers.set('Content-Type', 'model/gltf-binary');
    headers.set('Cache-Control', 'public, max-age=31536000');

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Error fetching model:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// 手动触发生成（今天）
app.post('/api/generate', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== `Bearer ${c.env.TRIPO_API_KEY}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const result = await generateDailyArtefact(c.env);
    return c.json(result);
  } catch (error) {
    console.error('Generation error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// 指定日期生成
app.post('/api/generate/:date', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== `Bearer ${c.env.TRIPO_API_KEY}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const date = c.req.param('date');
  // 验证日期格式
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'Invalid date format, use YYYY-MM-DD' }, 400);
  }

  try {
    const result = await generateDailyArtefact(c.env, date);
    return c.json(result);
  } catch (error) {
    console.error('Generation error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// 强制重新生成指定日期（删除旧记录）
app.post('/api/regenerate/:date', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== `Bearer ${c.env.TRIPO_API_KEY}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const date = c.req.param('date');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'Invalid date format, use YYYY-MM-DD' }, 400);
  }

  try {
    // 删除旧记录
    await c.env.DB.prepare('DELETE FROM daily_models WHERE date = ?').bind(date).run();
    console.log(`Deleted old record for ${date}`);

    // 重新生成
    const result = await generateDailyArtefact(c.env, date);
    return c.json(result);
  } catch (error) {
    console.error('Regeneration error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// 恢复指定日期的任务
app.post('/api/resume/:date', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== `Bearer ${c.env.TRIPO_API_KEY}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const date = c.req.param('date');

  try {
    const pending = await getPendingRecord(c.env.DB, date);
    if (!pending || !pending.tripo_task_id) {
      return c.json({ error: 'No pending task found for this date' }, 404);
    }

    const result = await resumeTask(c.env, pending.tripo_task_id, date);
    return c.json(result);
  } catch (error) {
    console.error('Resume error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// 重新翻译指定日期的记录
app.post('/api/translate/:date', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== `Bearer ${c.env.TRIPO_API_KEY}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const date = c.req.param('date');

  try {
    const record = await getRecordByDate(c.env.DB, date);
    if (!record) {
      return c.json({ error: 'Record not found' }, 404);
    }

    console.log(`Translating record for ${date}...`);
    const translations = await translateContent(
      c.env.OPENAI_API_KEY,
      c.env.OPENAI_BASE_URL,
      {
        title: record.title,
        description: record.description,
        location_name: record.location_name,
        source_event: record.source_event,
      }
    );

    await updateTranslations(c.env.DB, date, JSON.stringify(translations));
    console.log(`Translation complete for ${date}`);

    return c.json({ success: true, translations });
  } catch (error) {
    console.error('Translation error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// 批量翻译所有缺少翻译的记录
app.post('/api/translate-all', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (authHeader !== `Bearer ${c.env.TRIPO_API_KEY}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const records = await getRecordsWithoutTranslations(c.env.DB);
    console.log(`Found ${records.length} records without translations`);

    const results: { date: string; success: boolean; error?: string }[] = [];

    for (const record of records) {
      try {
        console.log(`Translating ${record.date}...`);
        const translations = await translateContent(
          c.env.OPENAI_API_KEY,
          c.env.OPENAI_BASE_URL,
          {
            title: record.title,
            description: record.description,
            location_name: record.location_name,
            source_event: record.source_event,
          }
        );
        await updateTranslations(c.env.DB, record.date, JSON.stringify(translations));
        results.push({ date: record.date, success: true });
      } catch (err) {
        results.push({ date: record.date, success: false, error: String(err) });
      }
    }

    return c.json({ total: records.length, results });
  } catch (error) {
    console.error('Batch translation error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// 更新任务状态到数据库
async function updateTaskState(db: D1Database, date: string, state: TaskState): Promise<void> {
  await db
    .prepare('UPDATE daily_models SET tripo_task_id = ? WHERE date = ?')
    .bind(JSON.stringify(state), date)
    .run();
}

// 恢复任务（支持从图片或模型阶段恢复）
async function resumeTask(env: Env, taskStateStr: string, date: string): Promise<DailyModel> {
  let state: TaskState;

  // 尝试解析 JSON 格式的任务状态
  try {
    state = JSON.parse(taskStateStr);
  } catch {
    // 兼容旧格式（直接是 taskId）
    console.log('Legacy task format detected, treating as model task');
    return resumeLegacyTask(env, taskStateStr, date);
  }

  console.log(`Resuming task for ${date}, stage: ${state.stage}`);

  if (state.stage === 'image') {
    // 等待图片生成完成
    const imageStatus = await getTaskStatus(env.TRIPO_API_KEY, state.imageTaskId);
    console.log(`Image task status: ${imageStatus.status}`);

    let imageUrl = state.imageUrl;
    if (!imageUrl) {
      if (imageStatus.status === 'success') {
        imageUrl = (imageStatus.output as any)?.image;
      } else if (imageStatus.status === 'failed') {
        throw new Error('Image generation failed');
      } else {
        // 继续等待图片
        imageUrl = await waitForImage(env.TRIPO_API_KEY, state.imageTaskId);
      }
    }

    if (!imageUrl) {
      throw new Error('No image URL found');
    }

    console.log(`Image ready: ${imageUrl}`);

    // 创建模型任务
    const modelTaskId = await createImageToModelTask(env.TRIPO_API_KEY, imageUrl);
    console.log(`Model task created: ${modelTaskId}`);

    // 更新状态为模型阶段
    const newState: TaskState = {
      stage: 'model',
      imageTaskId: state.imageTaskId,
      imageUrl,
      modelTaskId,
    };
    await updateTaskState(env.DB, date, newState);

    // 等待模型生成
    const modelUrl = await waitForModel(env.TRIPO_API_KEY, modelTaskId);
    return finishGeneration(env, date, modelUrl);
  } else {
    // 模型阶段
    if (!state.modelTaskId) {
      throw new Error('No model task ID found');
    }

    const modelStatus = await getTaskStatus(env.TRIPO_API_KEY, state.modelTaskId);
    console.log(`Model task status: ${modelStatus.status}`);

    let modelUrl: string;
    if (modelStatus.status === 'success') {
      modelUrl = modelStatus.output?.pbr_model || modelStatus.output?.model!;
    } else if (modelStatus.status === 'failed') {
      throw new Error('Model generation failed');
    } else {
      modelUrl = await waitForModel(env.TRIPO_API_KEY, state.modelTaskId);
    }

    return finishGeneration(env, date, modelUrl);
  }
}

// 兼容旧格式的恢复逻辑
async function resumeLegacyTask(env: Env, taskId: string, date: string): Promise<DailyModel> {
  console.log(`Resuming legacy task: ${taskId}`);

  const status = await getTaskStatus(env.TRIPO_API_KEY, taskId);
  console.log(`Task status: ${status.status}`);

  if (status.status === 'failed') {
    throw new Error('Tripo task failed');
  }

  let modelUrl: string;
  if (status.status === 'success' && (status.output?.pbr_model || status.output?.model)) {
    modelUrl = status.output.pbr_model || status.output.model!;
  } else {
    modelUrl = await waitForModel(env.TRIPO_API_KEY, taskId);
  }

  return finishGeneration(env, date, modelUrl);
}

// 完成生成：下载模型并上传到 R2
async function finishGeneration(env: Env, date: string, modelUrl: string): Promise<DailyModel> {
  console.log('Downloading and uploading model...');
  const modelData = await downloadModel(modelUrl);
  const r2Key = await uploadModelToR2(env.MODELS_BUCKET, date, modelData);

  const record = await completeRecord(env.DB, date, r2Key);
  console.log(`[${date}] Generation complete!`);

  return record;
}

// 核心生成逻辑（两步流程：图片 -> 模型）
async function generateDailyArtefact(env: Env, targetDate?: string): Promise<DailyModel> {
  const date = targetDate || new Date().toISOString().split('T')[0];

  // 1. 检查是否已完成
  const existing = await getRecordByDate(env.DB, date);
  if (existing && existing.status === 'completed') {
    console.log(`[${date}] Already completed`);
    return existing;
  }

  // 2. 检查是否有待处理的任务
  const pending = await getPendingRecord(env.DB, date);
  if (pending && pending.tripo_task_id) {
    console.log(`Found pending task for ${date}`);
    return resumeTask(env, pending.tripo_task_id, date);
  }

  console.log(`[${date}] Starting daily artefact generation...`);

  // 3. 搜索前一天的新闻
  console.log(`Searching news for date: ${date}...`);
  const searchResults = await searchTodayNews(env.TAVILY_API_KEY, date);

  // 4. 获取过去10天的历史记录
  console.log('Fetching recent records to avoid duplicates...');
  const recentRecords = await getRecentRecords(env.DB, date, 10);
  console.log(`Found ${recentRecords.length} recent records`);

  // 5. GPT 生成内容
  console.log('Generating content with GPT...');
  const content = await generateDailyContent(env.OPENAI_API_KEY, env.OPENAI_BASE_URL, searchResults.results, recentRecords);
  console.log('Content generated:', content.title);

  // 6. 创建图片生成任务 (Step 1: nano banana)
  console.log('Creating image generation task (nano banana)...');
  const imageTaskId = await createImageTask(env.TRIPO_API_KEY, content.model_prompt);
  console.log(`Image task created: ${imageTaskId}`);

  // 7. 并行执行：保存记录 + 开始翻译
  console.log('Starting translation in parallel...');
  const translationPromise = translateContent(
    env.OPENAI_API_KEY,
    env.OPENAI_BASE_URL,
    {
      title: content.title,
      description: content.description,
      location_name: content.location_name,
      source_event: content.source_event,
    }
  ).catch((err) => {
    console.error('Translation failed (non-blocking):', err);
    return null;
  });

  // 8. 保存待处理记录（图片阶段）
  const taskState: TaskState = {
    stage: 'image',
    imageTaskId,
  };
  await createPendingRecord(env.DB, {
    date: date,
    title: content.title,
    description: content.description,
    latitude: content.latitude,
    longitude: content.longitude,
    location_name: content.location_name,
    model_prompt: content.model_prompt,
    source_event: content.source_event,
    tripo_task_id: JSON.stringify(taskState),
  });

  // 9. 等待图片生成
  console.log('Waiting for image generation...');
  try {
    const imageUrl = await waitForImage(env.TRIPO_API_KEY, imageTaskId);
    console.log(`Image generated: ${imageUrl}`);

    // 10. 创建模型生成任务 (Step 2: image to model)
    console.log('Creating image-to-model task...');
    const modelTaskId = await createImageToModelTask(env.TRIPO_API_KEY, imageUrl);
    console.log(`Model task created: ${modelTaskId}`);

    // 更新状态为模型阶段
    const newState: TaskState = {
      stage: 'model',
      imageTaskId,
      imageUrl,
      modelTaskId,
    };
    await updateTaskState(env.DB, date, newState);

    // 11. 等待模型生成 + 等待翻译完成
    console.log('Waiting for model generation...');
    const [modelUrl, translations] = await Promise.all([
      waitForModel(env.TRIPO_API_KEY, modelTaskId),
      translationPromise,
    ]);

    // 12. 保存翻译结果
    if (translations) {
      console.log('Saving translations...');
      await updateTranslations(env.DB, date, JSON.stringify(translations));
    }

    // 13. 完成生成
    return finishGeneration(env, date, modelUrl);
  } catch (error) {
    await failRecord(env.DB, date);
    throw error;
  }
}

// SPA Fallback - 所有非 API 路由返回 index.html
app.get('*', async (c) => {
  // 匹配日期格式的路径，返回 index.html
  const path = new URL(c.req.url).pathname;
  if (path.match(/^\/\d{4}-\d{2}-\d{2}$/) || path === '/') {
    return c.env.ASSETS.fetch(new Request(new URL('/index.html', c.req.url)));
  }
  // 其他路径尝试静态资源
  return c.env.ASSETS.fetch(c.req.raw);
});

// 导出 Worker
export default {
  fetch: app.fetch,

  // Cron Trigger 处理
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    console.log('Cron triggered at:', new Date().toISOString());
    ctx.waitUntil(
      generateDailyArtefact(env).catch((error) => {
        console.error('Scheduled generation failed:', error);
      })
    );
  },
};
