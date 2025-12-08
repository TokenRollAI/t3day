-- 添加 tripo_task_id 和 status 字段
ALTER TABLE daily_models ADD COLUMN tripo_task_id TEXT;
ALTER TABLE daily_models ADD COLUMN status TEXT DEFAULT 'completed';

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_daily_models_status ON daily_models(status);
CREATE INDEX IF NOT EXISTS idx_daily_models_tripo_task_id ON daily_models(tripo_task_id);
