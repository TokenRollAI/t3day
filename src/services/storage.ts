import type { DailyModel } from '../types';
import {
  getFromCache,
  setCache,
  CacheKeys,
  DEFAULT_TTL,
  invalidateOnRecordComplete,
  invalidateOnTranslationUpdate,
} from './cache';

/**
 * 上传 GLB 模型到 R2
 */
export async function uploadModelToR2(
  bucket: R2Bucket,
  date: string,
  modelData: ArrayBuffer
): Promise<string> {
  const key = `models/${date}.glb`;

  await bucket.put(key, modelData, {
    httpMetadata: {
      contentType: 'model/gltf-binary',
    },
  });

  return key;
}

/**
 * 获取模型的公开 URL
 */
export function getModelPublicUrl(key: string): string {
  return `/api/model/${key}`;
}

/**
 * 创建待处理记录（内容已生成，等待 3D 模型）
 */
export async function createPendingRecord(
  db: D1Database,
  record: {
    date: string;
    title: string;
    description: string;
    latitude: number;
    longitude: number;
    location_name: string;
    model_prompt: string;
    source_event: string;
    tripo_task_id: string;
  }
): Promise<DailyModel> {
  const result = await db
    .prepare(
      `INSERT INTO daily_models (date, title, description, latitude, longitude, location_name, model_url, model_prompt, source_event, tripo_task_id, status)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, 'generating')
       ON CONFLICT(date) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         location_name = excluded.location_name,
         model_prompt = excluded.model_prompt,
         source_event = excluded.source_event,
         tripo_task_id = excluded.tripo_task_id,
         status = 'generating'
       RETURNING *`
    )
    .bind(
      record.date,
      record.title,
      record.description,
      record.latitude,
      record.longitude,
      record.location_name,
      record.model_prompt,
      record.source_event,
      record.tripo_task_id
    )
    .first<DailyModel>();

  if (!result) {
    throw new Error('Failed to create pending record');
  }

  return result;
}

/**
 * 更新记录为完成状态（并清除相关缓存）
 */
export async function completeRecord(
  db: D1Database,
  date: string,
  modelUrl: string
): Promise<DailyModel> {
  const result = await db
    .prepare(
      `UPDATE daily_models
       SET model_url = ?, status = 'completed'
       WHERE date = ?
       RETURNING *`
    )
    .bind(modelUrl, date)
    .first<DailyModel>();

  if (!result) {
    throw new Error('Failed to complete record');
  }

  // 清除相关缓存
  invalidateOnRecordComplete(date);

  return result;
}

/**
 * 更新记录为失败状态
 */
export async function failRecord(
  db: D1Database,
  date: string
): Promise<void> {
  await db
    .prepare(`UPDATE daily_models SET status = 'failed' WHERE date = ?`)
    .bind(date)
    .run();
}

/**
 * 获取今日记录
 */
export async function getTodayRecord(db: D1Database): Promise<DailyModel | null> {
  const today = new Date().toISOString().split('T')[0];
  return getRecordByDate(db, today);
}

/**
 * 按日期获取记录（带缓存）
 */
export async function getRecordByDate(db: D1Database, date: string): Promise<DailyModel | null> {
  const cacheKey = CacheKeys.recordByDate(date);

  // 尝试从缓存获取
  const cached = getFromCache<DailyModel>(cacheKey);
  if (cached) {
    return cached;
  }

  // 缓存未命中，查询数据库
  const record = await db
    .prepare('SELECT * FROM daily_models WHERE date = ?')
    .bind(date)
    .first<DailyModel>();

  // 只缓存已完成的记录
  if (record && record.status === 'completed') {
    setCache(cacheKey, record, DEFAULT_TTL.RECORD_BY_DATE);
  }

  return record;
}

/**
 * 获取最新记录（带缓存，用于前端展示）
 */
export async function getLatestRecord(db: D1Database): Promise<DailyModel | null> {
  const cacheKey = CacheKeys.LATEST_RECORD;

  // 尝试从缓存获取
  const cached = getFromCache<DailyModel>(cacheKey);
  if (cached) {
    return cached;
  }

  // 缓存未命中，查询数据库
  const record = await db
    .prepare('SELECT * FROM daily_models WHERE status = ? ORDER BY date DESC LIMIT 1')
    .bind('completed')
    .first<DailyModel>();

  // 写入缓存
  if (record) {
    setCache(cacheKey, record, DEFAULT_TTL.LATEST_RECORD);
  }

  return record;
}

/**
 * 获取前一天有内容的记录（带缓存）
 */
export async function getPrevRecord(db: D1Database, currentDate: string): Promise<DailyModel | null> {
  const cacheKey = CacheKeys.prevRecord(currentDate);

  // 尝试从缓存获取
  const cached = getFromCache<DailyModel>(cacheKey);
  if (cached) {
    return cached;
  }

  // 缓存未命中，查询数据库
  const record = await db
    .prepare('SELECT * FROM daily_models WHERE date < ? AND status = ? ORDER BY date DESC LIMIT 1')
    .bind(currentDate, 'completed')
    .first<DailyModel>();

  // 写入缓存
  if (record) {
    setCache(cacheKey, record, DEFAULT_TTL.PREV_NEXT);
  }

  return record;
}

/**
 * 获取后一天有内容的记录（带缓存）
 */
export async function getNextRecord(db: D1Database, currentDate: string): Promise<DailyModel | null> {
  const cacheKey = CacheKeys.nextRecord(currentDate);

  // 尝试从缓存获取
  const cached = getFromCache<DailyModel>(cacheKey);
  if (cached) {
    return cached;
  }

  // 缓存未命中，查询数据库
  const record = await db
    .prepare('SELECT * FROM daily_models WHERE date > ? AND status = ? ORDER BY date ASC LIMIT 1')
    .bind(currentDate, 'completed')
    .first<DailyModel>();

  // 写入缓存
  if (record) {
    setCache(cacheKey, record, DEFAULT_TTL.PREV_NEXT);
  }

  return record;
}

/**
 * 获取待处理的记录（用于恢复未完成的任务）
 */
export async function getPendingRecord(db: D1Database, date: string): Promise<DailyModel | null> {
  return db
    .prepare('SELECT * FROM daily_models WHERE date = ? AND status = ?')
    .bind(date, 'generating')
    .first<DailyModel>();
}

/**
 * 检查今日是否已完成
 */
export async function hasTodayCompleted(db: D1Database): Promise<boolean> {
  const today = new Date().toISOString().split('T')[0];
  const record = await db
    .prepare('SELECT id FROM daily_models WHERE date = ? AND status = ?')
    .bind(today, 'completed')
    .first();
  return record !== null;
}

/**
 * 获取所有日期列表（带缓存，用于日历展示）
 */
export async function getAllDates(db: D1Database): Promise<string[]> {
  const cacheKey = CacheKeys.ALL_DATES;

  // 尝试从缓存获取
  const cached = getFromCache<string[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // 缓存未命中，查询数据库
  const results = await db
    .prepare('SELECT date FROM daily_models WHERE status = ? ORDER BY date DESC')
    .bind('completed')
    .all<{ date: string }>();
  const dates = results.results.map(r => r.date);

  // 写入缓存
  setCache(cacheKey, dates, DEFAULT_TTL.ALL_DATES);

  return dates;
}

/**
 * 获取指定日期之前的历史记录（用于防止重复生成）
 * @param db - D1 数据库实例
 * @param beforeDate - 在此日期之前
 * @param days - 获取多少天的记录
 */
export async function getRecentRecords(
  db: D1Database,
  beforeDate: string,
  days: number = 10
): Promise<Array<{ date: string; title: string; source_event: string }>> {
  const results = await db
    .prepare(
      `SELECT date, title, source_event FROM daily_models
       WHERE date < ? AND (status = 'completed' OR status = 'generating')
       ORDER BY date DESC LIMIT ?`
    )
    .bind(beforeDate, days)
    .all<{ date: string; title: string; source_event: string }>();
  return results.results;
}

/**
 * 更新记录的翻译（并清除相关缓存）
 */
export async function updateTranslations(
  db: D1Database,
  date: string,
  translations: string
): Promise<void> {
  await db
    .prepare('UPDATE daily_models SET translations = ? WHERE date = ?')
    .bind(translations, date)
    .run();

  // 清除相关缓存
  invalidateOnTranslationUpdate(date);
}

/**
 * 获取所有缺少翻译的已完成记录
 */
export async function getRecordsWithoutTranslations(
  db: D1Database
): Promise<DailyModel[]> {
  const results = await db
    .prepare(
      `SELECT * FROM daily_models
       WHERE status = 'completed' AND (translations IS NULL OR translations = '')
       ORDER BY date DESC`
    )
    .all<DailyModel>();
  return results.results;
}
