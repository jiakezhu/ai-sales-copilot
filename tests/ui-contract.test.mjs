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

function loadReportIntegrationTestApi(reportBuilder) {
  const makeClasses = initial => {
    const values = new Set(initial);
    return {
      values,
      api: {
        add(value) { values.add(value); },
        remove(value) { values.delete(value); },
      },
    };
  };
  const reportLayerClasses = makeClasses(["hidden"]);
  const toastClasses = makeClasses(["hidden"]);
  let focused = false;
  const returnFocus = { focus() { focused = true; } };
  const elements = {
    "#reportDocument": { innerHTML: "" },
    "#reportStatus": { textContent: "" },
    "#reportLayer": { classList: reportLayerClasses.api },
    "#toast": { textContent: "", classList: toastClasses.api },
  };
  const sandbox = {
    console: { ...console, error() {} },
    ReportBuilder: reportBuilder,
    FIELD_DEFS: [], CRM_STAGES: [], CONTACT_METHODS: [], ASSET_TYPES: [],
    THEME_KEY: "theme",
    document: {
      activeElement: returnFocus,
      documentElement: { dataset: { theme: "light" } },
      body: { classList: makeClasses([]).api },
      addEventListener() {},
      querySelector(selector) { return elements[selector] || null; },
      querySelectorAll() { return []; },
    },
    window: { scrollTo() {} },
    localStorage: { setItem() {} },
    setTimeout() { return 1; }, clearTimeout() {}, requestAnimationFrame() {},
  };
  vm.runInNewContext(`${read("app.js")}\n;globalThis.__reportIntegrationTestApi = { openReport, buildReport, exportWordReport, setCustomers(value) { customers = value; }, setReportCustomer(value) { reportCustomer = value; }, setReportReturnFocus(value) { reportReturnFocus = value; } };`, sandbox);
  return { api: sandbox.__reportIntegrationTestApi, elements, reportLayerClasses, toastClasses, returnFocus, wasFocused: () => focused };
}

function loadFinalFixApi() {
  const saved = [];
  const sandbox = {
    console,
    document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } },
    window: {},
    localStorage: { setItem() {} },
    THEME_KEY: "theme",
    FIELD_DEFS: [],
    CONTACT_METHODS: [{ key: "phone", label: "电话", color: "#000" }],
    GRADES: [], CRM_STAGES: [], ASSET_TYPES: [],
    CRM: { save(value) { saved.push(JSON.parse(JSON.stringify(value))); } },
  };
  vm.runInNewContext(`${read("app.js")}\n;globalThis.__finalFixApi = { parseNaturalDate, extractNextAction, applyAIDraftSelection, upsertProgressNote, removeProgressNote, upsertContact, removeEvidenceAsset, evidenceOpenTarget };`, sandbox);
  return { api: sandbox.__finalFixApi, saved };
}

function loadAnalyzeCopilotApi(raw) {
  const input = { value: raw };
  const draftHost = { innerHTML: "", scrollIntoView() {} };
  const sandbox = {
    console,
    document: {
      addEventListener() {},
      querySelector(selector) {
        if (selector === "#copilotInput") return input;
        if (selector === "#aiDraft") return draftHost;
        return null;
      },
      querySelectorAll() { return []; },
    },
    window: {}, localStorage: { setItem() {} }, THEME_KEY: "theme",
    FIELD_DEFS: [], GRADES: [], CRM_STAGES: [], ASSET_TYPES: [],
    CONTACT_METHODS: [{ key: "phone", label: "电话", color: "#000" }],
    AIEngine: { extract() { return { name: "", found: {} }; } },
    methodMeta() { return { label: "电话", color: "#000" }; },
    setTimeout() { return 1; }, clearTimeout() {},
  };
  vm.runInNewContext(`${read("app.js")}\n;globalThis.__analyzeApi = { state, analyzeCopilot, setCustomers(value) { customers = value; } };`, sandbox);
  sandbox.__analyzeApi.draftHtml = () => draftHost.innerHTML;
  return sandbox.__analyzeApi;
}

function loadEvidenceOpenApi({ cloudEnabled = false, getTempFileURL } = {}) {
  const opened = [];
  const toastMessages = [];
  const classes = { remove() {}, add() {} };
  const sandbox = {
    console: { ...console, warn() {} },
    document: {
      addEventListener() {},
      querySelector(selector) { return selector === "#toast" ? { textContent: "", classList: classes } : null; },
      querySelectorAll() { return []; },
    },
    window: { open(url) { opened.push(url); return {}; } },
    localStorage: { setItem() {} }, THEME_KEY: "theme",
    FIELD_DEFS: [], CONTACT_METHODS: [], GRADES: [], CRM_STAGES: [], ASSET_TYPES: [],
    CLOUD_ENABLED: cloudEnabled,
    CloudAuth: { app: getTempFileURL ? { getTempFileURL } : {} },
    setTimeout() { return 1; }, clearTimeout() {},
  };
  const context = { ...sandbox, __toasts: toastMessages };
  vm.runInNewContext(`${read("app.js")}\n;toast = message => { globalThis.__toasts.push(message); }; globalThis.__evidenceApi = { evidenceOpenTarget, registerEvidenceBlobUrl, resolveCloudEvidenceUrl, openEvidenceAsset, setCustomers(value) { customers = value; } };`, context);
  return { api: context.__evidenceApi, opened, toastMessages };
}

function reportSection(html, title) {
  return html.match(new RegExp(`<section[^>]*>\\s*<div class="report-section-title"><h2>${title}</h2></div>[\\s\\S]*?</section>`))?.[0] || "";
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
  assert.doesNotMatch(html, /云销副驾|AI\s*生成|实时汇总|企鹅|营销话术|>(?:未填写|暂无|暂无内容|待补充)</);
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
  assert.equal((html.match(/成本压力/g) || []).length, 2, "summary must not remove the pain point from its core section");
  assert.match(reportSection(html, "痛点、竞品与匹配方案"), /成本压力/);
  assert.match(reportSection(html, "客户基本信息与情报"), /迁移风险/);
  assert.equal(JSON.stringify(customer), before);
});

test("report escapes customer data and suppresses empty values", () => {
  const repeatedFact = "唯一关系事实";
  const html = ReportBuilder.build({
    name: "<客户&公司>", stage: "", grade: "",
    fields: { industry: { v: "  " }, relation: { v: repeatedFact } },
    notes: [{ method: "", date: "", content: "" }],
    orgChain: [{ name: "", role: "", phone: "", note: "" }],
    painPoints: [], solution: [], assets: [], stageHistory: [], raidFile: {},
  }, reportContext);

  assert.match(html, /&lt;客户&amp;公司&gt;/);
  assert.equal((html.match(new RegExp(repeatedFact, "g")) || []).length, 2, "summary may reference a fact retained in its core section");
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
  assert.match(js, /return builder\.build\(customer,\s*\{/);
  assert.match(js, /builder\.wrapWord\(\$\("#reportDocument"\)\.innerHTML,\s*WORD_REPORT_STYLES\)/);
  assert.doesNotMatch(js, /function reportList|function reportEmpty|const reportRow/);
  assert.doesNotMatch(read("report.js"), /云销副驾|企鹅|AI\s*生成|实时汇总|report-footer/);
});

test("report markup exposes one professional hierarchy without legacy decoration", () => {
  const report = ReportBuilder.build({
    name: "客户庚",
    fields: { industry: { v: "企业服务" } },
    notes: [{ date: "2026-07-16", method: "phone", content: "确认采购范围" }],
  }, reportContext);

  assert.match(report, /^<header class="report-heading">/);
  assert.match(report, /class="report-field-grid/);
  assert.match(report, /class="report-progress"/);
  assert.doesNotMatch(report, /report-cover|report-brand|report-empty|report-footer/);
});

test("a minimal report flows naturally without forcing progress onto a new page", () => {
  const report = ReportBuilder.build({
    name: "客户辛",
    notes: [{ date: "2026-07-16", method: "phone", content: "确认需求" }],
  }, reportContext);

  assert.match(report, /全流程客户推进记录/);
  assert.doesNotMatch(report, /page-break/);
  assert.doesNotMatch(read("style.css"), /\.report-section\.page-break|break-before:\s*page/i);
  assert.doesNotMatch(read("app.js").match(/const WORD_REPORT_STYLES = `([\s\S]*?)`;/)?.[1] || "", /page-break-before:\s*always/i);
});

test("report styles are content-first, A4 printable, dark-safe, and mobile readable", () => {
  const css = read("style.css");

  assert.match(css, /\.report-heading\s*\{/);
  assert.match(css, /\.report-field-grid\s*\{/);
  assert.match(css, /\.report-progress\s+article\s*\{/);
  assert.match(css, /@page\s*\{\s*size:\s*A4/);
  assert.match(css, /body\s*>\s*\*\s*\{[^}]*display:\s*none\s*!important/i);
  assert.match(css, /\.report-layer\s*\{[^}]*display:\s*block\s*!important/i);
  assert.match(css, /\.no-print\s*\{[^}]*display:\s*none\s*!important/i);
  assert.match(css, /\.report-document\s*\{[^}]*background:\s*#fff[^}]*color:\s*#172b4d/i);
  assert.match(css, /@media\s*\(max-width:680px\)[\s\S]*?\.report-actions\s*\{[^}]*flex-wrap:\s*wrap/i);
  assert.match(css, /@media\s*\(max-width:680px\)[\s\S]*?\.report-field-grid\s*\{[^}]*grid-template-columns:\s*1fr/i);
  assert.doesNotMatch(css, /\.report-brand|\.report-cover|\.report-empty|\.report-footer/);
});

test("Word wrapper embeds the supplied professional styles around exactly the report body", () => {
  const body = '<section class="report-section"><h2>客户事实</h2></section>';
  const styles = "body{font-family:'Microsoft YaHei';margin:20mm}";
  const word = ReportBuilder.wrapWord(body, styles);
  assert.match(word, /^<!DOCTYPE html>/i);
  assert.match(word, /<style>body\{font-family:'Microsoft YaHei';margin:20mm\}<\/style>/);
  assert.equal((word.match(/客户事实/g) || []).length, 1);
  assert.doesNotMatch(word, /云销副驾|企鹅|AI\s*生成|实时汇总|report-footer/);
});

test("Word export mirrors the preview hierarchy with professional Chinese pagination", () => {
  const styles = read("app.js").match(/const WORD_REPORT_STYLES = `([\s\S]*?)`;/)?.[1] || "";

  assert.match(styles, /@page\s*\{\s*size:\s*A4;\s*margin:\s*18mm 17mm/i);
  assert.match(styles, /font-family:\s*"Microsoft YaHei",\s*"PingFang SC"/i);
  assert.match(styles, /font-size:\s*10\.5pt/);
  assert.match(styles, /line-height:\s*1\.65/);
  assert.match(styles, /widows:\s*2;\s*orphans:\s*2/);
  assert.match(styles, /\*\s*\{[^}]*box-sizing:\s*border-box/i);
  assert.match(styles, /\.report-heading[\s\S]*\.report-field-grid[\s\S]*\.report-progress/);
  assert.match(styles, /page-break-inside:\s*avoid/);
});

test("report styles do not carry table rules when the builder emits no tables", () => {
  assert.doesNotMatch(read("report.js"), /<table\b/i);
  assert.doesNotMatch(read("style.css"), /\.report-document\s+table|\.report-document\s+th|\.report-document\s+td/i);
  const wordStyles = read("app.js").match(/const WORD_REPORT_STYLES = `([\s\S]*?)`;/)?.[1] || "";
  assert.doesNotMatch(wordStyles, /(?:^|\n)\s*table\s*\{|(?:^|\n)\s*th\s*,\s*td\s*\{/i);
});

test("report filters only standalone placeholder sentinels and preserves real statements", () => {
  const html = ReportBuilder.build({
    name: "客户甲",
    fields: {
      industry: { v: "未填写" },
      relation: { v: "暂无其他同事跟进" },
      staff: { v: " 待补充。 " },
    },
    raidFile: { competitor: { internal: "暂无其他团队撞单" } },
  }, {
    ...reportContext,
    fieldDefs: [
      { key: "industry", label: "行业", public: true },
      { key: "relation", label: "客户关系", public: false },
      { key: "staff", label: "规模", public: true },
    ],
  });

  assert.doesNotMatch(html, />\s*(?:未填写|待补充。)\s*</);
  assert.match(html, /暂无其他同事跟进/);
  assert.match(html, /暂无其他团队撞单/);
});

test("deduplication operates on complete facts and records, not shared atomic values", () => {
  const html = ReportBuilder.build({
    name: "客户乙",
    fields: { relation: { v: "已建立技术关系" } },
    painPoints: ["成本高", "成本高"],
    orgChain: [
      { id: "a", name: "甲", role: "CTO", level: 2 },
      { id: "b", name: "乙", role: "CTO", level: 2 },
    ],
    raidFile: {
      competitors: [
        { name: "竞品甲", coverage: "核心系统", pros: "稳定" },
        { name: "竞品乙", coverage: "核心系统", pros: "便宜" },
        { name: "竞品乙", coverage: "核心系统", pros: "便宜" },
      ],
    },
  }, reportContext);
  const market = reportSection(html, "痛点、竞品与匹配方案");
  const organization = reportSection(html, "组织与关键关系");

  assert.equal((market.match(/成本高/g) || []).length, 1);
  assert.equal((market.match(/竞品乙/g) || []).length, 1);
  assert.equal((market.match(/核心系统/g) || []).length, 2);
  assert.match(organization, /甲[\s\S]*CTO/);
  assert.match(organization, /乙[\s\S]*CTO/);
});

test("timeline preserves each meaningful note action while pending actions remain aggregated", () => {
  const html = ReportBuilder.build({
    name: "客户丙",
    notes: [
      { method: "phone", content: "确认预算", next: "提交报价", nextDate: "2026-07-20", taskDone: false },
      { method: "phone" },
      { method: "phone", date: "2026-07-18", content: "发送资料", next: "客户确认收件", nextDate: "2026-07-19", taskDone: true },
    ],
  }, reportContext);
  const timeline = reportSection(html, "全流程客户推进记录");
  const pending = reportSection(html, "当前未完成行动");
  const summary = reportSection(html, "执行摘要");

  assert.equal((timeline.match(/<article>/g) || []).length, 2);
  assert.doesNotMatch(timeline, /<time><\/time>/);
  assert.match(timeline, /确认预算[\s\S]*未完成[\s\S]*提交报价[\s\S]*2026-07-20/);
  assert.match(timeline, /已完成[\s\S]*客户确认收件/);
  assert.match(pending, /提交报价/);
  assert.match(summary, /下一步行动[\s\S]*提交报价/);
});

test("organization renders pid hierarchy, level labels, and narrative decision chain", () => {
  const html = ReportBuilder.build({
    name: "客户丁",
    orgChain: [
      { id: "ceo", pid: null, name: "周总", role: "CEO", level: 1 },
      { id: "cto", pid: "ceo", name: "李总", role: "CTO", level: 2 },
      { id: "ops", pid: "cto", name: "王工", role: "运维", level: 3 },
    ],
    raidFile: { org: { orgDesc: "技术方案由 CTO 牵头" } },
  }, reportContext);
  const organization = reportSection(html, "组织与关键关系");

  assert.match(organization, /决策链：周总 → 李总 → 王工/);
  assert.match(organization, /周总[\s\S]*决策层/);
  assert.match(organization, /李总[\s\S]*上级：周总/);
  assert.match(organization, /王工[\s\S]*执行层/);
  assert.match(organization, /技术方案由 CTO 牵头/);
});

test("evidence merges customer assets and note attachments with complete-record deduplication", () => {
  const shared = { name: "纪要.pdf", caption: "预算会", type: "file", createdAt: "2026-07-16" };
  const html = ReportBuilder.build({
    name: "客户戊",
    assets: [shared, { ...shared }],
    notes: [{ content: "会议结束", attachments: [
      { ...shared },
      { ...shared, caption: "技术会" },
      { name: "截图.png", type: "image" },
    ] }],
  }, reportContext);
  const evidence = reportSection(html, "材料与证据索引");

  assert.equal((evidence.match(/纪要\.pdf/g) || []).length, 2);
  assert.match(evidence, /预算会/);
  assert.match(evidence, /技术会/);
  assert.match(evidence, /截图\.png/);
});

test("attachment metadata alone cannot create evidence or an empty timeline record", () => {
  const html = ReportBuilder.build({
    name: "客户附件校验",
    assets: [
      { type: "file" },
      { size: 2048 },
      { name: "未填写", caption: "待补充", type: "file", size: 1024 },
      { url: "https://files.example.com/proof-1" },
    ],
    notes: [{
      method: "phone",
      attachments: [
        { type: "file" },
        { size: 512 },
        { name: "暂无", caption: "暂无内容", type: "file" },
      ],
    }],
  }, reportContext);
  const evidence = reportSection(html, "材料与证据索引");

  assert.doesNotMatch(html, /全流程客户推进记录/);
  assert.match(evidence, /https:\/\/files\.example\.com\/proof-1/);
  assert.equal((evidence.match(/<li>/g) || []).length, 1);
  assert.doesNotMatch(evidence, /2048|1024|512|未填写|待补充|暂无/);
});

test("report integration fails safely with a recoverable message when builder API is unavailable", () => {
  for (const brokenBuilder of [
    undefined,
    {},
    { build() { return ""; } },
    { build() { throw new Error("broken build"); }, wrapWord() { return ""; } },
    { build() { return null; }, wrapWord() { return ""; } },
  ]) {
    const harness = loadReportIntegrationTestApi(brokenBuilder);
    harness.api.setCustomers([{ id: "customer-1", name: "客户己" }]);
    harness.reportLayerClasses.values.delete("hidden");

    assert.doesNotThrow(() => harness.api.openReport("customer-1"));
    assert.match(harness.elements["#toast"].textContent, /报告组件.*刷新.*重试/);
    assert.equal(harness.reportLayerClasses.values.has("hidden"), true);
  }
});

test("attitude enums are localized and missing customer names do not create empty headings", () => {
  const html = ReportBuilder.build({
    raidFile: { dm: { attitude: "positive", coreDemand: "推进试点" } },
  }, reportContext);

  assert.match(html, /合作态度[\s\S]*积极/);
  assert.doesNotMatch(html, /positive/);
  assert.doesNotMatch(html, /<h1>\s*<\/h1>/);
});

test("mobile, motion, and mascot boundaries are explicit", () => {
  const css = read("style.css");
  const js = read("app.js");
  const reportAdapter = js.slice(js.indexOf("function buildReport"), js.indexOf("function exportWordReport"));

  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)/);
  assert.match(css, /@media\s*\(max-width:\s*390px\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(reportAdapter, /qq-penguin|企鹅|assets\//);
});

test("390px customer cards retain every business-priority field", () => {
  const css = read("style.css");
  const mobile = css.slice(css.indexOf("@media (max-width:680px){\n  .customer-worktable"));

  assert.match(mobile, /\.customer-row>\.muted-cell:nth-child\(3\)\s*\{[^}]*display:\s*flex/i);
  assert.match(mobile, /\.customer-row>\.muted-cell:nth-child\(5\)\s*\{[^}]*display:\s*flex/i);
  assert.match(mobile, /\.customer-row>\.next-cell\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/i);
});

test("mobile controls expose 44px touch targets and visible keyboard focus", () => {
  const css = read("style.css");

  assert.match(css, /:where\(button,\s*\[role="button"\],\s*summary,\s*input,\s*select,\s*textarea\):focus-visible/);
  assert.match(css, /\.option-cards label:has\(input:focus-visible\)/);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?min-height:\s*44px/i);
  assert.match(css, /@media\s*\(max-width:\s*900px\)[\s\S]*?min-width:\s*44px/i);
});

test("mobile report and topbar actions have concrete 44px targets", () => {
  const css = read("style.css");
  const mobile = css.slice(css.indexOf("@media (max-width:900px)"));

  assert.match(mobile, /\.report-mini\s*\{[^}]*min-height:\s*44px/i);
  assert.match(mobile, /\.top-actions \.primary-button\s*\{[^}]*width:\s*44px[^}]*min-width:\s*44px/i);
});

test("approved mascot crop shows the complete icon without dock chrome", () => {
  const css = read("style.css");

  assert.match(css, /\.qq-penguin--brand img\s*\{[^}]*width:\s*75px[^}]*height:\s*95px[^}]*left:\s*-12px[^}]*top:\s*-25px/i);
  assert.match(css, /\.qq-penguin--assistant img\s*\{[^}]*width:\s*88px[^}]*height:\s*112px[^}]*left:\s*-14px[^}]*top:\s*-29px/i);
  assert.equal(createHash("sha256").update(readBinary("assets/qq-penguin-reference.png")).digest("hex"), "5eda8ddce51aa85a0fe6688563868229656fcd27b7f9fde27ac59857ccc87f7e");
});

test("modal and report dialogs declare focus targets and accessible close controls", () => {
  const html = read("index.html");
  const js = read("app.js");

  assert.match(html, /id="modalLayer"[^>]*aria-hidden="true"/);
  assert.match(html, /id="modalPanel"[^>]*tabindex="-1"/);
  assert.match(html, /id="reportLayer"[^>]*aria-hidden="true"[^>]*tabindex="-1"/);
  assert.match(js, /function trapDialogFocus\(event\)/);
  assert.match(js, /!layer\.contains\(document\.activeElement\)/);
  assert.match(js, /querySelector\(DIALOG_FOCUSABLE\)\?\.focus\(\)/);
  assert.match(js, /restoreDialogFocus\(/);
  assert.doesNotMatch(js, /class="icon-button" data-action="close-modal">/);
  assert.match(js, /data-action="close-modal" aria-label="关闭弹窗"/);
});

test("dark surfaces and compact report preview remain explicit", () => {
  const css = read("style.css");

  assert.match(css, /\[data-theme="dark"\]\s+\.modal-panel\s*\{/);
  assert.match(css, /\[data-theme="dark"\]\s+\.report-toolbar\s*\{/);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*?\.report-document\s*\{[^}]*width:\s*100%[^}]*padding:\s*30px 18px/i);
  assert.match(css, /@media\s*\(max-width:\s*680px\)[\s\S]*?\.report-field-grid\s*\{[^}]*grid-template-columns:\s*1fr/i);
});

test("390px report toolbar keeps close in the title row and exports together", () => {
  const css = read("style.css");
  const compact = css.slice(css.indexOf("@media (max-width:390px)"), css.indexOf("@media print"));

  assert.match(compact, /\.report-toolbar\s*\{[^}]*position:\s*relative/i);
  assert.match(compact, /\.report-actions\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/i);
  assert.match(compact, /\.report-actions \.icon-button\s*\{[^}]*position:\s*absolute[^}]*top:\s*10px[^}]*right:\s*12px[^}]*width:\s*44px[^}]*height:\s*44px/i);
});

test("natural Chinese dates and date-prefixed actions resolve against a fixed base date", () => {
  const { api } = loadFinalFixApi();
  const base = new Date(2026, 6, 16, 9, 0, 0);
  const expected = new Map([
    ["今天", "2026-07-16"], ["明天", "2026-07-17"], ["后天", "2026-07-18"],
    ["本周一", "2026-07-13"], ["本周日", "2026-07-19"],
    ["下周三", "2026-07-22"], ["下下周五", "2026-07-31"],
    ["本周", "2026-07-19"], ["下周", "2026-07-26"], ["下下周", "2026-08-02"],
    ["2026/8/2", "2026-08-02"], ["8月3日", "2026-08-03"],
  ]);
  for (const [text, date] of expected) assert.equal(api.parseNaturalDate(text, base), date, text);

  const parsed = api.extractNextAction("下周三发 GAAP 对比方案，并提醒我跟进。", base);
  assert.equal(parsed.next, "发 GAAP 对比方案");
  assert.equal(parsed.nextDate, "2026-07-22");
  assert.deepEqual({ ...api.extractNextAction("下周发方案", base) }, { next: "发方案", nextDate: "2026-07-26" });
});

test("the complete homepage example resolves matched customer, contact, action, and visible date", () => {
  const raw = "刚和星澜互娱王工通了电话，对方担心海外延迟。下周三发 GAAP 对比方案，并提醒我跟进。";
  const api = loadAnalyzeCopilotApi(raw);
  api.setCustomers([{ id: "c-star", name: "星澜互娱", orgChain: [{ id: "p1", name: "王工" }] }]);
  api.analyzeCopilot(new Date(2026, 6, 16, 9, 0, 0));
  assert.equal(api.state.aiDraft.customerId, "c-star");
  assert.equal(api.state.aiDraft.contact, "王工");
  assert.equal(api.state.aiDraft.next, "发 GAAP 对比方案");
  assert.equal(api.state.aiDraft.nextDate, "2026-07-22");
  assert.match(api.draftHtml(), /创建下一步 · 7月22日/);
});

test("a bare next-week action receives Sunday, renders it, and can become a task", () => {
  const raw = "星澜互娱下周发方案";
  const analyze = loadAnalyzeCopilotApi(raw);
  analyze.setCustomers([{ id: "c-star", name: "星澜互娱", orgChain: [] }]);
  analyze.analyzeCopilot(new Date(2026, 6, 16, 9, 0, 0));
  assert.equal(analyze.state.aiDraft.next, "发方案");
  assert.equal(analyze.state.aiDraft.nextDate, "2026-07-26");
  assert.match(analyze.draftHtml(), /创建下一步 · 7月26日/);

  const { api } = loadFinalFixApi();
  const customer = { fields: {}, notes: [], assets: [] };
  api.applyAIDraftSelection(customer, analyze.state.aiDraft, { note: false, task: true, fields: [] }, "2026-07-16 09:00", "n1");
  assert.equal(customer.notes.filter(note => note.next === "发方案" && note.nextDate === "2026-07-26").length, 1);
});

test("AI candidate selections persist independently and expose a task through getTasks semantics", () => {
  const { api } = loadFinalFixApi();
  const baseCustomer = () => ({ id: "c1", fields: {}, notes: [], assets: [], raidFile: { plan: { action: "保留" } }, funnel: { reached: 9 } });
  const draft = { raw: "原始沟通", method: "phone", contact: "王工", found: { industry: "游戏" }, next: "发方案", nextDate: "2026-07-22", attachments: [{ id: "a1", name: "证据.png" }] };

  const taskOnly = baseCustomer();
  const result = api.applyAIDraftSelection(taskOnly, draft, { note: false, task: true, fields: [] }, "2026-07-16 09:00", "n-task");
  assert.equal(result.persisted, true);
  assert.equal(taskOnly.notes.length, 1);
  assert.equal(taskOnly.notes[0].content, "");
  assert.equal(taskOnly.notes[0].source, "ai-action-only");
  assert.equal(taskOnly.notes[0].next, "发方案");
  assert.equal(taskOnly.notes.filter(note => note.next && note.nextDate).length, 1);
  assert.deepEqual(Array.from(taskOnly.assets, x => x.id), ["a1"]);

  const noteOnly = baseCustomer();
  api.applyAIDraftSelection(noteOnly, draft, { note: true, task: false, fields: [] }, "2026-07-16 09:00", "n-note");
  assert.equal(noteOnly.notes[0].content, "原始沟通");
  assert.equal(noteOnly.notes[0].next, "");

  const fieldOnly = baseCustomer();
  api.applyAIDraftSelection(fieldOnly, draft, { note: false, task: false, fields: ["industry"] }, "2026-07-16 09:00", "unused");
  assert.equal(fieldOnly.fields.industry.v, "游戏");
  assert.equal(fieldOnly.notes.length, 0);
  assert.equal(fieldOnly.assets.length, 0);

  const none = baseCustomer();
  const noneResult = api.applyAIDraftSelection(none, draft, { note: false, task: false, fields: [] }, "2026-07-16 09:00", "unused");
  assert.equal(noneResult.persisted, false);
  assert.equal(JSON.stringify(none), JSON.stringify(baseCustomer()));
  assert.deepEqual(none.raidFile, { plan: { action: "保留" } });
  assert.deepEqual(none.funnel, { reached: 9 });
});

test("manual entry validates meaningful content before reading or attaching files", () => {
  const js = read("app.js");
  const submit = js.slice(js.indexOf("async function submitManualEntry"), js.indexOf("function openContactForm"));
  const validation = submit.indexOf('toast("请填写沟通内容或下一步行动")');
  const fileRead = submit.indexOf("AssetEngine.readFile(file)");
  assert.ok(validation > 0 && fileRead > validation);
});

test("progress and contact upserts preserve identity, attachments, and hierarchy", () => {
  const { api } = loadFinalFixApi();
  const customer = {
    notes: [{ id: "n1", content: "旧", attachments: [{ id: "a1" }], next: "旧任务", taskDone: true }],
    assets: [{ id: "a1" }],
    orgChain: [{ id: "p1", pid: null, name: "旧名" }, { id: "child", pid: "p1", name: "下属" }],
  };
  api.upsertProgressNote(customer, { id: "n1", method: "meeting", date: "2026-07-16 10:00", contact: "李总", content: "新", next: "新任务", nextDate: "2026-07-20" });
  assert.equal(customer.notes[0].id, "n1");
  assert.deepEqual(Array.from(customer.notes[0].attachments, x => x.id), ["a1"]);
  assert.equal(customer.notes[0].taskDone, false);
  api.removeProgressNote(customer, "n1");
  assert.equal(customer.notes.length, 0);

  api.upsertContact(customer, { id: "p1", pid: null, name: "新名", role: "CTO", level: 1 });
  assert.equal(customer.orgChain.find(x => x.id === "p1").name, "新名");
  assert.equal(customer.orgChain.find(x => x.id === "child").pid, "p1");
});

test("evidence actions expose real content, identify metadata-only files, and remove ghost references", () => {
  const { api } = loadFinalFixApi();
  assert.deepEqual({ ...api.evidenceOpenTarget({ dataUrl: "data:image/png;base64,AA", isImage: true }) }, { kind: "preview", url: "data:image/png;base64,AA" });
  assert.deepEqual({ ...api.evidenceOpenTarget({ fileUrl: "https://example.com/a.pdf" }) }, { kind: "open", url: "https://example.com/a.pdf" });
  assert.deepEqual({ ...api.evidenceOpenTarget({ cloudPath: "cloud://bucket/a.pdf" }) }, { kind: "cloud", url: "cloud://bucket/a.pdf" });
  assert.deepEqual({ ...api.evidenceOpenTarget({ name: "本地.pdf", size: 100 }) }, { kind: "unavailable", url: "" });
  for (const unsafe of [
    { url: "javascript:alert(1)" }, { url: "file:///etc/passwd" },
    { dataUrl: "data:text/html,<script>alert(1)</script>" },
    { dataUrl: "data:image/svg+xml,<svg onload=alert(1)>" },
    { dataUrl: "data:application/pdf;base64,AA==" },
  ]) assert.equal(api.evidenceOpenTarget(unsafe).kind, "unsafe");

  const customer = { assets: [{ id: "a1" }, { id: "a2" }], notes: [{ attachments: [{ id: "a1" }, { id: "a2" }] }] };
  api.removeEvidenceAsset(customer, "a1");
  assert.deepEqual(Array.from(customer.assets, x => x.id), ["a2"]);
  assert.deepEqual(Array.from(customer.notes[0].attachments, x => x.id), ["a2"]);
});

test("evidence open path allows safe raster/https and rejects malicious protocols", async () => {
  const harness = loadEvidenceOpenApi();
  harness.api.setCustomers([{ id: "c1", assets: [
    { id: "https", url: "https://example.com/a.pdf" },
    { id: "png", dataUrl: "data:image/png;base64,AA==", isImage: true },
    { id: "evil", url: "javascript:alert(1)" },
  ] }]);
  await harness.api.openEvidenceAsset("c1", "https");
  await harness.api.openEvidenceAsset("c1", "png");
  await harness.api.openEvidenceAsset("c1", "evil");
  assert.deepEqual(harness.opened, ["https://example.com/a.pdf", "data:image/png;base64,AA=="]);
  assert.match(harness.toastMessages.at(-1), /不安全|无法打开/);
});

test("blob evidence requires an application-owned runtime registration", () => {
  const harness = loadEvidenceOpenApi();
  const blobUrl = "blob:https://app.example.com/123";
  assert.equal(harness.api.evidenceOpenTarget({ dataUrl: blobUrl, trustedObjectUrl: true }).kind, "unsafe");
  harness.api.registerEvidenceBlobUrl(blobUrl);
  assert.deepEqual({ ...harness.api.evidenceOpenTarget({ dataUrl: blobUrl }) }, { kind: "preview", url: blobUrl });
});

test("cloud evidence resolves to a temporary https URL and reports unavailable failures", async () => {
  const success = loadEvidenceOpenApi({ cloudEnabled: true, getTempFileURL: async () => ({ fileList: [{ tempFileURL: "https://tmp.example.com/a.pdf" }] }) });
  success.api.setCustomers([{ id: "c1", assets: [{ id: "cloud", fileID: "cloud://bucket/a.pdf" }] }]);
  await success.api.openEvidenceAsset("c1", "cloud");
  assert.deepEqual(success.opened, ["https://tmp.example.com/a.pdf"]);

  const failure = loadEvidenceOpenApi({ cloudEnabled: true, getTempFileURL: async () => { throw new Error("offline"); } });
  failure.api.setCustomers([{ id: "c1", assets: [{ id: "cloud", cloudPath: "cloud://bucket/a.pdf" }] }]);
  await failure.api.openEvidenceAsset("c1", "cloud");
  assert.deepEqual(failure.opened, []);
  assert.match(failure.toastMessages.at(-1), /云端材料暂时无法打开/);
});

test("final UI contract restores linear CRUD actions, complete evidence, and pinned Lucide SRI", () => {
  const js = read("app.js");
  const html = read("index.html");
  assert.match(js, /data-action="edit-note"/);
  assert.match(js, /data-action="remove-note"/);
  assert.match(js, /data-action="edit-contact"/);
  assert.match(js, /data-action="open-asset"/);
  assert.match(js, /data-action="remove-asset"/);
  assert.doesNotMatch(js, /customer\.assets\.slice\(0,5\)/);
  assert.doesNotMatch(js, /function metricCard/);
  assert.doesNotMatch(read("style.css"), /\.metric-card|\.metric-strip|\.metric-top/);
  assert.match(html, /https:\/\/unpkg\.com\/lucide@1\.24\.0\/dist\/umd\/lucide\.min\.js/);
  assert.match(html, /integrity="sha384-mooE85Luwgx\+AyykX7e90VcN8\/QCFTSIwPuHLmvcsLVoA0en7lKYb9XlOzn5G2co"/);
  assert.match(html, /crossorigin="anonymous"/);
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.doesNotMatch(html, /lucide@latest/);
});

test("report failures close the dialog, restore focus, and then toast", () => {
  const harness = loadReportIntegrationTestApi({ build() { throw new Error("broken"); }, wrapWord() { throw new Error("broken"); } });
  harness.api.setCustomers([{ id: "c1", name: "客户" }]);
  harness.reportLayerClasses.values.delete("hidden");
  harness.api.setReportReturnFocus(harness.returnFocus);
  harness.api.openReport("c1");
  assert.equal(harness.reportLayerClasses.values.has("hidden"), true);
  assert.equal(harness.wasFocused(), true);
  assert.match(harness.elements["#toast"].textContent, /报告组件/);
});

test("Word export failures use the same close, focus restoration, and toast recovery", () => {
  const harness = loadReportIntegrationTestApi({ build() { return "<p>报告</p>"; }, wrapWord() { throw new Error("broken export"); } });
  harness.api.setCustomers([{ id: "c1", name: "客户" }]);
  harness.api.openReport("c1");
  harness.api.exportWordReport();
  assert.equal(harness.reportLayerClasses.values.has("hidden"), true);
  assert.equal(harness.wasFocused(), true);
  assert.match(harness.elements["#toast"].textContent, /报告组件/);
});

test("four-zone UI adjudication preserves RAID and funnel source data without adding duplicate pages", () => {
  const js = read("app.js");
  const before = { raidFile: { plan: { action: "技术评审" } }, funnel: { reached: 100, won: 6 } };
  const customer = { name: "客户", fields: {}, notes: [], assets: [], orgChain: [], painPoints: [], solution: [], stageHistory: [], ...structuredClone(before) };
  ReportBuilder.build(customer, reportContext);
  assert.deepEqual(customer.raidFile, before.raidFile);
  assert.deepEqual(customer.funnel, before.funnel);
  assert.doesNotMatch(js, /\["raid"|\["funnel"|customerTab === "raid"|customerTab === "funnel"/);
});
