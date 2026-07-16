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

