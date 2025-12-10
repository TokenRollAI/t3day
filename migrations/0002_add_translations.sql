-- 添加多语言翻译列
-- translations 存储 JSON 格式：
-- {
--   "en": { "title": "...", "description": "...", "location_name": "...", "source_event": "..." },
--   "ja": { "title": "...", "description": "...", "location_name": "...", "source_event": "..." },
--   "ko": { ... },
--   "es": { ... },
--   "ru": { ... },
--   "pt": { ... }
-- }

ALTER TABLE daily_models ADD COLUMN translations TEXT;
