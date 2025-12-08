# The Daily Artefact - 项目文档索引

## 文档导航

### Overview (项目概览)
快速理解项目的本质和目的。

- **[project.md](/llmdoc/overview/project.md)** - 项目身份、目标和主要功能概述

### Architecture (系统架构)
深入理解系统如何运作，各组件的交互关系。

- **[system.md](/llmdoc/architecture/system.md)** - 完整系统架构、数据流和核心组件

### Guides (操作指南)
如何执行特定的开发或部署任务。

- **[deployment.md](/llmdoc/guides/deployment.md)** - 本地开发和生产部署完整步骤
- **[manual-generation.md](/llmdoc/guides/manual-generation.md)** - 手动触发每日内容生成
- **[task-recovery.md](/llmdoc/guides/task-recovery.md)** - 恢复中断的 3D 生成任务

### Reference (参考文档)
API 规范、数据结构、配置等详细信息。

- **[api.md](/llmdoc/reference/api.md)** - HTTP API 端点说明（包括新的 `/api/resume/:date` 恢复端点）
- **[database-schema.md](/llmdoc/reference/database-schema.md)** - 数据库结构定义
- **[environment-variables.md](/llmdoc/reference/environment-variables.md)** - 环境变量完整列表
- **[tripo-two-step-flow.md](/llmdoc/reference/tripo-two-step-flow.md)** - Tripo 两步生成流程（图片 → 模型）和任务状态管理
- **[frontend-layout-i18n.md](/llmdoc/reference/frontend-layout-i18n.md)** - 前端布局、URL 路由和多语言支持

---

## 快速开始

1. **理解项目**：阅读 [project.md](/llmdoc/overview/project.md)
2. **学习架构**：阅读 [system.md](/llmdoc/architecture/system.md)
3. **开发部署**：按照 [deployment.md](/llmdoc/guides/deployment.md) 操作
4. **查询细节**：参考 [reference](/llmdoc/reference/) 目录

## 项目关键信息

- **技术栈**：Cloudflare Workers (Hono) + D1 + R2 + Three.js
- **核心流程**：Tavily 新闻搜索 → GPT 内容生成 → Tripo 两步建模（图片 → 模型）→ R2 存储
- **自动化**：Cloudflare Cron 每天 UTC 00:00 触发（北京时间 08:00）
- **前端**：Three.js 3D 渲染，左右分离布局，支持日期 URL 路由和中英文自动切换
- **任务恢复**：支持从图片或模型生成阶段恢复中断的任务，避免重复计算

## 最近更新（Dec 2025）

### 生成流程重构
- 从单步 `text_to_model` 改为两步流程：图片生成（nano banana）→ 图片转模型
- 任务状态以 JSON 格式保存在数据库，支持中断恢复
- 新增 `/api/resume/:date` 端点用于任务恢复

### 前端增强
- 支持日期 URL 路由（如 `/2025-12-08`），方便链接分享
- 新布局：左侧时间信息 + 右侧描述，更清晰的视觉层次
- 自动语言切换：根据浏览器语言显示中文或英文
- 完整的 SPA 支持，通过 wrangler assets binding 实现路由

### 基础设施
- Favicon 和 apple-touch-icon 支持
- Umami 埋点统计用户行为
- "Powered by Tripo" 链接
