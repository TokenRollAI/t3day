-- 创建每日模型表
CREATE TABLE IF NOT EXISTS daily_models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  location_name TEXT NOT NULL,
  model_url TEXT NOT NULL,
  model_prompt TEXT NOT NULL,
  source_event TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建日期索引
CREATE INDEX IF NOT EXISTS idx_daily_models_date ON daily_models(date DESC);
