# 前端布局和国际化参考

说明新的前端布局设计、URL 路由支持和多语言自动切换机制。

## 1. Core Summary

前端采用左右分离布局：左侧时间信息面板（年份、日期、月份、坐标、地点）+ 右侧描述面板（标题、描述、来源）。支持日期 URL 路由 `/2025-12-08`，自动根据浏览器语言显示中文或英文，通过 wrangler assets binding 实现完整的 SPA 路由。

## 2. Layout Architecture

### 左侧时间面板（Left Panel）

**显示内容**
```
YEAR
2025

DATE
08

MONTH
December → 12月

COORDINATES
40.71°N, 74.00°W

LOCATION
New York, USA → 纽约，美国
```

**CSS 类**：`#left-panel`
**可见性**：模型加载完成后通过 `visible` 类渐显

**代码位置**：`public/index.html:87-150`

### 右侧描述面板（Right Panel）

**显示内容**
```
TITLE
Something Funny Happened

DESCRIPTION
这是关于该事件的戏谑解说词...

SOURCE
Source: Interesting News Event
```

**CSS 类**：`#right-panel`
**特效**：打字机效果（typeWriter 函数）

**代码位置**：`public/index.html:151-180`

### 3D 渲染区域（Canvas）

**容器**：`#canvas-container`
**库**：Three.js + OrbitControls
**特效**：自动旋转，支持鼠标拖拽停止

**代码位置**：`public/index.html:36-43`，JavaScript 渲染逻辑

---

## 3. URL Routing

### 支持的 URL 格式

```
/ 或 /index.html
  → 获取最新记录 (/api/today)

/2025-12-08
  → 获取指定日期记录 (/api/date/2025-12-08)

/2025-12-08/prev
  → 获取前一天记录 (/api/date/2025-12-08/prev)

/2025-12-08/next
  → 获取后一天记录 (/api/date/2025-12-08/next)
```

### 实现方式

**SPA Fallback 配置**（wrangler.toml）：
```toml
assets = { directory = "./public", binding = "ASSETS", not_found_handling = "single-page-application" }
```

所有 404 请求都被重定向到 `index.html`，前端 JavaScript 负责解析 URL 并获取数据。

**前端路由解析**（public/index.html JavaScript 部分）：
```javascript
const path = window.location.pathname;
if (path === '/' || path === '/index.html') {
  // 获取最新记录
} else if (/^\d{4}-\d{2}-\d{2}/.test(path.split('/')[1])) {
  // 解析日期，获取对应记录
}
```

---

## 4. Internationalization (i18n)

### 语言检测

自动根据浏览器 `navigator.language` 或 `navigator.languages` 判断：

```javascript
const lang = navigator.language || navigator.languages?.[0] || 'en';
const isZh = lang.startsWith('zh');
```

### 翻译字符串

关键翻译字符串分布在代码中：

| 英文 | 中文 | 位置 |
|------|------|------|
| January | 1月 | public/index.html JavaScript |
| February | 2月 | 同上 |
| ... | ... | 同上 |
| Location | 位置 | 同上 |
| Source | 来源 | 同上 |
| Year | 年份 | 同上 |
| Month | 月份 | 同上 |

### 月份本地化

```javascript
const monthNames = {
  en: ['January', 'February', ..., 'December'],
  zh: ['1月', '2月', ..., '12月']
};
const month = monthNames[isZh ? 'zh' : 'en'][date.getMonth()];
```

### 坐标格式本地化

```javascript
// 英文
const latDir = latitude > 0 ? 'N' : 'S';
const lonDir = longitude > 0 ? 'E' : 'W';
// 如果需要中文，可扩展为 '北', '南', '东', '西'
```

---

## 5. Data Flow

### 获取最新记录

```
用户访问 / 或 /index.html
  ↓
页面加载 public/index.html
  ↓
JavaScript 检测路由（/）
  ↓
fetch('/api/today')
  ↓
API 返回 DailyModel（包含最新完成的记录）
  ↓
提取：date, title, description, latitude, longitude, location_name, model_url
  ↓
更新 DOM，设置左右面板内容
  ↓
GLTFLoader 加载模型
  ↓
Three.js 渲染 3D 场景
  ↓
打字机效果显示描述
  ↓
显示面板（opacity transition）
```

### 获取特定日期记录

```
用户访问 /2025-12-08
  ↓
页面加载 public/index.html
  ↓
JavaScript 解析路由（/2025-12-08）
  ↓
fetch('/api/date/2025-12-08')
  ↓
如果返回 404（记录不存在），显示错误信息
  如果返回记录，流程同上
  ↓
可通过导航链接（/prev, /next）快速浏览相邻日期
```

---

## 6. Loading State

**加载器动画**（#loader）：
```css
#loader {
  显示 3D 旋转立方体
  加载文本 "LOADING"
}

#loader.hidden {
  opacity: 0
  pointer-events: none
  transition: opacity 0.8s ease
}
```

当模型加载完成时，remove `#loader`，加 `.hidden` 类。

---

## 7. Analytics Integration

### Umami 埋点

```html
<script defer src="https://cloud.umami.is/script.js"
  data-website-id="d0bd9eaa-b94c-4925-9d4a-a62bfc397619">
</script>
```

**跟踪事件**：
- 页面访问（自动）
- Tripo 链接点击（可添加 `data-umami-event` 属性）

---

## 8. Favicon and Icons

**已支持的格式**：
```
/favicon.ico (48x48)
/favicon.svg (矢量)
/favicon-16x16.png
/favicon-32x32.png
/favicon-192x192.png (Android)
/favicon-512x512.png (Android)
/apple-touch-icon.png (iOS)
```

**位置**：`public/favicon*/`

---

## 9. Source of Truth

- **前端 HTML/CSS/JS**：`public/index.html`
- **SPA 路由配置**：`wrangler.toml:4`
- **后端 API 路由**：`src/index.ts:48-138`（/api/today, /api/date/:date 等）
- **数据获取**：`src/services/storage.ts`（getLatestRecord, getRecordByDate 等）

---

## 10. Responsive Design

**视口配置**：
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

**布局尺寸**：
- 全屏 3D Canvas：100vw × 100vh
- 左面板：固定定位，left: 40px，垂直居中
- 右面板：固定定位，right: 40px，垂直居中
- 加载器：全屏居中对齐

**适配性**：当前设计面向桌面浏览器，移动端可通过 CSS Media Query 进一步优化。
