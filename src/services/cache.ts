/**
 * Worker 内存缓存模块
 *
 * 在同一个 Worker 实例的多个请求间共享缓存，减少 D1 查询。
 * 注意：不同 Worker 实例间不共享，但在同一边缘节点效果显著。
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// 全局缓存 Map（Worker 实例级别）
const cache = new Map<string, CacheEntry<unknown>>();

// 默认 TTL（毫秒）
const DEFAULT_TTL = {
  LATEST_RECORD: 60 * 60 * 1000, // 1 小时（最新记录可能变化）
  RECORD_BY_DATE: 24 * 60 * 60 * 1000, // 24 小时（历史记录基本不变）
  ALL_DATES: 60 * 60 * 1000, // 1 小时
  PREV_NEXT: 24 * 60 * 60 * 1000, // 24 小时（导航记录稳定）
};

/**
 * 缓存键常量
 */
export const CacheKeys = {
  LATEST_RECORD: 'latest_record',
  ALL_DATES: 'all_dates',
  recordByDate: (date: string) => `record:${date}`,
  prevRecord: (date: string) => `prev:${date}`,
  nextRecord: (date: string) => `next:${date}`,
};

/**
 * 从缓存获取数据
 */
export function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;

  if (!entry) {
    return null;
  }

  // 检查是否过期
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

/**
 * 写入缓存
 */
export function setCache<T>(key: string, data: T, ttlMs?: number): void {
  const ttl = ttlMs ?? DEFAULT_TTL.RECORD_BY_DATE;
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttl,
  });
}

/**
 * 删除单个缓存
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * 按模式删除缓存（支持前缀匹配）
 */
export function invalidateCacheByPrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * 清空所有缓存
 */
export function clearAllCache(): void {
  cache.clear();
}

/**
 * 记录完成时的缓存失效
 * 当新记录完成时，需要清除以下缓存：
 * - latest_record（有新的最新记录）
 * - all_dates（日期列表变化）
 * - 相邻日期的 prev/next 缓存
 */
export function invalidateOnRecordComplete(date: string): void {
  // 清除最新记录缓存
  invalidateCache(CacheKeys.LATEST_RECORD);

  // 清除日期列表缓存
  invalidateCache(CacheKeys.ALL_DATES);

  // 清除该日期的记录缓存（可能从 generating 变为 completed）
  invalidateCache(CacheKeys.recordByDate(date));

  // 清除相邻日期的导航缓存
  // 前一天的 next 指向可能变化
  const prevDate = getPrevDateString(date);
  invalidateCache(CacheKeys.nextRecord(prevDate));

  // 后一天的 prev 指向可能变化
  const nextDate = getNextDateString(date);
  invalidateCache(CacheKeys.prevRecord(nextDate));
}

/**
 * 翻译更新时的缓存失效
 */
export function invalidateOnTranslationUpdate(date: string): void {
  invalidateCache(CacheKeys.recordByDate(date));
  invalidateCache(CacheKeys.LATEST_RECORD);
}

/**
 * 获取缓存统计（调试用）
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}

// 辅助函数：获取前一天日期字符串
function getPrevDateString(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// 辅助函数：获取后一天日期字符串
function getNextDateString(date: string): string {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// 导出 TTL 常量供外部使用
export { DEFAULT_TTL };
