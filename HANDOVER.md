# 项目交接文档 · HANDOVER

> 用途：给下一个对话窗口（或接手的人）无缝续接本项目用。
> 读完这一份，你应当能回答：这是什么、为什么这么设计、代码在哪、怎么跑、怎么改、坑在哪、下一步做什么。
> 最后更新：2026-07-13

---

## 0. 一句话概括

腾讯云 ToB 销售参加 hackathon（赛题方向三：面向个人销售/小团队的 AI 营销获客系统）。
作品是一个**可运行的纯前端 Web 销售获客工作台「腾讯云 · 销售获客工作台」**——本质是一个"人机协作式轻量 CRM"，核心卖点是**诚实**（AI 只做结构化/补全/建议，绝不编造客户数据）。

- **项目路径**：`/Users/jake/WorkBuddy/2026-07-08-11-34-28/ai-sales-copilot/`
- **在线预览（可分享给评委）**：https://4ac507c9c1cd4578873d069574f5b081.tc-nanjing.share.codebuddy.woa.com
- **本地预览**：`http://localhost:8899`（下方有启动命令）
- **技术栈**：纯前端 HTML + CSS + 原生 JS，无后端，数据存 localStorage。

---

## 1. 用户是谁 / 在意什么

- **身份**：腾讯云 ToB 销售。
- **原始素材**：一份《销售全流程.pdf》一线培训笔记，核心方法论——客户分级(S/A/B/C)、多点建联不押注单点、一切沟通为约见面、账单+组织架构分析、winback 降本增效。
- **反复强调的价值观**：**诚实**。第一版做了"假装能查一切"的 AI 被用户明确否掉（会穿帮）。此后所有版本都贯彻：**查不到就明说、识别不出就让人工确认、绝不编造**——这也是作品最大差异化。
- **风格提示**：用户说"我说的仅供参考不要完全一模一样照搬，要有你自己的思考"——即需要主动的工程判断，不要机械照搬。

---

## 2. 迭代历程（为什么现在长这样）

| 轮次 | 用户诉求 | 结果 |
|---|---|---|
| **R1** | 初版 AI 获客 Demo | 做了"假 AI"（假装全知全能）→ **被否**：不能真查就是假的、会穿帮 |
| **R2** | 要真 CRM、AI 只是辅助、要能人工更正、核心是获取销售的 context | 重构为"人机协作 CRM"：AI 抽取/补全/追问 + 人工校正 + 诚实降级 |
| **R3** | 等级要手动选+可筛选；决策链改成**对方组织架构树**；别满屏强调 AI；UI 丑；跟进记录才是大头要重点设计 | 跟进记录设为核心；手动 S/A/B/C 分级；树状组织架构（带联系方式）；去 AI 表演化；视觉重做 |
| **R4（最新）** | 加**材料上传**（照片/微信聊天/名片）；UI 别留白、填满、科技感、能切主题 | 新增"资料库"Tab；腾讯云蓝质感升级；**明暗双主题**；空状态改数据仪表盘；**部署上线拿分享链接** |

> 另外：R3 之后把方法论沉淀成了 WorkBuddy 专家助手「云销副驾」(`tencent-cloud-sales-copilot`)，已 register，在【专家中心-我的专家】可见。路径 `~/.workbuddy/plugins/marketplaces/my-experts/plugins/tencent-cloud-sales-copilot/`。

---

## 3. 代码结构（改代码前必读）

项目共 6 个文件，都在 `ai-sales-copilot/` 下：

| 文件 | 行数 | 职责 |
|---|---|---|
| `data.js` | ~205 | **数据层**：常量 + 种子数据。`STORAGE_KEY="tc_sales_crm_v4"`、`THEME_KEY="tc_sales_theme"`；`FIELD_DEFS`、`GRADES(S/A/B/C 含颜色)`、`CRM_STAGES`、`ORG_LEVELS`、`CONTACT_METHODS`、`SCRIPT_SCENES`、`ASSET_TYPES(名片/聊天记录/人员照片/其他附件)`、`SEED_CUSTOMERS(3个:星澜互娱S/闪购优选S/效率河马C，各带 assets:[])` |
| `crm.js` | ~204 | **引擎层**：`CRM`(load/save/reset)、`AIEngine`(extract 正则抽取 / missingFields 追问 / suggest 可解释评分 / webSearch 诚实降级 / **recognizeCard 名片诚实兜底**)、`AssetEngine`(FileReader→dataURL、canvas 压缩:长边≤1280/质量降到0.4/≤900KB、makeAsset)、工具函数(uid/esc/todayStr/methodMeta/gradeMeta 等) |
| `index.html` | ~304 | **结构层**：`<html data-theme="dark">`；顶栏(brand + `#topbarStats` 全局数据条 + `#themeSwitch` 主题开关)；侧栏(搜索+等级/阶段筛选+客户列表)；空状态仪表盘(`#emptyState`/hero-*)；工作区(客户头+等级下拉+阶段条+**6个Tab**)；modal/lightbox/toast 容器 |
| `app.js` | ~1256 | **逻辑层**：全部交互。DOM 用 `$("#id")` 选择器 helper。含 initTheme/toggleTheme、renderTopbarStats/renderHero、渲染各 Tab、CRUD、跟进记录+附件、组织架构树+节点照片、资料库全模块、名片识别诚实流程、lightbox 等 |
| `style.css` | ~854 | **样式层**：双主题 CSS 变量(`[data-theme=dark/light]`) + glass-card + 按钮系统 + 各模块。**⚠️ 注意后半段有一大块"对齐补全 CSS"**（见第 5 节坑点） |
| `演示脚本与作品说明.md` | ~7KB | 参赛演示剧本 + 作品说明(六大模块 + 界面升级 + 在线链接) |

**六大 Tab 顺序**：跟进记录(核心) → 组织架构 → 资料库(新) → 客户情报 → 话术辅助 → 复盘。另有独立的**数据看板**(dashboard) 和**明暗主题切换**。

---

## 最终界面与报告约定

- QQ penguin is the AI assistant identity and is excluded from business data and reports.
- UI follows TDesign/Tencent blue tokens.
- Reports dynamically omit empty sections and contain only customer facts, judgments, evidence, progress, and actions.
- Verification command is `node --test tests/ui-contract.test.mjs` plus JavaScript syntax checks.

## 4. 怎么跑 / 怎么验证

```bash
# 启动本地服务器（端口 8899）
lsof -ti:8899 | xargs kill -9 2>/dev/null
/Users/jake/.workbuddy/binaries/python/versions/3.13.12/bin/python3 -m http.server 8899 \
  --directory /Users/jake/WorkBuddy/2026-07-08-11-34-28/ai-sales-copilot
# 打开 http://localhost:8899

# JS 语法校验
NODE=/Users/jake/.workbuddy/binaries/node/versions/22.22.2/bin/node
cd /Users/jake/WorkBuddy/2026-07-08-11-34-28/ai-sales-copilot
for f in data.js crm.js app.js; do $NODE --check "$f" && echo "$f OK"; done

# 无头浏览器冒烟测试（确认 seed 渲染 + 无 JS 报错）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --disable-gpu --no-sandbox --virtual-time-budget=3000 --dump-dom \
  "http://localhost:8899/index.html" > /tmp/dom.html
grep -c 'cust-item' /tmp/dom.html   # 应为 3（3个种子客户）

# 截图（首屏）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --disable-gpu --no-sandbox --hide-scrollbars --window-size=1440,900 \
  --virtual-time-budget=2500 --screenshot=/tmp/shot.png "http://localhost:8899/index.html"
```

- **数据重置**：浏览器控制台执行 `CRM.reset()`（会清 localStorage 重载种子）。
- **切主题**：顶栏开关，或控制台 `localStorage.setItem("tc_sales_theme","light")` 后刷新。

---

## 5. ⚠️ 踩过的坑（必看，别重复踩）

1. **CSS 类名必须以 JS/HTML 实际 emit 的为准**。
   R4 重写 CSS 时凭记忆自创了一套类名（如 `gallery-grid`/`dz-ic`），但 app.js/index.html 实际输出的是 `assets-gallery`/`dz-icon`——导致大面积无样式。
   **修正方法**：写脚本提取 HTML/JS 里所有 `class` 与 CSS 已定义选择器做 **diff**，再补一大段"对齐补全 CSS"覆盖真实类名。所以 `style.css` 后半段有对齐补全区，**改样式前先 `grep` 真实类名，别凭记忆造名**。

2. **测浅色主题要在 data.js 前注入 localStorage**。
   `initTheme()` 会读 `localStorage(tc_sales_theme, 默认dark)` 并强制覆盖 `<html data-theme>`。所以直接改 HTML 的 `data-theme="light"` 会被覆盖回 dark。截图浅色主题时，须先 `localStorage.setItem("tc_sales_theme","light")` 再让 app.js 跑。

3. **纯前端无法可靠调真实 OCR / 工商 API**（CORS + 无 key + 演示翻车风险）。
   所以名片识别、客户情报联网查都走**诚实兜底**：识别/查不到就明说"当前为纯前端演示环境未接入授权源"，引导人工确认，**绝不编造**。若要真识别/真查，需**后端代理**持 key 调授权 API（天眼查/IT桔子/OCR）。

4. **大文件写入用分块**。一次性 Write 超大 CSS 会报 `content expected string but received undefined`——改用一次 Write 基础框架 + 多次 Edit/追加。

5. **图片存 localStorage 要压缩**。canvas 长边≤1280、JPEG 质量循环降到 0.4、单文件≤900KB；非图片只存元数据。否则 localStorage 容易爆。

---

## 6. 当前状态

- ✅ **全部完成并已上线**。三个 JS `node --check` 通过；无头 Chrome 冒烟测试无 JS 报错；深/浅两套主题均已截图确认。
- ✅ 已部署到云端沙箱，分享链接已验证 200 可访问。
- ✅ 演示脚本与作品说明.md 已更新到最新。
- 数据版本 **v4**；本地端口 **8899**；重置 `CRM.reset()`。

---

## 7. 下一步可做（待办 / 可扩展）

- **真实联网检索**：接后端代理调授权 API（天眼查/IT桔子做情报、OCR 做名片识别），无缝把"诚实兜底"升级成"真识别"。
- **提交物料**：把在线链接 + 深浅主题对比图整理成一页参赛说明；或录一段 GIF 演示（切主题 / 上传名片）。
- **数据导出/导入**：目前只存 localStorage，可加 JSON 导出备份。
- **移动端适配复查**：已有 media query，但小屏交互（拖拽上传、树状图）值得再过一遍。

---

## 8. 关键约定速查

- 涨红跌绿？——本项目非行情类，无此约束；但**等级色**遵循中式习惯（S/A 高优先级用红/橙强调）。
- 货币符号：¥。
- 所有 AI 产出必须**可解释 + 可人工覆盖 + 不编造**。
- 改代码顺序建议：data.js（常量/种子）→ crm.js（引擎）→ index.html（结构）→ app.js（逻辑）→ style.css（样式，最后且以真实类名为准）。
