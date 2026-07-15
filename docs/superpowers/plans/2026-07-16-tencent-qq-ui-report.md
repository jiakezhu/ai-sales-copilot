# Tencent QQ UI and Customer Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the sales copilot as a Tencent/TDesign-style professional workspace with the supplied QQ penguin as the restrained AI assistant, and generate content-only professional customer reports.

**Architecture:** Preserve the current static HTML/CSS/JavaScript application and its customer data model. Introduce one pure `report.js` module so report content can be tested independently, while `app.js` remains responsible for page rendering and interactions. Use a single design-token layer in `style.css`, one persistent QQ penguin image asset, and responsive component classes shared across desktop and mobile.

**Tech Stack:** HTML5, CSS custom properties, vanilla JavaScript, Lucide UMD icons, browser localStorage/CloudBase compatibility, Node.js built-in test runner.

## Global Constraints

- Use the user-provided Tencent QQ penguin image as the only mascot reference; do not redraw or generate a substitute penguin.
- Use TDesign brand tokens with `#0052D9` as the main action color and `#366EF4` for hover/emphasis.
- Show the penguin only in the product brand, AI input, AI feedback, empty states, onboarding, and lightweight success feedback.
- Never show the penguin inside customer tables, business metrics, or the exported customer report.
- Keep the existing customer, note, task, relationship, intelligence, and CloudBase-compatible data structures.
- Reports must omit product promotion, generation explanations, empty fields, empty sections, repeated data, decorative footers, and mascot imagery.
- Desktop and 390px mobile layouts must preserve the same information priority.
- Do not add unrelated business features or a new framework.

---

## File Structure

- Create `assets/qq-penguin-reference.png`: exact user-supplied QQ penguin screenshot used through a cropped image wrapper.
- Create `report.js`: pure report HTML builder and Word document wrapper, exposed as `window.ReportBuilder` and `module.exports` for Node tests.
- Create `tests/ui-contract.test.mjs`: static UI, mascot-boundary, responsive, and report-content contracts.
- Modify `index.html`: Tencent-style shell, QQ penguin brand/AI entry hooks, report preview shell, and `report.js` loading.
- Modify `style.css`: TDesign tokens, shell, page components, mascot crop, report, print, and mobile layout.
- Modify `app.js`: Today/customer/task/analysis markup, AI mascot states, report integration, and UI copy.
- Modify `README.md` and `HANDOVER.md`: final visual system, mascot boundaries, and report behavior.

### Task 1: Design tokens, QQ penguin asset, and application shell

**Files:**
- Create: `assets/qq-penguin-reference.png`
- Create: `tests/ui-contract.test.mjs`
- Modify: `index.html:1-73`
- Modify: `style.css:1-100`

**Interfaces:**
- Consumes: supplied image `/var/folders/44/642spf6x72v4vrwcs6nj54nw0000gn/T/codex-clipboard-6313586b-29f5-4bb7-a18b-496935a94faf.png`
- Produces: `.qq-penguin`, `.app-shell`, `.side-nav`, `.topbar`, and TDesign token variables used by all later tasks.

- [ ] **Step 1: Write the failing shell contract test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Tencent shell uses the supplied QQ penguin and TDesign tokens", () => {
  const html = read("index.html");
  const css = read("style.css");
  assert.equal(existsSync(new URL("../assets/qq-penguin-reference.png", import.meta.url)), true);
  assert.match(html, /assets\/qq-penguin-reference\.png/);
  assert.match(html, /class="qq-penguin/);
  assert.match(css, /--td-brand-color:\s*#0052d9/i);
  assert.match(css, /--td-brand-color-hover:\s*#366ef4/i);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/ui-contract.test.mjs`  
Expected: FAIL because the asset and TDesign tokens do not exist.

- [ ] **Step 3: Add the exact image asset and shell markup**

Copy the supplied binary without redrawing it:

```bash
mkdir -p assets
cp /var/folders/44/642spf6x72v4vrwcs6nj54nw0000gn/T/codex-clipboard-6313586b-29f5-4bb7-a18b-496935a94faf.png assets/qq-penguin-reference.png
```

Replace the brand mark in `index.html` with the crop wrapper, and use the same element in the mobile brand:

```html
<span class="qq-penguin qq-penguin--brand" aria-hidden="true">
  <img src="assets/qq-penguin-reference.png" alt="" />
</span>
```

Load the pure report builder before `app.js`:

```html
<script src="report.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 4: Replace the root style tokens and mascot crop**

```css
:root {
  --td-brand-color: #0052d9;
  --td-brand-color-hover: #366ef4;
  --td-brand-color-active: #003cab;
  --td-brand-color-light: #f2f3ff;
  --td-bg-page: #f3f6f9;
  --td-bg-container: #ffffff;
  --td-bg-secondary: #f5f7fa;
  --td-text-primary: rgba(0, 0, 0, .9);
  --td-text-secondary: rgba(0, 0, 0, .6);
  --td-text-placeholder: rgba(0, 0, 0, .4);
  --td-border: #dcdfe6;
  --td-success: #00a870;
  --td-warning: #ed7b2f;
  --td-error: #d54941;
  --td-radius: 6px;
  --td-radius-lg: 10px;
  --td-shadow-1: 0 1px 4px rgba(0, 0, 0, .08);
  --font: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.qq-penguin {
  position: relative;
  display: inline-block;
  overflow: hidden;
  flex: none;
  background: #fff;
}
.qq-penguin img {
  position: absolute;
  width: 98px;
  height: 124px;
  left: -15px;
  top: -22px;
  max-width: none;
}
.qq-penguin--brand { width: 46px; height: 46px; border-radius: 12px; }
```

- [ ] **Step 5: Run the shell contract and syntax checks**

Run: `node --test tests/ui-contract.test.mjs && node --check app.js`  
Expected: PASS.

- [ ] **Step 6: Commit the shell foundation**

```bash
git add assets/qq-penguin-reference.png tests/ui-contract.test.mjs index.html style.css
git commit -m "feat: add Tencent QQ visual foundation"
```

### Task 2: Rebuild the Today page around AI and next actions

**Files:**
- Modify: `tests/ui-contract.test.mjs`
- Modify: `app.js:180-270`
- Modify: `style.css:100-165`

**Interfaces:**
- Consumes: `.qq-penguin`, TDesign tokens, `getTasks()`, `renderPriorityTask()`, and `renderAccountPulse()`.
- Produces: `.today-command`, `.ai-assistant-card`, `.today-action-list`, and `.account-signal-list`.

- [ ] **Step 1: Add the failing Today-page contract**

```js
test("Today page is ordered as AI, actions, then customer signals", () => {
  const js = read("app.js");
  const ai = js.indexOf('class="ai-assistant-card"');
  const actions = js.indexOf('class="today-action-list"');
  const signals = js.indexOf('class="account-signal-list"');
  assert.ok(ai > 0 && actions > ai && signals > actions);
  assert.match(js, /告诉小企刚刚发生了什么/);
  assert.doesNotMatch(js, /class="metric-strip"/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/ui-contract.test.mjs`  
Expected: FAIL because the old metric-first layout remains.

- [ ] **Step 3: Replace `renderToday()` with the approved hierarchy**

Use this top-level structure while reusing existing task and customer render helpers:

```js
return `<div class="page today-page">
  <header class="today-command">
    <div><p class="eyebrow">${formatLongDate(new Date())}</p><h1>早上好，先推进最重要的客户</h1><p>小企会整理信息，你负责确认和决策。</p></div>
    <button class="td-button td-button--outline" data-action="manual-entry">${icon("square-pen")} 手动记录</button>
  </header>
  <section class="ai-assistant-card" id="copilotCard">
    <span class="qq-penguin qq-penguin--assistant" aria-hidden="true"><img src="assets/qq-penguin-reference.png" alt="" /></span>
    <div class="ai-assistant-copy"><span>QQ 企鹅 AI 助手</span><h2>告诉小企刚刚发生了什么</h2><p>会议、电话、微信和材料都能整理为客户推进记录。</p></div>
    <div class="ai-compose">${renderCopilotComposer()}</div>
    <div id="aiDraft"></div>
  </section>
  <div class="today-layout">
    <section class="td-panel today-action-list">${renderTodayActions(priority, overdue)}</section>
    <aside class="td-panel account-signal-list">${renderCustomerSignals(stale)}</aside>
  </div>
</div>`;
```

Define `renderCopilotComposer()`, `renderTodayActions()` and `renderCustomerSignals()` immediately below `renderToday()`; each returns only the markup it owns and calls existing row helpers.

- [ ] **Step 4: Add TDesign-style Today layout CSS**

```css
.today-command{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:20px}
.ai-assistant-card{position:relative;padding:24px 24px 22px 96px;border:1px solid #b5c7ff;border-radius:var(--td-radius-lg);background:linear-gradient(100deg,#edf3ff 0,#fff 72%);box-shadow:var(--td-shadow-1)}
.qq-penguin--assistant{position:absolute;left:24px;top:26px;width:54px;height:54px;border-radius:14px}
.ai-assistant-copy>span{color:var(--td-brand-color);font-size:12px;font-weight:700}.ai-assistant-copy h2{margin:4px 0}.ai-assistant-copy p{color:var(--td-text-secondary)}
.today-layout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(300px,.72fr);gap:16px;margin-top:16px}
.td-panel{border:1px solid var(--td-border);border-radius:var(--td-radius-lg);background:var(--td-bg-container);box-shadow:var(--td-shadow-1)}
```

- [ ] **Step 5: Run tests and syntax checks**

Run: `node --test tests/ui-contract.test.mjs && node --check app.js`  
Expected: PASS.

- [ ] **Step 6: Commit the Today page**

```bash
git add tests/ui-contract.test.mjs app.js style.css
git commit -m "feat: rebuild Today around AI and actions"
```

### Task 3: Refine customers, detail views, tasks, and analytics

**Files:**
- Modify: `tests/ui-contract.test.mjs`
- Modify: `app.js:270-515`
- Modify: `style.css:165-212`

**Interfaces:**
- Consumes: existing customer data, `renderChoiceControl()`, `renderTimeline()`, `renderRelations()`, and `renderIntelligence()`.
- Produces: `.customer-worktable`, `.customer-summary-header`, `.detail-section-nav`, `.task-worktable`, and `.analytics-workspace`.

- [ ] **Step 1: Add failing customer workspace contracts**

```js
test("business views use professional workspace classes without mascot imagery", () => {
  const js = read("app.js");
  assert.match(js, /customer-worktable/);
  assert.match(js, /customer-summary-header/);
  assert.match(js, /detail-section-nav/);
  assert.match(js, /task-worktable/);
  assert.match(js, /analytics-workspace/);
  const businessStart = js.indexOf("function renderCustomers");
  const aiStart = js.indexOf("function focusCopilot");
  assert.doesNotMatch(js.slice(businessStart, aiStart), /qq-penguin/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/ui-contract.test.mjs`  
Expected: FAIL because the approved workspace classes are absent.

- [ ] **Step 3: Update the customer list and customer detail markup**

Use these outer contracts and keep the existing row contents and actions:

```js
<section class="td-panel customer-worktable">...</section>
<header class="customer-summary-header">...</header>
<nav class="detail-section-nav" aria-label="客户档案分区">...</nav>
```

Move secondary row actions into `.row-more-actions`, keep “生成报告” visible, and retain “推进记录” as the second detail tab. Replace decorative arrows and plus signs with Lucide icons.

- [ ] **Step 4: Update task and analytics outer markup**

```js
<section class="td-panel task-worktable">...</section>
<div class="analytics-workspace">...</div>
```

Keep only actionable analytics: stage distribution, stalled priority customers, and grade structure. Do not add decorative charts or mascot elements.

- [ ] **Step 5: Add shared professional table and detail CSS**

```css
.customer-worktable,.task-worktable{overflow:hidden;padding:0}
.table-head{background:var(--td-bg-secondary);color:var(--td-text-secondary);font-size:12px}
.customer-row,.task-row{border-bottom:1px solid #edf0f2;transition:background .15s}.customer-row:hover,.task-row:hover{background:#f5f8ff}
.customer-summary-header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:16px}
.detail-section-nav{position:sticky;top:64px;z-index:20;display:flex;gap:24px;border-bottom:1px solid var(--td-border);background:var(--td-bg-page)}
.detail-section-nav button.active{color:var(--td-brand-color);border-bottom:2px solid var(--td-brand-color)}
.analytics-workspace{display:grid;grid-template-columns:1.25fr .75fr;gap:16px}
```

- [ ] **Step 6: Run tests and commit**

Run: `node --test tests/ui-contract.test.mjs && node --check app.js`  
Expected: PASS.

```bash
git add tests/ui-contract.test.mjs app.js style.css
git commit -m "feat: refine customer and action workspaces"
```

### Task 4: Give the QQ penguin controlled AI states

**Files:**
- Modify: `tests/ui-contract.test.mjs`
- Modify: `app.js:500-680`
- Modify: `style.css:100-165,212-235`

**Interfaces:**
- Consumes: `.qq-penguin`, `state.recording`, `state.aiDraft`, `toast()`, and existing modal workflows.
- Produces: `setAssistantState(state)`, `.assistant-listening`, `.assistant-reviewing`, and `.assistant-success`.

- [ ] **Step 1: Add failing mascot-boundary and AI-state tests**

```js
test("QQ penguin is controlled by explicit assistant states", () => {
  const js = read("app.js");
  assert.match(js, /function setAssistantState\(assistantState\)/);
  assert.match(js, /setAssistantState\("listening"\)/);
  assert.match(js, /setAssistantState\("reviewing"\)/);
  assert.match(js, /setAssistantState\("success"\)/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/ui-contract.test.mjs`  
Expected: FAIL because no assistant-state helper exists.

- [ ] **Step 3: Implement state changes without redrawing the mascot**

```js
function setAssistantState(assistantState) {
  const card = $("#copilotCard");
  if (!card) return;
  card.classList.remove("assistant-listening", "assistant-reviewing", "assistant-success");
  if (assistantState !== "idle") card.classList.add(`assistant-${assistantState}`);
}
```

Call `setAssistantState("listening")` when speech recognition begins, `setAssistantState("idle")` when it ends, `setAssistantState("reviewing")` after AI candidates render, and `setAssistantState("success")` after confirmed persistence. Reset success to idle after 1200ms.

- [ ] **Step 4: Add restrained state motion**

```css
.assistant-listening .qq-penguin--assistant{animation:assistantBreath 1.2s ease-in-out infinite}
.assistant-reviewing .ai-assistant-card{border-color:var(--td-brand-color-hover)}
.assistant-success .ai-assistant-card{border-color:var(--td-success);background:linear-gradient(100deg,#e8f8f2,#fff 72%)}
@keyframes assistantBreath{50%{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,82,217,.2)}}
@media(prefers-reduced-motion:reduce){.assistant-listening .qq-penguin--assistant{animation:none}}
```

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/ui-contract.test.mjs && node --check app.js`  
Expected: PASS.

```bash
git add tests/ui-contract.test.mjs app.js style.css
git commit -m "feat: add restrained QQ assistant states"
```

### Task 5: Extract and test a content-only report builder

**Files:**
- Create: `report.js`
- Modify: `tests/ui-contract.test.mjs`
- Modify: `index.html:65-72`
- Modify: `app.js:690-740`

**Interfaces:**
- Consumes: normalized customer object plus `{ fieldDefs, stages, methods, assetTypes, formatDateTime, formatShortDate, reportDate }`.
- Produces: `ReportBuilder.build(customer, context): string` and `ReportBuilder.wrapWord(html): string`.

- [ ] **Step 1: Add failing report-content tests**

```js
import ReportBuilder from "../report.js";

test("report omits empty sections and all product-generation copy", () => {
  const customer = {
    name: "星澜互娱", grade: "A", stage: "proposal",
    fields: { industry: { v: "游戏" }, relation: { v: "技术负责人支持" } },
    painPoints: [{ v: "海外延迟" }], solution: [], orgChain: [], assets: [],
    notes: [{ method: "phone", date: "2026-07-16 10:00", contact: "王工", content: "确认海外延迟是核心顾虑", next: "发送对比方案", nextDate: "2026-07-18", taskDone: false }],
    stageHistory: [], raidFile: {}
  };
  const html = ReportBuilder.build(customer, {
    fieldDefs: [{ key: "industry", label: "行业", public: true }, { key: "relation", label: "客户关系", public: false }],
    stages: [{ key: "proposal", label: "方案中" }], methods: [{ key: "phone", label: "电话" }], assetTypes: [],
    formatDateTime: value => value, formatShortDate: value => value, reportDate: "2026年7月16日"
  });
  assert.match(html, /星澜互娱/);
  assert.match(html, /执行摘要/);
  assert.match(html, /全流程客户推进记录/);
  assert.doesNotMatch(html, /云销副驾|AI 生成|实时汇总|未填写|暂无内容|企鹅/);
  assert.doesNotMatch(html, /关键关系与组织架构|材料与证据索引/);
});
```

- [ ] **Step 2: Run the report test and verify it fails**

Run: `node --test tests/ui-contract.test.mjs`  
Expected: FAIL because `report.js` does not exist.

- [ ] **Step 3: Implement `report.js` as a pure UMD-style module**

```js
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReportBuilder = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const escape = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" })[char]);
  const present = value => String(value ?? "").trim();
  const section = (title, body, className = "") => body ? `<section class="report-section ${className}"><h2>${escape(title)}</h2>${body}</section>` : "";
  const fields = entries => entries.length ? `<div class="report-field-grid">${entries.map(([label,value]) => `<div><span>${escape(label)}</span><p>${escape(value)}</p></div>`).join("")}</div>` : "";
  const list = items => items.filter(present).length ? `<ul>${items.filter(present).map(item => `<li>${escape(item)}</li>`).join("")}</ul>` : "";

  function build(customer, context) {
    const stage = context.stages.find(item => item.key === customer.stage)?.label || customer.stage;
    const openNotes = [...(customer.notes || [])].sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const next = openNotes.find(note => present(note.next) && !note.taskDone);
    const raid = customer.raidFile || {};
    const executive = fields([
      ["当前判断", customer.fields?.relation?.v],
      ["核心机会", customer.painPoints?.[0]?.v],
      ["主要风险", raid.plan?.support],
      ["下一步行动", next?.next || raid.plan?.action]
    ].filter(([,value]) => present(value)));
    const basics = fields(context.fieldDefs.filter(def => def.public).map(def => [def.label, customer.fields?.[def.key]?.v]).filter(([,value]) => present(value)));
    const intelligence = fields(context.fieldDefs.filter(def => !def.public).map(def => [def.label, customer.fields?.[def.key]?.v]).filter(([,value]) => present(value)));
    const relations = customer.orgChain?.length ? `<table><thead><tr><th>姓名</th><th>职位</th><th>联系方式</th><th>关系判断</th></tr></thead><tbody>${customer.orgChain.map(person => `<tr><td>${escape(person.name)}</td><td>${escape(person.role)}</td><td>${escape([person.phone,person.wechat,person.email].filter(present).join(" · "))}</td><td>${escape(person.note)}</td></tr>`).join("")}</tbody></table>` : "";
    const market = list([...(customer.painPoints || []).map(item => item.v), ...(raid.competitors || []).map(item => `${item.name}：${item.coverage}；优势 ${item.pros}；劣势 ${item.cons}`), ...(customer.solution || []).map(item => `${item.product}：${item.reason}`)]);
    const progress = openNotes.length ? `<div class="report-progress">${openNotes.map(note => `<article><time>${escape(context.formatDateTime(note.date))}</time><div><b>${escape(context.methods.find(item => item.key === note.method)?.label || note.method)}${note.contact ? ` · ${escape(note.contact)}` : ""}</b><p>${escape(note.content)}</p>${note.next ? `<small>${note.taskDone ? "已完成" : "下一步"}：${escape(note.next)}${note.nextDate ? ` · ${escape(context.formatShortDate(note.nextDate))}` : ""}</small>` : ""}</div></article>`).join("")}</div>` : "";
    const execution = list([
      ...(customer.stageHistory || []).map(item => `${context.formatDateTime(item.date)} · ${context.stages.find(stageItem => stageItem.key === item.stage)?.label || item.stage}${item.note ? ` · ${item.note}` : ""}`),
      ...openNotes.filter(note => present(note.next) && !note.taskDone).map(note => `${context.formatShortDate(note.nextDate)} · ${note.next}`),
      raid.goals?.g1 && `3 个月目标：${raid.goals.g1}`,
      raid.goals?.g2 && `6 个月目标：${raid.goals.g2}`,
      raid.goals?.g3 && `长期布局：${raid.goals.g3}`,
      raid.plan?.action && `攻坚动作：${raid.plan.action}`,
      raid.plan?.support && `需要支持：${raid.plan.support}`
    ]);
    const evidence = customer.assets?.length ? `<table><thead><tr><th>材料</th><th>说明</th><th>时间</th></tr></thead><tbody>${customer.assets.map(asset => `<tr><td>${escape(asset.name)}</td><td>${escape(asset.caption)}</td><td>${escape(context.formatDateTime(asset.createdAt))}</td></tr>`).join("")}</tbody></table>` : "";
    return `<header class="report-heading"><p>客户全景报告</p><h1>${escape(customer.name)}</h1><div><span>${escape(stage)}</span><span>${escape(customer.grade)} 级客户</span><span>${escape(context.reportDate)}</span></div></header>${section("执行摘要",executive,"report-executive")}${section("客户基本面",basics)}${section("一线情报",intelligence)}${section("关键关系与组织架构",relations)}${section("痛点、竞争态势与匹配方案",market)}${section("全流程客户推进记录",progress,"page-break")}${section("当前待办、阶段历史与攻坚计划",execution)}${section("材料与证据索引",evidence)}`;
  }

  function wrapWord(html) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
  }
  return { build, wrapWord };
});
```

- [ ] **Step 4: Integrate the builder in `app.js`**

Replace `buildReport(customer)` with a context adapter:

```js
function buildReport(customer) {
  return ReportBuilder.build(customer, {
    fieldDefs: FIELD_DEFS,
    stages: CRM_STAGES,
    methods: CONTACT_METHODS,
    assetTypes: ASSET_TYPES,
    formatDateTime,
    formatShortDate,
    reportDate: formatLongDate(new Date())
  });
}
```

Use `ReportBuilder.wrapWord($("#reportDocument").innerHTML)` in `exportWordReport()`.

- [ ] **Step 5: Run report and syntax tests**

Run: `node --test tests/ui-contract.test.mjs && node --check report.js && node --check app.js`  
Expected: PASS.

- [ ] **Step 6: Commit the content-only report engine**

```bash
git add report.js tests/ui-contract.test.mjs index.html app.js
git commit -m "feat: generate content-only customer reports"
```

### Task 6: Apply professional report, Word, and print styling

**Files:**
- Modify: `tests/ui-contract.test.mjs`
- Modify: `style.css:212-235`
- Modify: `app.js:690-740`

**Interfaces:**
- Consumes: report markup from `ReportBuilder.build()`.
- Produces: consistent `.report-heading`, `.report-section`, `.report-field-grid`, `.report-progress`, screen preview, A4 print, and Word styles.

- [ ] **Step 1: Add failing report-style contracts**

```js
test("report styles are content-first and printable", () => {
  const css = read("style.css");
  assert.match(css, /\.report-heading/);
  assert.match(css, /\.report-field-grid/);
  assert.match(css, /@page\s*\{\s*size:\s*A4/);
  assert.doesNotMatch(css, /\.report-brand|\.report-footer/);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test tests/ui-contract.test.mjs`  
Expected: FAIL because legacy cover/brand/footer styles remain.

- [ ] **Step 3: Replace legacy report styles**

```css
.report-document{width:min(860px,calc(100% - 32px));margin:24px auto 60px;padding:54px 62px;color:#172b4d;background:#fff;box-shadow:0 12px 36px rgba(32,46,66,.12)}
.report-heading{padding-bottom:24px;border-bottom:3px solid var(--td-brand-color)}
.report-heading>p{color:var(--td-brand-color);font-size:12px;font-weight:700;letter-spacing:.08em}.report-heading h1{margin:8px 0 16px;font:700 34px/1.2 "Songti SC","Microsoft YaHei",serif}.report-heading>div{display:flex;gap:8px;flex-wrap:wrap}.report-heading span{padding:5px 8px;background:#f2f3f5;font-size:11px}
.report-section{margin-top:34px}.report-section h2{margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #dfe3e8;font-size:18px}
.report-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.report-field-grid>div{padding:12px;border-left:3px solid #d9e1ff;background:#f7f9fc}.report-field-grid span{color:#66717d;font-size:10px}.report-field-grid p{margin-top:5px;font-size:12px;line-height:1.6}
.report-progress article{display:grid;grid-template-columns:112px 1fr;gap:18px;padding:12px 0;border-bottom:1px solid #edf0f2}.report-progress time{color:#7a8491;font-size:10px}.report-progress p{margin:4px 0;font-size:11px;line-height:1.6}.report-progress small{color:var(--td-brand-color)}
.report-document table{width:100%;border-collapse:collapse;font-size:11px}.report-document th,.report-document td{padding:9px;border:1px solid #dfe3e8;text-align:left;vertical-align:top}.report-document th{background:#f3f6f9}
@media print{@page{size:A4;margin:14mm}.report-document{width:100%;margin:0;padding:0;box-shadow:none}.report-section{break-inside:avoid}.page-break{break-before:page}}
```

- [ ] **Step 4: Make Word styling match the same hierarchy**

Pass the following CSS into `ReportBuilder.wrapWord(html, styles)` and update `wrapWord` to emit it inside the document `<head>`:

```js
const WORD_REPORT_STYLES = `
  body{margin:36px;font-family:Arial,'Microsoft YaHei',sans-serif;color:#172b4d;line-height:1.6}
  .report-heading{padding-bottom:20px;border-bottom:3px solid #0052d9}
  .report-heading>p{color:#0052d9;font-size:12px;font-weight:700}.report-heading h1{margin:8px 0 14px;font-size:32px}.report-heading span{margin-right:6px;padding:5px 8px;background:#f2f3f5;font-size:11px}
  .report-section{margin-top:30px}.report-section h2{padding-bottom:8px;border-bottom:1px solid #dfe3e8;font-size:18px}
  .report-field-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.report-field-grid>div{padding:12px;border-left:3px solid #d9e1ff;background:#f7f9fc}
  table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #dfe3e8;text-align:left;vertical-align:top}th{background:#f3f6f9}
  .report-progress article{padding:10px 0;border-bottom:1px solid #edf0f2}.report-progress time{color:#7a8491;font-size:11px}.report-progress small{color:#0052d9}
`;
const doc = ReportBuilder.wrapWord($("#reportDocument").innerHTML, WORD_REPORT_STYLES);
```

Update the builder signature exactly:

```js
function wrapWord(html, styles) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${styles}</style></head><body>${html}</body></html>`;
}
```

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/ui-contract.test.mjs && node --check app.js && git diff --check`  
Expected: PASS.

```bash
git add tests/ui-contract.test.mjs style.css app.js
git commit -m "feat: polish report preview and exports"
```

### Task 7: Complete mobile behavior, accessibility, and documentation

**Files:**
- Modify: `tests/ui-contract.test.mjs`
- Modify: `style.css`
- Modify: `index.html`
- Modify: `README.md`
- Modify: `HANDOVER.md`

**Interfaces:**
- Consumes: all UI and report classes from Tasks 1-6.
- Produces: final 390px layout, reduced-motion behavior, accessible labels, and handoff documentation.

- [ ] **Step 1: Add failing responsive and boundary contracts**

```js
test("mobile and mascot boundaries are explicit", () => {
  const css = read("style.css");
  const js = read("app.js");
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(js.slice(js.indexOf("function buildReport"), js.indexOf("function exportWordReport")), /qq-penguin|企鹅|assets\//);
});
```

- [ ] **Step 2: Run the test and verify it fails if any boundary is missing**

Run: `node --test tests/ui-contract.test.mjs`  
Expected: FAIL until all responsive and mascot boundaries are present.

- [ ] **Step 3: Add final responsive rules**

```css
@media(max-width:900px){.side-nav{display:none}.app-main{margin-left:0}.mobile-nav{display:grid}.today-layout,.analytics-workspace{grid-template-columns:1fr}.ai-assistant-card{padding:20px 18px 18px 82px}.qq-penguin--assistant{left:18px;top:20px}}
@media(max-width:680px){.page{padding:20px 14px 88px}.today-command{align-items:flex-start}.today-command .td-button--outline{display:none}.ai-assistant-card{padding:78px 14px 14px}.qq-penguin--assistant{left:14px;top:14px}.customer-worktable .table-head{display:none}.customer-row{display:grid;grid-template-columns:1fr auto}.report-document{width:100%;margin:0;padding:28px 18px}.report-field-grid{grid-template-columns:1fr}.report-progress article{grid-template-columns:1fr;gap:4px}}
```

- [ ] **Step 4: Update documentation with final behavior**

Add these exact points to both handoff documents:

- QQ penguin is the AI assistant identity and is excluded from business data and reports.
- UI follows TDesign/Tencent blue tokens.
- Reports dynamically omit empty sections and contain only customer facts, judgments, evidence, progress, and actions.
- Verification command is `node --test tests/ui-contract.test.mjs` plus JavaScript syntax checks.

- [ ] **Step 5: Run the complete verification suite**

Run:

```bash
node --test tests/ui-contract.test.mjs
node --check app.js
node --check report.js
node --check data.js
node --check crm.js
git diff --check
```

Expected: all Node tests PASS, all syntax checks exit 0, and `git diff --check` prints no errors.

- [ ] **Step 6: Commit the responsive and documentation finish**

```bash
git add tests/ui-contract.test.mjs style.css index.html README.md HANDOVER.md
git commit -m "feat: finish Tencent QQ responsive experience"
```

## Final Acceptance Checklist

- [ ] The exact supplied QQ penguin is visible in product brand and AI assistant states.
- [ ] No approximate or generated penguin artwork exists.
- [ ] Today prioritizes AI capture, next actions, and customer signals in that order.
- [ ] Customer, task, and analytics views use a consistent TDesign-style professional workspace.
- [ ] Desktop and 390px mobile layouts remain usable without overflow.
- [ ] AI text, voice fallback, manual entry, confirmation, and persistence continue to work.
- [ ] Customer detail tabs, stage/grade controls, timeline, relationships, and evidence remain functional.
- [ ] Report HTML, PDF, and Word exclude empty content, product explanations, mascot imagery, and decorative footers.
- [ ] All automated contracts and JavaScript syntax checks pass.
