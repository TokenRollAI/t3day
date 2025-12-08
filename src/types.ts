// 环境变量类型定义
export interface Env {
  // Cloudflare D1 数据库
  DB: D1Database;
  // Cloudflare R2 存储桶
  MODELS_BUCKET: R2Bucket;
  // Cloudflare Assets binding
  ASSETS: Fetcher;
  // API Keys (通过 wrangler secret 设置)
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;  // OpenAI API 基础 URL（支持兼容服务）
  TAVILY_API_KEY: string;
  TRIPO_API_KEY: string;
  // 环境标识
  ENVIRONMENT: string;
}

// 每日模型数据结构
export interface DailyModel {
  id: number;
  date: string;           // YYYY-MM-DD
  title: string;          // 事件标题
  description: string;    // 解说词
  latitude: number;       // 纬度
  longitude: number;      // 经度
  location_name: string;  // 地点名称
  model_url: string;      // R2 中的 GLB 文件 URL
  model_prompt: string;   // 生成模型用的 prompt
  source_event: string;   // 原始新闻事件摘要
  tripo_task_id?: string; // Tripo 任务 ID
  status: 'pending' | 'generating' | 'completed' | 'failed';
  created_at: string;
}

// Tavily 搜索结果
export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilyResponse {
  results: TavilySearchResult[];
  query: string;
}

// GPT 内容生成结果
export interface GeneratedContent {
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  location_name: string;
  model_prompt: string;
  source_event: string;
}

// Tripo API 响应
export interface TripoTaskResponse {
  code: number;
  data: {
    task_id: string;
  };
}

export interface TripoTaskStatus {
  code: number;
  data: {
    status: 'queued' | 'running' | 'success' | 'failed';
    output?: {
      model?: string;      // 基础模型 GLB URL
      pbr_model?: string;  // PBR 模型 GLB URL (启用 pbr 时)
    };
    progress?: number;
  };
}
