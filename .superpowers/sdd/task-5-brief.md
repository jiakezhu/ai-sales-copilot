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

