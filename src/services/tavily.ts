import type { TavilyResponse } from '../types';

const TAVILY_API_URL = 'https://api.tavily.com/search';

/**
 * 计算目标日期的前一天
 */
function getYesterdayDate(targetDate?: string): string {
  const date = targetDate ? new Date(targetDate) : new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split('T')[0];
}

/**
 * 使用 Tavily API 搜索前一天的重要新闻
 *
 * @param apiKey - Tavily API key
 * @param targetDate - 目标日期 (YYYY-MM-DD)，搜索该日期前一天的新闻
 *                     如果不提供，则搜索昨天的新闻
 *
 * 注意：Tavily API 的 days 参数只能指定从当前日期往回多少天，
 * 不支持精确的日期范围过滤。因此对于历史日期，我们在 query 中
 * 包含日期来提高相关性，但无法保证结果完全匹配。
 */
export async function searchTodayNews(
  apiKey: string,
  targetDate?: string,
): Promise<TavilyResponse> {
  const yesterday = getYesterdayDate(targetDate);

  // 构建符合项目调性的高级 Query
  // 1. 明确时间
  // 2. 增加兴趣点关键词 (bizarre, cultural, breakthrough...)
  // 3. 排除噪音 (politics, finance, sports)
  const searchQuery = `global news events on ${yesterday} focusing on cultural shifts, strange discoveries, technology ethics, or environmental changes -politics -finance -sports -markets`;
  const response = await fetch(TAVILY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: searchQuery,
      topic: 'news',
      days: 3, // 保持3天是为了确保时区覆盖
      search_depth: 'advanced',
      include_answer: false,
      include_raw_content: false,
      max_results: 15, // 稍微增加结果数量，给 LLM 更多挑选空间
      // 显式排除不相关领域
      exclude_domains: [
        'weather.com',
        'espn.com',
        'bleacherreport.com',
        'investing.com',
        'bloomberg.com' // 很多财经新闻
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}
