# 高保真出图规范（所有页面必须遵守）

## 通用规则
1. **单文件自包含 HTML**，浏览器可直接打开。把 `design/_kit/kit.css` 的**全部内容内联**进页面 `<style>`，再写本页特有样式。
2. **第一行必须正好是**：`<!-- @dsCard group="<分组>" -->`，分组取值：`station-web` / `admin-web` / `user-app`。
3. 字体引入：`<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`
4. **全屏平铺**：后台页面用 `.app`（`grid 248px 1fr`）+ `.side` + `.main`，内容铺满，不要居中固定宽容器。
5. 图标一律内联 SVG（Lucide 线性风格），**禁止 emoji 当图标**。
6. 所有可点元素 `cursor:pointer`；hover 只用颜色/阴影过渡（kit 已配），禁止位移跳动。
7. 数字加 `.tnum` 或 `font-variant-numeric:tabular-nums`；正文不要用浅灰，状态色语义清晰（在库=blue/已取=green/滞留=red/异常=amber）。
8. 用 kit 已有组件类（`.btn` `.input` `.card` `.kpi` `.table-card` `.tag` `.tabs` `.pager` `.modal` `.drawer` 等），保证三十个页面一致。
9. 数据用真实感中文示例（≥8 行列表数据）。脱敏：收件人「王**」、手机尾号 4 位。

## 品牌与上下文
- 品牌「驿小站」，当前门店「城南综合驿站」(编号 CN-0731)，当前用户「店长」。
- 日期统一「2026年6月18日 周四 · 营业中」。

## station-web 应用外壳（侧栏 + 顶栏）
侧栏 `.nav`（把当前页对应项加 `class="on"`）：
- 顶部 `.brand`：logo + 驿小站 / 城南综合驿站
- 分组「代收业务」：工作台、扫码入库、在库包裹、取件核销、异常件(badge 7)
- 分组「网点管理」：货架库位、寄件管理、经营统计、员工权限、门店设置
- 底部 `.side-foot`：城南综合驿站 · 门店编号 CN-0731（门店切换）
顶栏 `.top`：左 = 页面 `h1` + `.sub`；右 `.top-r` = `.search`(取件码/手机号/运单号) + `.ibtn`(通知带红点) + `.avatar`(店 / 店长)。

## admin-web 应用外壳
侧栏 `.brand`：菜鸟驿站 · 平台运营后台。
- 分组「运营」：平台总览、租户管理、入驻审核、门店监控
- 分组「商业化」：订阅与账单、套餐配置
- 分组「系统」：平台用户、角色权限、系统配置、操作审计
顶栏右侧用户「平台 / 运营管理员」。配色同 kit（清爽蓝）。

## user-app（移动端小程序）特殊说明
- **不是** `.app` 后台布局。用**移动端竖屏**：固定宽 `body{width:390px}`，顶部状态栏 + 标题栏，底部 `tabbar`（首页/寄件/消息/我的）。
- 复用 kit 的 token 配色（清爽蓝）、`.tag`、`.btn`、卡片圆角，但按移动端尺寸排版（大圆角、卡片化、44px 触控）。
- 第一行 `<!-- @dsCard group="user-app" -->`。
