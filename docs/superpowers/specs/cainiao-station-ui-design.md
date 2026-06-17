# 菜鸟驿站 SaaS · UI 设计规范

> 版本 v1.0（2026-06-18）｜ 配套《平台设计方案》§8 前端
> 适用三端：`station-web`（驿站工作台）/ `admin-web`（平台运营后台）/ `user-app`（用户端小程序 + H5）
> 设计基准文件：`design/_kit/kit.css`（默认清爽蓝 token + 组件类）、`design/_kit/README.md`（出图规范）、`design/mockups/theme-switch-demo.html`（三主题 token + 切换机制）
> 本文为前端实现的视觉与组件单一基准。所有页面必须以本文 + kit.css 为准，保证 31 个高保真页面视觉一致。

---

## 1. 设计语言与原则

菜鸟驿站是面向**真实运营**的多租户 SaaS：两端数据密集后台（station-web / admin-web）+ 一端高频移动操作（user-app）。设计语言围绕「专业、高效、克制」展开。

### 1.1 核心原则
1. **专业**：后台界面服务驿站店长/店员与平台运营，信息密度高、操作链路短。视觉以中性灰蓝为底、单一主色点睛，不堆装饰。
2. **高效**：高频动作（扫码入库、取件核销）一步直达；列表、表格、KPI 一屏可览；快捷操作区常驻。
3. **克制**：一套组件库、三套皮肤；颜色仅承载语义（状态色），不做无意义彩色；动效仅过渡颜色/阴影，禁止位移跳动。
4. **全屏平铺（full-bleed）**：后台固定侧栏 + 内容区铺满剩余全宽，绝不做居中固定宽内嵌容器。屏幕越大，可见数据越多。
5. **数据密集 + 移动端双形态**：后台为数据密集型桌面布局（表格/KPI/趋势）；user-app 为移动端竖屏卡片化布局（大圆角、44px 触控、tabbar）。

### 1.2 设计要点速记
- 字号基准 14px；正文不用浅灰（`--muted` 仅用于次要信息）。
- 数字一律 `tabular-nums`（等宽对齐，便于纵向比对）。
- 状态语义清晰：在库待取=蓝 / 已取件=绿 / 滞留=红 / 异常=琥珀。
- 图标统一 Lucide 线性 SVG，禁止 emoji 当图标。
- 所有可点元素 `cursor:pointer`，hover 仅过渡颜色/阴影（150–300ms）。

---

## 2. 三套主题 Token 规范

一套组件库、三套皮肤，全部 token 化为 CSS 变量。切换皮肤只换根节点 `data-theme`，组件代码不动。以下数值取自 `design/mockups/theme-switch-demo.html`，并以 `kit.css`（清爽蓝）为基线补全。

### 2.1 清爽蓝 `blue`（默认）

专业克制的浅色后台主题，作为系统默认与高保真出图基准。

| 类别 | 变量 | 值 |
|---|---|---|
| 背景 | `--bg` | `#F7F8FA` |
| 表面 | `--surface` | `#FFFFFF` |
| 表面 2 | `--surface-2` | `#FBFCFE` |
| 侧栏背景 | `--side-bg` | `#FFFFFF` |
| 侧栏文字 | `--side-fg` | `#334155` |
| 侧栏次要 | `--side-mut` | `#94A3B8` |
| 侧栏选中底 | `--side-on-bg` | `#EBF1FE` |
| 侧栏选中字 | `--side-on-fg` | `#3B6EF6` |
| 侧栏分隔线 | `--side-line` | `#EEF1F5` |
| 正文文字 | `--text` | `#1E293B` |
| 次要文字 | `--muted` | `#64748B` |
| 边框 | `--border` | `#E8EBF0` |
| 边框 2 | `--border-2` | `#F1F3F7` |
| 主色 | `--primary` | `#3B6EF6` |
| 主色前景 | `--primary-fg` | `#fff` |
| 主色浅底 | `--primary-soft` | `#EBF1FE` |
| 主色深 | `--primary-700` | `#2557E6` |
| 强调色 | `--accent` | `#10B981` |
| 强调浅底 | `--accent-soft` | `#E7F8F1` |
| 成功 | `--ok` / `--ok-soft` | `#16A34A` / `#ECFDF3` |
| 警告 | `--warn` / `--warn-soft` | `#D97706` / `#FEF3C7` |
| 危险 | `--danger` / `--danger-soft` | `#DC2626` / `#FEF2F2` |
| 信息 | `--info` / `--info-soft` | `#0EA5E9` / `#E0F2FE` |
| 紫 | `--purple` / `--purple-soft` | `#7C5CFC` / `#EFEBFF` |
| 圆角 | `--radius` / `--radius-sm` / `--radius-lg` | `12px` / `9px` / `16px` |
| 阴影 | `--shadow` | `0 1px 3px rgba(16,24,40,.06),0 1px 2px rgba(16,24,40,.04)` |
| 阴影 lg | `--shadow-lg` | `0 12px 32px rgba(16,24,40,.12)` |
| 字体 | `--font` | `'Inter','PingFang SC','Microsoft YaHei',system-ui,sans-serif` |
| 标题字体 | `--font-head` | `var(--font)` |
| 数字字体 | `--font-num` | `var(--font)` |
| 辉光 | `--glow` | `none` |

### 2.2 科技暗 `dark`

深色高对比、青色主色 + 辉光的科技感主题，适合运营大屏/夜间值守。

| 类别 | 变量 | 值 |
|---|---|---|
| 背景 | `--bg` | `#0B0F1A` |
| 表面 | `--surface` | `#131A2A` |
| 表面 2 | `--surface-2` | `#0F1626` |
| 侧栏背景 | `--side-bg` | `#0C111E` |
| 侧栏文字 | `--side-fg` | `#C7D2E0` |
| 侧栏次要 | `--side-mut` | `#5B6B82` |
| 侧栏选中底 | `--side-on-bg` | `linear-gradient(135deg,#22D3EE,#0EA5C4)` |
| 侧栏选中字 | `--side-on-fg` | `#04121A` |
| 侧栏分隔线 | `--side-line` | `#1B2436` |
| 正文文字 | `--text` | `#E6EDF7` |
| 次要文字 | `--muted` | `#8595AD` |
| 边框 | `--border` | `#1E2A40` |
| 主色 | `--primary` | `#22D3EE` |
| 主色前景 | `--primary-fg` | `#04121A` |
| 主色浅底 | `--primary-soft` | `rgba(34,211,238,.12)` |
| 强调色 | `--accent` | `#34D399` |
| 强调浅底 | `--accent-soft` | `rgba(52,211,153,.12)` |
| 成功 | `--ok` / `--ok-soft` | `#34D399` / `rgba(52,211,153,.12)` |
| 警告 | `--warn` / `--warn-soft` | `#FBBF24` / `rgba(251,191,36,.12)` |
| 危险 | `--danger` / `--danger-soft` | `#FB7185` / `rgba(251,113,133,.12)` |
| 圆角 | `--radius` / `--radius-sm` | `12px` / `9px` |
| 阴影 | `--shadow` | `0 0 0 1px rgba(34,211,238,.08),0 10px 28px rgba(0,0,0,.45)` |
| 字体 | `--font` | `'Inter','PingFang SC',system-ui,sans-serif` |
| 标题字体 | `--font-head` | `'Space Grotesk',var(--font)` |
| 数字字体 | `--font-num` | `'JetBrains Mono',var(--font)` |
| 辉光 | `--glow` | `0 0 16px rgba(34,211,238,.5)` |

> 暗主题专属背景纹理：`body` 叠加 `radial-gradient(circle at 1px 1px,rgba(34,211,238,.06) 1px,transparent 0) 0 0/26px 26px`（点阵网格）。

### 2.3 柔和薄荷 `mint`

绿松主色、大圆角、柔和阴影的清新主题，亲和力强。

| 类别 | 变量 | 值 |
|---|---|---|
| 背景 | `--bg` | `#F1FAF6` |
| 表面 | `--surface` | `#FFFFFF` |
| 表面 2 | `--surface-2` | `#F6FBF9` |
| 侧栏背景 | `--side-bg` | `#FFFFFF` |
| 侧栏文字 | `--side-fg` | `#4B5563` |
| 侧栏次要 | `--side-mut` | `#9AA7B2` |
| 侧栏选中底 | `--side-on-bg` | `#E3F7F0` |
| 侧栏选中字 | `--side-on-fg` | `#15A07E` |
| 侧栏分隔线 | `--side-line` | `#EEF4F1` |
| 正文文字 | `--text` | `#243240` |
| 次要文字 | `--muted` | `#6B7A87` |
| 边框 | `--border` | `#E7EFEB` |
| 主色 | `--primary` | `#19B894` |
| 主色前景 | `--primary-fg` | `#fff` |
| 主色浅底 | `--primary-soft` | `#E3F7F0` |
| 强调色 | `--accent` | `#5B9BF3` |
| 强调浅底 | `--accent-soft` | `#E9F1FE` |
| 成功 | `--ok` / `--ok-soft` | `#10A37F` / `#E3F7F0` |
| 警告 | `--warn` / `--warn-soft` | `#E08A2B` / `#FCEFD9` |
| 危险 | `--danger` / `--danger-soft` | `#E2603F` / `#FCEAE4` |
| 圆角 | `--radius` / `--radius-sm` | `20px` / `14px` |
| 阴影 | `--shadow` | `0 8px 22px rgba(25,184,148,.10),0 2px 8px rgba(31,45,61,.05)` |
| 字体 | `--font` | `'Plus Jakarta Sans','PingFang SC',system-ui,sans-serif` |
| 标题字体 | `--font-head` | `var(--font)` |
| 数字字体 | `--font-num` | `var(--font)` |
| 辉光 | `--glow` | `none` |

> 薄荷主题专属背景：`body` 叠加 `linear-gradient(160deg,#F1FAF6,#F2F6FF)`（薄荷向天蓝的柔和渐变）。

### 2.4 跨主题约定
- 三套主题共用同一组件类与同一组 token 名；差异仅在变量取值，组件 CSS 不引主题硬编码色值。
- `--font-head` / `--font-num` / `--glow` 为暗/薄荷主题引入的扩展 token；blue 下分别回落为 `var(--font)` / `var(--font)` / `none`。
- 暗主题对辉光元素（logo、选中项、KPI 数字、主按钮）应用 `box-shadow:var(--glow)` / `text-shadow:var(--glow)`；blue/mint 下 `--glow:none` 自动无效。

### 2.5 字体引入
所有页面引入（暗/薄荷的扩展字族一并加载，按主题生效）：
```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
```

---

## 3. 主题切换机制

### 3.1 根节点驱动
- 在 `<html>`（`document.documentElement`）设置 `data-theme="blue|dark|mint"`。
- 主题 token 以 `:root[data-theme="blue"] { … }` 形式定义，切换属性即整页换肤，配合 `body{transition:background .3s,color .3s}` 平滑过渡。

### 3.2 偏好存储（双层）
1. **前端即时记忆**：`localStorage` 键 `cn-theme`。页面初始化时读取并应用，无值则用默认 `blue`。
2. **后端用户配置**：登录用户的主题偏好写入用户配置（`users` 偏好字段），登录后随用户资料返回，覆盖/同步 localStorage，实现跨设备一致。
3. **优先级**：后端用户偏好（已登录）> localStorage（本机）> 默认 `blue`。

### 3.3 切换控件
顶栏分段控件 `.seg`（清爽蓝 / 科技暗 / 柔和薄荷），点击调用 `setTheme(t)`：
```js
function setTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('cn-theme', t);
  // 已登录时同步写后端用户偏好
}
```

### 3.4 适用范围
| 端 | 主题范围 |
|---|---|
| `station-web` | 三套全量（blue / dark / mint），用户可自由切换 |
| `admin-web` | 三套全量（blue / dark / mint），用户可自由切换 |
| `user-app` | 仅浅色 / 暗色两档（薄荷不在移动端首期范围）；默认浅色，跟随系统或手动切换 |

> 默认主题：全端 `blue`（浅色），首次进入未登录、无 localStorage 时生效。

---

## 4. 布局规范

### 4.1 后台全屏平铺（station-web / admin-web）
- 外层 `.app`：`display:grid; grid-template-columns:248px 1fr; min-height:100vh`。
- **固定侧栏 248px**：`.side` `position:sticky; top:0; height:100vh`，背景 `--side-bg`，右边框 `--side-line`，纵向 flex（brand → nav → side-foot）。
- **内容区铺满**：`.main` 占 `1fr`，`padding:20px 26px`，`min-width:0`（防止表格撑破网格）。内容**不居中、不设固定 max-width 内嵌容器**——屏幕越宽内容越宽。
- 顶栏 `.top` 在 `.main` 顶部，左标题右操作；页内可用 `.page-hd`（面包屑 + 标题）+ `.toolbar`（筛选/操作条）。

### 4.2 移动端（user-app）
- **不使用** `.app` 后台布局。竖屏固定宽：`body{width:390px}`，逻辑设计稿 **390×844**（iPhone 安全区基准）。
- 结构：顶部状态栏 + 标题栏 → 可滚动内容区（卡片化）→ 底部固定 `tabbar`（首页 / 寄件 / 消息 / 我的）。
- 复用 kit 的 token 配色、`.tag`、`.btn`、卡片圆角；但按移动端尺寸排版：大圆角、卡片化、**44px 触控目标**。

### 4.3 响应式策略
- 后台桌面优先，断点收窄时：KPI 网格由 5 列 → 2 列、`.row`（主区 + 侧栏卡片）堆叠为单列、`.form-grid` 双列 → 单列。
- 侧栏在窄屏可折叠为图标条 / 抽屉（移动端访问后台时）。
- user-app 以 390 宽为基准，按视口等比放大；H5 下最大宽度限定移动卡片宽度并居中（移动端例外，不适用全屏平铺）。

---

## 5. 组件库规范（依据 kit.css）

所有组件类来自 `design/_kit/kit.css`，三主题共用。下表为用途 + 类名速查；具体样式以 kit.css 为准。

### 5.1 应用外壳 / 侧栏 / 顶栏
| 组件 | 类名 | 用途 |
|---|---|---|
| 应用容器 | `.app` | 全屏平铺网格（248px 侧栏 + 1fr 内容） |
| 侧栏 | `.side` | 固定侧栏容器（sticky，满高） |
| 品牌区 | `.brand` `.brand .logo` | logo + 应用名 + 门店/场景副标 |
| 导航 | `.nav` `.nav a` `.nav a.on` | 菜单项；当前页加 `.on`；`.nav a .badge` 红点计数；`.nav .grp` 分组标题 |
| 侧栏底 | `.side-foot` `.side-foot .dot` | 门店切换 / 状态指示（绿点=营业中） |
| 内容区 | `.main` | 主内容容器 |
| 顶栏 | `.top` `.top h1` `.top .sub` `.top-r` | 左标题 + 副标；右操作区 |
| 搜索 | `.search` | 顶栏搜索框（取件码/手机号/运单号） |
| 图标按钮 | `.ibtn` `.ibtn .dot` | 通知等图标入口，红点提示 |
| 用户 | `.avatar` `.avatar i` `.avatar b` | 当前用户/角色入口 |
| 页头 | `.page-hd` `.crumb` | 二级页面面包屑 + 标题 |
| 工具条 | `.toolbar` `.toolbar .spacer` | 筛选 + 操作按钮行 |

### 5.2 按钮 `.btn`
| 变体 | 类名 | 用途 |
|---|---|---|
| 默认 | `.btn` | 次级操作，白底描边 |
| 主操作 | `.btn-primary` | 页面主动作（入库确认、保存），主色实底 |
| 强调 | `.btn-accent` | 正向次主动作（核销出库），强调色实底 |
| 危险 | `.btn-danger` | 删除/停用，危险色实底 |
| 幽灵 | `.btn-ghost` | 弱化操作，透明底 |
| 大 | `.btn-lg` | 移动端/重要 CTA，高 44px |
| 小 | `.btn-sm` | 表格行内/紧凑场景，高 30px |

> hover 仅过渡边框/背景/亮度；按钮内可带 16px SVG 图标。

### 5.3 表单
| 组件 | 类名 | 用途 |
|---|---|---|
| 字段组 | `.field` `.field label` `.req` | 标签 + 控件纵向组；`.req` 红色必填星 |
| 输入框 | `.input` `textarea.input` | 文本/数字/多行输入；focus 主色描边 + 主色浅底光圈 |
| 下拉 | `.select` | 原生 select，内置下拉箭头图标 |
| 表单网格 | `.form-grid` | 双列字段布局（响应式降为单列） |
| 开关 | `.switch` `.switch.on` | 布尔切换；开态主色，圆点位移 |

### 5.4 卡片 / KPI
| 组件 | 类名 | 用途 |
|---|---|---|
| 卡片 | `.card` `.card>.hd` `.card>.bd` | 内容容器；头部标题 + 操作，主体内容 |
| 指标卡 | `.kpi` `.kpi .lab` `.kpi .num` `.kpi .delta` | 单指标展示：标签+图标、数值（tabular-nums）、环比 delta |

> KPI 数字应用 `--font-num` + `tabular-nums`；告警态可加 `.kpi.warn`（图标/数值转警告色）。

### 5.5 表格 `.table-card`
| 组件 | 类名 | 用途 |
|---|---|---|
| 表格卡 | `.table-card` | 圆角描边阴影包裹的表格容器（`overflow:hidden`） |
| 表格 | `table` `thead th` `tbody td` `tbody tr:hover` | 表头次要色 + 表面 2 底；行 hover 高亮；td 数字 tabular-nums |
| 取件码 | `.code` | 主色加粗（暗主题等宽字体） |
| 行操作 | `.op` `.op+.op` `.op.danger` | 文字操作链接，多个间距 14px，危险态红色 |

### 5.6 标签 `.tag`
| 变体 | 类名 | 语义/用途 |
|---|---|---|
| 蓝 | `.tag.blue` | 在库待取 / 进行中 |
| 绿 | `.tag.green` | 已取件 / 成功 / 完成 |
| 红 | `.tag.red` | 滞留 / 失败 / 停用 |
| 琥珀 | `.tag.amber` | 异常 / 待处理预警 |
| 灰 | `.tag.gray` | 中性 / 已关闭 |
| 紫 | `.tag.purple` | 特殊标记 / 增值 |

> 可选 `.tag .d`（前导小圆点）。状态语义见 §7。

### 5.7 标签页 / 分页
| 组件 | 类名 | 用途 |
|---|---|---|
| 标签页 | `.tabs` `.tabs .tab` `.tabs .tab.on` | 同页多视图切换；选中项主色下划线 |
| 分页 | `.pager` `.pager .pg` `.pager .pg.on` | 列表翻页；当前页主色实底 |

### 5.8 进度 / 弹窗 / 抽屉 / 空状态
| 组件 | 类名 | 用途 |
|---|---|---|
| 进度条 | `.progress` `.progress span` | 库位占用率 / 完成度 |
| 遮罩 | `.mask` | 模态背景遮罩（半透明） |
| 模态框 | `.modal` `.modal>.hd` `.modal>.bd` `.modal>.ft` | 居中弹窗：标题/正文/底部按钮区 |
| 抽屉 | `.drawer` | 右侧滑出面板（详情/编辑），满高 480px |
| 空状态 | `.empty` `.empty svg` | 无数据占位：线性图标 + 说明 |

### 5.9 辅助类
| 类名 | 用途 |
|---|---|
| `.tnum` | 数字等宽对齐（= tabular-nums） |
| `.muted` | 次要文字色 |
| `.link` | 主色加粗可点链接 |

---

## 6. 图标与交互规范

1. **图标**：统一使用 **Lucide 线性 SVG**，内联到页面；`svg{stroke:currentColor;fill:none;stroke-width:2}`，随容器色继承。**禁止用 emoji 当图标**。常用尺寸：导航 18px、按钮 16px、KPI 图标 15px。
2. **可点性**：所有可交互元素 `cursor:pointer`。
3. **悬停动效**：hover 仅过渡**颜色 / 阴影**，时长 **150–300ms**（kit 默认 .18s）；**禁止位移、缩放、跳动**。
4. **数字**：所有数值（KPI、表格、金额、计数）使用 `tabular-nums`（`.tnum` 或 `font-variant-numeric:tabular-nums`），纵向对齐。
5. **对比度**：正文与背景对比度 **≥ 4.5:1**（WCAG AA）；正文不用浅灰，次要信息才用 `--muted`。
6. **焦点反馈**：输入控件 focus 用主色描边 + 主色浅底光圈（`box-shadow:0 0 0 3px var(--primary-soft)`），保证键盘可达。
7. **数据真实感**：示例数据用真实感中文，列表 ≥ 8 行；脱敏规范：收件人「王\*\*」、手机仅留尾号 4 位。

---

## 7. 状态色语义

状态色仅承载业务语义，三主题取值随皮肤变化、语义不变。包裹核心状态与色彩映射：

| 业务状态 | 语义色 | 标签类 | token | 触发 |
|---|---|---|---|---|
| **在库待取** STORED | 蓝（主色） | `.tag.blue` | `--primary` / `--primary-soft` | 入库完成、分配库位+取件码 |
| **已取件** PICKED_UP | 绿 | `.tag.green` | `--ok` / `--ok-soft` | 取件核销成功 |
| **滞留** 超期 | 红 | `.tag.red` | `--danger` / `--danger-soft` | STORED 超 N 天未取 |
| **异常** EXCEPTION | 琥珀 | `.tag.amber` | `--warn` / `--warn-soft` | 标记异常、入异常工单 |

> 衍生：中性/已关闭用 `.tag.gray`；增值/特殊用 `.tag.purple`。滞留预警 KPI 用 `.kpi.warn`（琥珀），与「异常件」侧栏 badge（红点计数）配合。

---

## 8. 三应用页面清单

> 每页一行：页面名 · 用途 · 关键区块/组件 · 高保真文件名（`design/mockups/hifi/<app>/`）。

### 8.1 station-web 驿站工作台（12 页）

侧栏分组「代收业务 / 网点管理」，外壳见 README §station-web。

| 页面 | 用途 | 关键区块 / 组件 | 高保真文件 |
|---|---|---|---|
| 工作台 | 店长当日运营总览 | 5×`.kpi`（今日入库/出库/在库/取件率/滞留预警）+ 最近入库 `.table-card` + 快捷操作 `.qbtn` + 近7天趋势柱图 | `workbench.html` |
| 扫码入库 | 扫码/手动录入到件 → 生成取件码 | 扫码输入区 + `.field`/`.input` 录入表单 + 库位分配 + 待入库列表 | `inbound.html` |
| 在库包裹 | 在库包裹查询管理 | `.toolbar` 筛选 + `.tabs`（全部/在库/滞留）+ `.table-card` + `.tag` 状态 + `.pager` | `parcels.html` |
| 包裹详情 | 单包裹全生命周期 | `.drawer`/详情卡 + 状态机时间线 + `parcel_events` + 操作（核销/标异常/催取） | `parcel-detail.html` |
| 取件核销 | 取件码/手机尾号核销出库 | 核销输入 `.input` + 待核销列表 + 家人代取授权 + `.btn-accent` 确认 | `pickup.html` |
| 异常件 | 异常包裹工单处理 | 侧栏 badge 计数 + 异常列表 `.table-card` + `.tag.amber` + 处理 `.modal` | `exceptions.html` |
| 货架库位 | 区-排-层-位库位管理 | 货架网格视图 + 占用率 `.progress` + 库位 `.card` + 分配/释放 | `shelves.html` |
| 寄件管理 | 代寄订单（P2） | 下单/报价 `.form-grid` + 订单 `.table-card` + ShipOrder 状态 `.tag` | `shipping.html` |
| 经营统计 | 门店经营数据分析 | KPI + 趋势图卡 + 排行/明细 `.table-card` + 时间筛选 `.toolbar` | `statistics.html` |
| 员工权限 | 店员账号与角色（租户 RBAC） | 员工 `.table-card` + 角色配置 `.modal` + 门店 scope + `.switch` 权限 | `staff-roles.html` |
| 门店设置 | 门店基础信息与配置 | `.tabs`（基础/通知/营业）+ `.field` 设置表单 + `.switch` 开关 | `settings.html` |
| 登录 | 店长/店员登录 | 居中登录卡（移动端例外）+ `.field` + `.btn-primary` | `login.html` |

### 8.2 admin-web 平台运营后台（10 页）

侧栏分组「运营 / 商业化 / 系统」，外壳见 README §admin-web，配色同清爽蓝。

| 页面 | 用途 | 关键区块 / 组件 | 高保真文件 |
|---|---|---|---|
| 平台总览 | 全平台运营监控大屏 | 平台级 `.kpi`（租户/门店/包裹/GMV）+ 实时趋势 + 监控 `.table-card` | `overview.html` |
| 租户管理 | 租户生命周期管理 | 租户 `.table-card` + 状态 `.tag`（active/suspended/closed）+ 详情 `.drawer` | `tenants.html` |
| 入驻审核 | 自助入驻申请审核（P3） | 申请列表 `.table-card` + 审核 `.modal`（通过/驳回）+ `.tag.amber` 待审 | `applications.html` |
| 门店监控 | 多门店实时监控 | 门店 `.card` 网格 + 在线状态 `.dot` + 异常告警 + `.table-card` | `stores.html` |
| 订阅与账单 | 订阅与计费账单（P3） | 订阅 `.table-card` + 账单 `.tag`（已付/逾期）+ 用量计费明细 | `billing.html` |
| 套餐配置 | 套餐定价与额度配置 | 套餐 `.card`（基础/标准/旗舰）+ `.form-grid` 定价 + 额度 `.field` | `plans.html` |
| 平台用户 | 平台员工账号管理 | 用户 `.table-card` + 角色 `.tag` + 增删 `.modal` + `.switch` 启停 | `platform-users.html` |
| 系统配置 | 平台级系统参数 | `.tabs` 分类 + `.field`/`.switch` 配置项 + 适配开关（短信/支付/物流） | `system-config.html` |
| 操作审计 | 关键操作审计日志 | 审计 `.table-card` + 筛选 `.toolbar` + 操作详情 + `.pager` | `audit.html` |
| 登录 | 平台运营登录 | 居中登录卡 + `.field` + `.btn-primary` | `login.html` |

> 注：平台「角色权限」配置复用与「平台用户」同域 RBAC 管理界面，菜单项归「系统」分组。

### 8.3 user-app 用户端（9 页）

移动端竖屏 390×844，底部 tabbar（首页/寄件/消息/我的），见 README §user-app。

| 页面 | 用途 | 关键区块 / 组件 | 高保真文件 |
|---|---|---|---|
| 首页 | 我的包裹与取件入口 | 状态栏+标题栏 + 取件码卡 + 包裹列表卡（`.tag` 状态）+ tabbar | `home.html` |
| 我的包裹 | 跨门店包裹聚合查看 | `.tabs`（待取/已取/全部）+ 包裹卡列表 + 状态 `.tag` | `parcels.html` |
| 取件码 | 出示取件码核销 | 大号取件码 + 二维码/条码 + 门店/库位信息 + 大圆角卡 | `pickup-code.html` |
| 在线寄件 | 下单寄件（P2） | 寄/收地址 `.field` + 物品 + 报价 + `.btn-lg` 下单 | `ship.html` |
| 物流追踪 | 寄件订单轨迹追踪 | 轨迹时间线 + ShipOrder 状态 `.tag` + 运单信息卡 | `tracking.html` |
| 消息 | 到件/系统通知 | 通知列表卡 + 未读红点 + 分类筛选 | `messages.html` |
| 我的 | 个人中心 | 用户信息卡 + 功能入口列表 + 主题切换（浅/暗）+ 设置 | `profile.html` |
| 代取授权 | 家人代取授权管理 | 授权列表卡 + 新增授权 + 取件码共享 | `authorize.html` |
| 登录 | 微信/手机号登录 | 手机号验证码 `.field` + `.btn-lg` + 微信一键登录 | `login.html` |

---

## 9. 高保真原型索引

### 9.1 本地高保真（清爽蓝 · 全屏平铺）
路径：`design/mockups/hifi/`，单文件自包含 HTML，浏览器直开。每页第一行 `<!-- @dsCard group="station-web|admin-web|user-app" -->`，内联 `design/_kit/kit.css` 全量。

- `design/mockups/hifi/station-web/`（12）：`workbench.html` `inbound.html` `parcels.html` `parcel-detail.html` `pickup.html` `exceptions.html` `shelves.html` `shipping.html` `statistics.html` `staff-roles.html` `settings.html` `login.html`
- `design/mockups/hifi/admin-web/`（10）：`overview.html` `tenants.html` `applications.html` `stores.html` `billing.html` `plans.html` `platform-users.html` `system-config.html` `audit.html` `login.html`
- `design/mockups/hifi/user-app/`（9）：`home.html` `parcels.html` `pickup-code.html` `ship.html` `tracking.html` `messages.html` `profile.html` `authorize.html` `login.html`

三主题切换演示：`design/mockups/theme-switch-demo.html`（blue/dark/mint 实时切换样例 + token 定义源）。

### 9.2 设计系统资产
- 共享 KIT：`design/_kit/kit.css`（token + 组件类）、`design/_kit/README.md`（出图规范 + 三应用外壳约定）。
- Claude Design 项目：**「菜鸟驿站 SaaS Design System」**，projectId `d836fd0e-a628-4075-95d0-1bf769bd7dd5`。

### 9.3 品牌上下文（示例数据基准）
- 品牌「驿小站」；当前门店「城南综合驿站」（编号 CN-0731）；当前用户「店长」。
- admin-web 顶栏用户「平台 / 运营管理员」。
- 统一日期口径「2026年6月18日 周四 · 营业中」。

---

> 实现约束：前端 Vue3 + TS + Vite + Pinia + Vue Router；`station-web`/`admin-web` 用 Element Plus，`user-app` 用 uni-app（小程序 + H5）。组件库以本规范 token 化 CSS 变量为基础皮肤层，三主题通过 `data-theme` 注入，保证一套组件三套皮肤、31 页视觉一致。
