import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ReportBuilder from "../report.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readBinary = path => readFileSync(new URL(`../${path}`, import.meta.url));

function loadWorkspaceTestApi(openMenus = []) {
  const sandbox = {
    console,
    document: {
      activeElement: null,
      documentElement: { dataset: { theme: "light" } },
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll(selector) { return selector === ".row-more-actions[open]" ? openMenus : []; },
    },
    localStorage: { setItem() {} },
    THEME_KEY: "theme",
  };
  vm.runInNewContext(`${read("app.js")}\n;globalThis.__workspaceTestApi = { closeRowMenus, prepareRowMenusForAction, handleAction, getStalledPriorityCustomers };`, sandbox);
  return { api: sandbox.__workspaceTestApi, sandbox };
}

function loadAssistantStateTestApi(card, timers, options = {}) {
  let currentCard = card;
  const sandbox = {
    console,
    document: {
      addEventListener() {},
      querySelector(selector) {
        if (selector === "#copilotCard") return currentCard;
        if (selector === "#copilotInput") return options.input || null;
        if (selector === "#aiDraft") return options.draftHost || null;
        return null;
      },
      querySelectorAll() { return []; },
    },
    window: { SpeechRecognition: options.Recognition },
    FIELD_DEFS: [],
    CONTACT_METHODS: [{ key: "phone", label: "电话", icon: "phone" }],
    methodMeta: () => ({ label: "电话", icon: "phone" }),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  };
  vm.runInNewContext(`${read("app.js")}\n;globalThis.__assistantStateTestApi = { state, setAssistantState, reconcileAssistantState, startVoiceCapture, handleChange };`, sandbox);
  sandbox.__assistantStateTestApi.replaceCard = nextCard => { currentCard = nextCard; };
  return sandbox.__assistantStateTestApi;
}

test("Tencent shell uses the supplied QQ penguin and TDesign tokens", () => {
  const html = read("index.html");
  const css = read("style.css");
  assert.match(css, /--td-brand-color:\s*#0052d9/i);
  assert.match(css, /--td-brand-color-hover:\s*#366ef4/i);
  assert.match(css, /--blue:\s*var\(--td-brand-color\)/i);
  assert.match(css, /--blue-strong:\s*var\(--td-brand-color-active\)/i);
  assert.match(css, /--blue-soft:\s*var\(--td-brand-color-light\)/i);
  assert.match(css, /\.mobile-capture\{[^}]*background:linear-gradient\(145deg,var\(--td-brand-color-hover\),var\(--td-brand-color\)\)/i);
  assert.match(html, /<script\s+src="report\.js"/i);
});

test("QQ penguin asset is byte-for-byte the approved reference", () => {
  const digest = createHash("sha256")
    .update(readBinary("assets/qq-penguin-reference.png"))
    .digest("hex");

  assert.equal(digest, "5eda8ddce51aa85a0fe6688563868229656fcd27b7f9fde27ac59857ccc87f7e");
});

test("desktop and mobile brands both use the approved decorative mascot", () => {
  const html = read("index.html");
  const desktopBrand = html.match(/<button class="brand"[\s\S]*?<\/button>/)?.[0] || "";
  const mobileBrand = html.match(/<button class="mobile-brand"[\s\S]*?<\/button>/)?.[0] || "";
  const mascot = /<span class="qq-penguin qq-penguin--brand" aria-hidden="true">\s*<img src="assets\/qq-penguin-reference\.png" alt="" \/>\s*<\/span>/;

  assert.match(desktopBrand, mascot);
  assert.match(mobileBrand, mascot);
  assert.equal((html.match(/assets\/qq-penguin-reference\.png/g) || []).length, 2);
});

test("application shell preserves every runtime hook consumed by app.js", () => {
  const html = read("index.html");
  const runtimeHooks = [
    "globalSearch",
    "pageRoot",
    "modalLayer",
    "modalPanel",
    "reportLayer",
    "reportDocument",
    "reportStatus",
    "toast",
    "themeToggle"
  ];

  for (const id of runtimeHooks) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing runtime hook #${id}`);
  }
});

test("Today page is ordered as AI, actions, then customer signals", () => {
  const js = read("app.js");
  const ai = js.indexOf('class="ai-assistant-card"');
  const actions = js.indexOf('class="today-action-list"');
  const signals = js.indexOf('class="account-signal-list"');
  assert.ok(ai > 0 && actions > ai && signals > actions);
  assert.match(js, /告诉小企刚刚发生了什么/);
  assert.doesNotMatch(js, /class="metric-strip"/);
});

test("Today surfaces remain readable in dark theme", () => {
  const css = read("style.css");
  assert.match(css, /\[data-theme="dark"\]\s*\{[^}]*--td-bg-container:\s*var\(--surface\)/s);
  assert.match(css, /\.ai-assistant-card\s*\{[^}]*background:[^}]*var\(--surface\)/s);
  assert.doesNotMatch(css, /\.ai-assistant-card\s*\{[^}]*#fff\s+72%/s);
});

test("mobile Today actions keep their date chips visible", () => {
  const css = read("style.css");
  assert.match(css, /@media\s*\(max-width:680px\)[\s\S]*?\.today-action-list \.date-chip\s*\{[^}]*display:\s*inline-flex[^}]*white-space:\s*normal/i);
});

test("copilot attachments are read, reviewed, and saved with the note", () => {
  const js = read("app.js");
  assert.match(js, /target\.id === "copilotFiles"/);
  assert.match(js, /AssetEngine\.readFile\(file\)/);
  assert.match(js, /id="copilotFileStatus"/);
  assert.match(js, /attachments:\s*\[\.\.\.state\.copilotAttachments\]/);
  assert.match(js, /customer\.assets\.push\(\.\.\.attachments\)/);
  assert.match(js, /attachments,\s*\n?\s*\}\);/);
});

test("outlined TDesign button uses the hover brand token", () => {
  const css = read("style.css");
  assert.match(css, /\.td-button--outline:hover\s*\{[^}]*var\(--td-brand-color-hover\)/);
});

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

test("QQ penguin is controlled by explicit assistant states", () => {
  const js = read("app.js");
  assert.match(js, /function setAssistantState\(assistantState\)/);
  assert.match(js, /setAssistantState\("listening"\)/);
  assert.match(js, /if \(state\.aiDraft\) return "reviewing";/);
  assert.match(js, /function reconcileAssistantState\(\)/);
  assert.match(js, /setAssistantState\("success"\)/);
  assert.match(js, /setAssistantState\("idle"\)/);
});

test("assistant state helper applies one card state and cancels stale success reset", () => {
  const classes = new Set(["ai-assistant-card"]);
  const card = {
    dataset: {},
    classList: {
      add(value) { classes.add(value); },
      remove(...values) { values.forEach(value => classes.delete(value)); },
    },
  };
  let pendingTimer = null;
  let scheduledDelay = null;
  const api = loadAssistantStateTestApi(card, {
    setTimeout(callback, delay) { pendingTimer = callback; scheduledDelay = delay; return 1; },
    clearTimeout() { pendingTimer = null; },
  });

  api.setAssistantState("success");
  assert.equal(card.dataset.assistantState, "success");
  assert.equal(classes.has("assistant-success"), true);
  assert.equal(scheduledDelay, 1200);

  api.setAssistantState("listening");
  assert.equal(card.dataset.assistantState, "listening");
  assert.equal(classes.has("assistant-success"), false);
  assert.equal(classes.has("assistant-listening"), true);
  assert.equal(pendingTimer, null);
});

test("voice end returns to reviewing when an AI draft already exists", () => {
  const classes = new Set(["ai-assistant-card"]);
  const card = {
    dataset: {},
    classList: {
      add(value) { classes.add(value); },
      remove(...values) { values.forEach(value => classes.delete(value)); },
    },
  };
  const input = { value: "", focus() {} };
  let recognition;
  class Recognition {
    constructor() { recognition = this; }
    start() {}
  }
  const buttonClasses = new Set();
  const button = {
    innerHTML: "",
    classList: {
      add(value) { buttonClasses.add(value); },
      remove(value) { buttonClasses.delete(value); },
    },
  };
  const api = loadAssistantStateTestApi(card, {
    setTimeout() { return 1; },
    clearTimeout() {},
  }, { input, Recognition });
  api.state.aiDraft = { raw: "待确认草稿" };

  api.startVoiceCapture(button);
  assert.equal(card.dataset.assistantState, "listening");
  recognition.onend();

  assert.equal(api.state.recording, false);
  assert.equal(card.dataset.assistantState, "reviewing");
  assert.equal(classes.has("assistant-reviewing"), true);
  assert.equal(buttonClasses.has("recording"), false);
});

test("reconcile restores listening on a rebuilt Today card without extending success", () => {
  const makeCard = () => {
    const classes = new Set(["ai-assistant-card"]);
    return {
      classes,
      dataset: {},
      classList: {
        add(value) { classes.add(value); },
        remove(...values) { values.forEach(value => classes.delete(value)); },
      },
    };
  };
  const firstCard = makeCard();
  let timerCount = 0;
  const api = loadAssistantStateTestApi(firstCard, {
    setTimeout() { timerCount += 1; return timerCount; },
    clearTimeout() {},
  });

  api.setAssistantState("success");
  const successCard = makeCard();
  api.replaceCard(successCard);
  api.reconcileAssistantState();
  assert.equal(successCard.dataset.assistantState, "success");
  assert.equal(timerCount, 1);

  api.state.recording = true;
  const rebuiltCard = makeCard();
  api.replaceCard(rebuiltCard);
  api.reconcileAssistantState();
  assert.equal(rebuiltCard.dataset.assistantState, "listening");
  assert.equal(rebuiltCard.classes.has("assistant-listening"), true);
  assert.match(read("app.js"), /function renderApp\(\)[\s\S]*?reconcileAssistantState\(\);/);
});

test("target selection rerender keeps listening while speech capture is active", async () => {
  const classes = new Set(["ai-assistant-card"]);
  const card = {
    dataset: {},
    classList: {
      add(value) { classes.add(value); },
      remove(...values) { values.forEach(value => classes.delete(value)); },
    },
  };
  const draftHost = { innerHTML: "" };
  const api = loadAssistantStateTestApi(card, {
    setTimeout() { return 1; },
    clearTimeout() {},
  }, { draftHost });
  api.state.recording = true;
  api.state.aiDraft = {
    customerId: "",
    raw: "录音中的草稿",
    found: {},
    method: "phone",
    contact: "",
    next: "",
    nextDate: "",
    attachments: [],
  };

  await api.handleChange({ target: { id: "aiTargetSelect", value: "customer-1", matches() { return false; } } });

  assert.equal(api.state.aiDraft.customerId, "customer-1");
  assert.equal(card.dataset.assistantState, "listening");
  assert.equal(classes.has("assistant-listening"), true);
  assert.equal(classes.has("assistant-reviewing"), false);
});

test("assistant state styling stays restrained and motion-safe", () => {
  const css = read("style.css");
  assert.match(css, /\.ai-assistant-card\.assistant-listening\s+\.qq-penguin--assistant\s*\{[^}]*animation:\s*assistantBreath 1\.2s ease-in-out infinite/i);
  assert.match(css, /\.ai-assistant-card\.assistant-reviewing\s*\{[^}]*var\(--td-brand-color-hover\)/i);
  assert.match(css, /\.ai-assistant-card\.assistant-success\s*\{[^}]*var\(--td-success\)/i);
  assert.match(css, /@keyframes\s+assistantBreath\s*\{[^}]*50%\s*\{[^}]*translateY\(-2px\)/i);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.ai-assistant-card\.assistant-listening\s+\.qq-penguin--assistant\s*\{[^}]*animation:\s*none/i);
});

test("customer and task worktables share TDesign surfaces and remain readable in dark mode", () => {
  const css = read("style.css");
  assert.match(css, /\.customer-worktable\s*,\s*\.task-worktable\s*\{[^}]*overflow:\s*hidden[^}]*padding:\s*0/i);
  assert.match(css, /\.task-worktable\s*>\s*\.section-heading\s*\{[^}]*var\(--td-border\)/i);
  assert.match(css, /\.task-row\s*\{[^}]*border-bottom:\s*1px solid var\(--td-border\)[^}]*transition:\s*background/i);
  assert.match(css, /\.task-row:hover\s*\{[^}]*var\(--td-brand-color-light\)[^}]*var\(--td-bg-container\)/i);
});

test("analytics retains only actionable responsive workspaces", () => {
  const js = read("app.js");
  const css = read("style.css");
  const start = js.indexOf("function renderAnalytics");
  const end = js.indexOf("function renderCopilotComposer", start);
  const analytics = js.slice(start, end);
  assert.match(analytics, /推进阶段分布/);
  assert.match(analytics, /停滞重点客户/);
  assert.match(analytics, /客户等级结构/);
  assert.doesNotMatch(analytics, /analytics-metrics|整体转化率|近 30 天跟进/);
  assert.match(css, /\.analytics-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,1\.25fr\)\s+minmax\(280px,\.75fr\)/i);
  assert.match(css, /@media\s*\(max-width:900px\)[\s\S]*?\.analytics-workspace\s*\{[^}]*grid-template-columns:\s*1fr/i);
});

test("stalled priority customers exclude won and lost terminal stages", () => {
  const { api } = loadWorkspaceTestApi();
  const customer = stage => ({
    id: stage,
    grade: "S",
    stage,
    notes: [{ date: "2020-01-01" }],
    stageHistory: [],
  });

  assert.deepEqual(
    Array.from(api.getStalledPriorityCustomers([customer("proposal"), customer("won"), customer("lost")]), item => item.customer.id),
    ["proposal"]
  );
});

test("390px customer cards preserve business priority and detail navigation", () => {
  const js = read("app.js");
  const css = read("style.css");
  assert.match(js, /data-label="阶段"/);
  assert.match(js, /data-label="下一步"/);
  assert.match(js, /aria-current="\$\{state\.customerTab === key \? "page" : "false"\}"/);
  assert.match(css, /@media\s*\(max-width:680px\)[\s\S]*?\.customer-worktable\s*\{[^}]*overflow:\s*visible/i);
  assert.match(css, /@media\s*\(max-width:680px\)[\s\S]*?\.customer-row\s*>\s*\.next-cell\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/i);
  assert.match(css, /@media\s*\(max-width:680px\)[\s\S]*?\.detail-section-nav\s*\{[^}]*overflow-x:\s*auto/i);
});

test("Escape closes row menus and restores focus from hidden content", () => {
  let focused = false;
  const activeElement = {};
  const summary = { focus() { focused = true; } };
  const menu = {
    open: true,
    contains(node) { return node === activeElement; },
    querySelector(selector) { return selector === "summary" ? summary : null; },
    removeAttribute(name) { if (name === "open") this.open = false; },
  };
  const { api, sandbox } = loadWorkspaceTestApi([menu]);
  sandbox.document.activeElement = activeElement;

  api.closeRowMenus(undefined, true, sandbox.document);

  assert.equal(menu.open, false);
  assert.equal(focused, true);
});

test("outside data-action clicks close menus before their action runs", async () => {
  const menu = {
    open: true,
    contains() { return false; },
    querySelector() { return null; },
    removeAttribute(name) { if (name === "open") this.open = false; },
  };
  const trigger = { dataset: { action: "theme" } };
  const target = { closest(selector) { return selector === "[data-action]" ? trigger : null; } };
  const { api, sandbox } = loadWorkspaceTestApi([menu]);

  await api.handleAction({ target });

  assert.equal(menu.open, false);
  assert.equal(sandbox.document.documentElement.dataset.theme, "dark");
});

test("menu-internal data-action clicks remain dispatchable", async () => {
  const menu = {
    open: true,
    contains() { return false; },
    querySelector() { return null; },
    removeAttribute(name) { if (name === "open") this.open = false; },
  };
  const trigger = { dataset: { action: "theme" } };
  const target = { closest(selector) { return selector === ".row-more-actions" ? menu : selector === "[data-action]" ? trigger : null; } };
  const { api, sandbox } = loadWorkspaceTestApi([menu]);

  await api.handleAction({ target });

  assert.equal(menu.open, true);
  assert.equal(sandbox.document.documentElement.dataset.theme, "dark");
});

test("business workspace controls expose a visible keyboard focus ring", () => {
  const css = read("style.css");
  assert.match(css, /button:focus-visible\s*,\s*summary:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--td-brand-color-hover\)[^}]*outline-offset:\s*2px/i);
});

test("the final customer menu stays visible inside the clipped worktable", () => {
  const css = read("style.css");
  assert.match(css, /\.customer-row:last-child\s+\.row-more-actions\s*>\s*button\s*\{[^}]*top:\s*auto[^}]*bottom:\s*34px/i);
});

const reportContext = {
  fieldDefs: [
    { key: "industry", label: "行业", public: true },
    { key: "relation", label: "客户关系", public: false },
  ],
  stages: [{ key: "proposal", label: "方案中" }],
  methods: [{ key: "phone", label: "电话" }],
  assetTypes: [{ key: "file", label: "文件" }],
  formatDateTime: value => value,
  formatShortDate: value => value,
  reportDate: "2026年7月16日",
};

test("report omits empty sections and all product-generation copy", () => {
  const customer = {
    name: "星澜互娱", grade: "A", stage: "proposal",
    fields: { industry: { v: "游戏" }, relation: { v: "技术负责人支持" } },
    painPoints: [{ v: "海外延迟" }], solution: [], orgChain: [], assets: [],
    notes: [{ method: "phone", date: "2026-07-16 10:00", contact: "王工", content: "确认海外延迟是核心顾虑", next: "发送对比方案", nextDate: "2026-07-18", taskDone: false }],
    stageHistory: [], raidFile: {},
  };

  const html = ReportBuilder.build(customer, reportContext);

  assert.match(html, /星澜互娱/);
  assert.match(html, /执行摘要/);
  assert.match(html, /全流程客户推进记录/);
  assert.match(html, /当前未完成行动/);
  assert.doesNotMatch(html, /云销副驾|AI\s*生成|实时汇总|未填写|暂无|待补充|企鹅|营销话术/);
  assert.doesNotMatch(html, /关键关系与组织架构|材料与证据索引/);
});

test("report covers populated customer intelligence without mutating source data", () => {
  const customer = {
    name: "远帆科技", grade: "S", stage: "proposal",
    fields: {
      industry: { value: "企业服务" },
      relation: "采购负责人已建联",
    },
    orgChain: [{ name: "李总", role: "采购负责人", phone: "13800000000", note: "预算关键人" }],
    painPoints: ["成本压力"],
    solution: [{ name: "迁移方案", description: "分阶段降低成本" }],
    notes: [
      { method: "phone", date: "2026-07-15 09:00", content: "确认预算范围", next: "提交报价", nextDate: "2026-07-20", taskDone: false },
      { method: "phone", date: "2026-07-14 09:00", content: "完成首次沟通", next: "发送资料", taskDone: true },
    ],
    stageHistory: [{ stage: "proposal", date: "2026-07-15", note: "进入方案评估" }],
    assets: [{ fileName: "会议纪要.pdf", description: "预算会议记录", type: "file", date: "2026-07-15" }],
    raidFile: {
      basic: { scope: "为制造企业提供协同软件" },
      scenes: [{ title: "海外协同", scene: "跨区域访问" }],
      org: { orgDesc: "采购向 CFO 汇报", roles: [{ role: "CFO", position: "决策人", demand: "控制预算" }] },
      dm: { reachLevel: "采购负责人", coreDemand: "年度降本", concern: "迁移风险" },
      competitors: [{ name: "现有供应商", coverage: "核心系统", pros: "稳定", cons: "成本高" }],
      solution: { biz: "分阶段商务方案", tech: "双轨迁移" },
      goals: { g1: "完成测试", g2: "核心系统迁移", g3: "建立长期合作" },
      plan: { action: "组织技术评审", support: "安排架构师" },
    },
  };
  const before = JSON.stringify(customer);

  const html = ReportBuilder.build(customer, reportContext);

  for (const expected of [
    "执行摘要", "客户基本信息与情报", "组织与关键关系", "痛点、竞品与匹配方案",
    "全流程客户推进记录", "当前未完成行动", "阶段历史、目标与攻坚计划", "材料与证据索引",
    "远帆科技", "企业服务", "李总", "成本压力", "迁移方案", "确认预算范围", "提交报价",
    "采购向 CFO 汇报", "进入方案评估", "完成测试", "组织技术评审", "会议纪要.pdf",
  ]) assert.match(html, new RegExp(expected));
  assert.equal((html.match(/成本压力/g) || []).length, 1);
  assert.equal((html.match(/迁移风险/g) || []).length, 1);
  assert.equal(JSON.stringify(customer), before);
});

test("report escapes customer data, suppresses empty values, and avoids cross-section fact repetition", () => {
  const repeatedFact = "唯一关系事实";
  const html = ReportBuilder.build({
    name: "<客户&公司>", stage: "", grade: "",
    fields: { industry: { v: "  " }, relation: { v: repeatedFact } },
    notes: [{ method: "", date: "", content: "" }],
    orgChain: [{ name: "", role: "", phone: "", note: "" }],
    painPoints: [], solution: [], assets: [], stageHistory: [], raidFile: {},
  }, reportContext);

  assert.match(html, /&lt;客户&amp;公司&gt;/);
  assert.equal((html.match(new RegExp(repeatedFact, "g")) || []).length, 1);
  assert.doesNotMatch(html, />\s*undefined\s*</);
  assert.doesNotMatch(html, /<p><\/p>|<li><\/li>|<td><\/td>/);
  assert.doesNotMatch(html, /全流程客户推进记录|组织与关键关系/);
});

test("report builder is the single source for preview and Word export", () => {
  const html = read("index.html");
  const js = read("app.js");
  const reportScript = html.indexOf('<script src="report.js"></script>');
  const appScript = html.indexOf('<script src="app.js"></script>');

  assert.ok(reportScript > 0 && appScript > reportScript);
  assert.match(js, /return ReportBuilder\.build\(customer,\s*\{/);
  assert.match(js, /ReportBuilder\.wrapWord\(\$\("#reportDocument"\)\.innerHTML\)/);
  assert.doesNotMatch(js, /function reportList|function reportEmpty|const reportRow/);
  assert.doesNotMatch(read("report.js"), /云销副驾|企鹅|AI\s*生成|实时汇总|未填写|暂无|待补充|report-footer/);
});

test("Word wrapper contains exactly the supplied report body", () => {
  const body = '<section class="report-section"><h2>客户事实</h2></section>';
  const word = ReportBuilder.wrapWord(body);
  assert.match(word, /^<!DOCTYPE html>/i);
  assert.equal((word.match(/客户事实/g) || []).length, 1);
  assert.doesNotMatch(word, /云销副驾|企鹅|AI\s*生成|实时汇总|report-footer/);
});
