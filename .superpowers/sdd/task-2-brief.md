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

