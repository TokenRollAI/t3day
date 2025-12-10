# 数据库架构

D1 SQLite 数据库的完整模式定义和说明。

## 概述

The Daily Artefact 使用 Cloudflare D1 (SQLite) 存储每日生成的模型元数据。仅有一个核心表：`daily_models`。

## 表结构

### daily_models

存储每日生成的模型记录。

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | 自增主键 |
| date | TEXT | UNIQUE NOT NULL | 记录日期 (YYYY-MM-DD 格式) |
| title | TEXT | NOT NULL | 事件简短标题 |
| description | TEXT | NOT NULL | 戏谑解说词（中文） |
| latitude | REAL | NOT NULL | 事件发生地纬度（范围：-90 到 90） |
| longitude | REAL | NOT NULL | 事件发生地经度（范围：-180 到 180） |
| location_name | TEXT | NOT NULL | 地点名称（例："东京，日本"） |
| model_url | TEXT | NOT NULL | 模型访问 URL (/api/model/...) |
| model_prompt | TEXT | NOT NULL | 3D 模型生成 prompt（英文） |
| source_event | TEXT | NOT NULL | 原始新闻事件摘要 |
| translations | TEXT | NULL | 多语言翻译 JSON，支持 en, ja, ko, es, ru, pt |
| tripo_task_id | TEXT | NULL | 任务状态 JSON（支持任务恢复） |
| status | TEXT | DEFAULT 'completed' | 记录状态：'generating' 或 'completed' |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | 记录创建时间 |

**示例数据**

```
id | date       | title    | description           | latitude | longitude | location_name | model_url                      | translations                                          | created_at
1  | 2025-12-08 | 某事件   | 事件的戏谑解说...      | 40.7128  | -74.0060  | 纽约，美国     | /api/model/models/2025-12-08.glb | {"en":{...},"ja":{...},...}                           | 2025-12-08 08:00:00
```

## 索引

### idx_daily_models_date

```sql
CREATE INDEX idx_daily_models_date ON daily_models(date DESC);
```

- **用途**：加速日期排序查询，支持"获取最新记录"操作
- **类型**：非唯一索引
- **排序**：DESC（倒序），因为查询通常需要最新的日期

## 查询示例

### 1. 获取最新记录（前端调用）
```sql
SELECT * FROM daily_models ORDER BY date DESC LIMIT 1;
```
- 由 `src/services/storage.ts:78-82` 执行

### 2. 检查今日是否已生成
```sql
SELECT * FROM daily_models WHERE date = '2025-12-08';
```
- 由 `src/services/storage.ts:67-72` 执行（getTodayRecord）
- 如果返回行，则今日已生成，避免重复

### 3. 获取日期范围的记录（存档查询）
```sql
SELECT * FROM daily_models WHERE date BETWEEN '2025-12-01' AND '2025-12-08' ORDER BY date DESC;
```

### 4. 统计记录数
```sql
SELECT COUNT(*) as total FROM daily_models;
```

## 迁移脚本

### 0001_init.sql

初始化脚本位于 `migrations/0001_init.sql`，创建 daily_models 表和索引。

### 0002_add_translations.sql

添加多语言翻译支持，执行 SQL：
```sql
ALTER TABLE daily_models ADD COLUMN translations TEXT;
```

在部署时通过 Wrangler 执行所有迁移脚本：

```bash
npm run db:migrate       # 本地
npm run db:migrate:prod  # 生产
```

## 备份和导出

### 本地备份
```bash
# Wrangler 自动备份
wrangler d1 backup create today-3d-db

# 列出备份
wrangler d1 backup list today-3d-db
```

### 导出数据
```bash
# 导出为 SQL 脚本
wrangler d1 execute today-3d-db --remote --command ".dump"

# 导出为 CSV（通过 SQLite CLI）
sqlite3 today-3d.db ".mode csv" ".output data.csv" "SELECT * FROM daily_models;" ".quit"
```

## 性能考虑

1. **UNIQUE 约束在 date**
   - 保证每天仅一条记录
   - 插入时冲突会导致错误（由应用层 hasTodayRecord 预防）

2. **索引优化**
   - date DESC 索引支持 ORDER BY date DESC 查询（几乎所有读操作）
   - 避免全表扫描

3. **存储估算**
   - 每条记录约 2-4 KB（文本字段大小可变）
   - 5 年数据 (365 × 5 = 1825 条) 约 5-8 MB

## D1 限制

- **表数量**：无限制
- **行数**：无限制（受存储限制）
- **行大小**：单行最大 ~2GB（实际受 SQLite 限制）
- **数据库大小**：根据 Cloudflare 计划而定

当前架构无需水平扩展或分表。

## 代码参考

- **迁移脚本**：`migrations/0001_init.sql`
- **存储操作**：`src/services/storage.ts`
- **类型定义**：`src/types.ts:16-28` (DailyModel 接口)
