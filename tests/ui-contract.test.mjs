import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ReportBuilder from "../report.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readBinary = path => readFileSync(new URL(`../${path}`, import.meta.url));
const APPROVED_PENGUIN_ASSETS = {
  "assets/penguin/stand.png": "60763fa43c7f92b827e53dbac1bbac2666d83dea8b9c0553fe7590eae40ae51d",
  "assets/penguin/wave.png": "02898c13ed3ee28abecb71c6156d9888029a2943ef1b4d76894e4b1c890d5b23",
  "assets/penguin/scratch.png": "c80e3a7090a20b0bbb9ab099af167332720a744ac96ec40f3fe0eceaa53527ee",
  "assets/penguin/search.png": "f944af0fb0a382c79e43c35546523ae8d168d8ab4866ac3598acbb16091b642c",
  "assets/penguin/success.png": "6036ce8fb32a9b5885c18b38aa7d41462a35aa8b97e17c3ade07048f927b0332",
  "assets/penguin/lost.png": "1ece1ac28b5cf348752f31d59bfd25078608fc732b9fc4fd89da304afd19e3d8",
};

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
  vm.runInNewContext(`${read("app.js")}\n;globalThis.__workspaceTestApi = { closeRowMenus, prepareRowMenusForAction, handleAction, getStalledPriorityCustomers, stagePenguinPose, penguinSVG };`, sandbox);
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
  vm.runInNewContext(`${read("app.js")}\n;globalThis.__finalFixApi = { parseNaturalDate, extractNextAction, applyAIDraftSelection, upsertProgressNote, removeProgressNote, upsertContact, removeEvidenceAsset, evidenceOpenTarget, applyTaskCompletion };`, sandbox);
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

function loadAssetEngineApi({ uploadFile, getTempFileURL }) {
  const sandbox = {
    console,
    CLOUD_ENABLED: true,
    CLOUDBASE_CONFIG: { STORAGE_DIR: "evidence" },
    CloudAuth: { _uid() { return "user-1"; }, app: { uploadFile, getTempFileURL } },
    CONTACT_METHODS: [{ key: "other" }], GRADES: [],
    setTimeout, clearTimeout,
  };
  vm.runInNewContext(`${read("crm.js")}\n;globalThis.__assetEngine = AssetEngine;`, sandbox);
  return sandbox.__assetEngine;
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

test("QQ penguin pose assets match the approved reference set", () => {
  for (const [path, expectedDigest] of Object.entries(APPROVED_PENGUIN_ASSETS)) {
    const digest = createHash("sha256").update(readBinary(path)).digest("hex");
    assert.equal(digest, expectedDigest, `${path} changed unexpectedly`);
  }
});

test("desktop brand uses the selected option one logo while mobile keeps the approved stand pose", () => {
  const html = read("index.html");
  const js = read("app.js");
  const desktopBrand = html.match(/<button class="brand"[\s\S]*?<\/button>/)?.[0] || "";
  const mobileBrand = html.match(/<button class="mobile-brand"[\s\S]*?<\/button>/)?.[0] || "";
  const mascot = /<span class="qq-penguin qq-penguin--brand" data-penguin="stand" aria-hidden="true"><\/span>/;

  assert.match(desktopBrand, /<img class="brand-logo" src="assets\/sales-buddy-logo-option-1\.png" alt="Sales Buddy" \/>/);
  assert.match(mobileBrand, mascot);
  assert.equal((html.match(/data-penguin="stand"/g) || []).length, 1);
  assert.match(js, /const PENGUIN_POSES = \["stand", "wave", "scratch", "search", "success", "lost"\]/);
  assert.match(js, /src="assets\/penguin\/\$\{p\}\.png"/);
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
  assert.match(js, /告诉 Sales Buddy 刚发生了什么/);
  assert.match(js, /class="today-date"/);
  assert.doesNotMatch(js, /商务鹅|早上好，先推进最重要的客户|你负责确认和决策/);
  assert.doesNotMatch(js, /class="metric-strip"/);
});

test("Sales Buddy brand and the single global manual entry stay consistent", () => {
  const html = read("index.html");
  const js = read("app.js");
  const auth = read("auth.js");
  assert.match(html, /<title>Sales Buddy · AI 客户推进工作台<\/title>/);
  assert.match(html, /class="brand-logo" src="assets\/sales-buddy-logo-option-1\.png" alt="Sales Buddy"/);
  assert.match(html, /class="mobile-brand"[\s\S]*?Sales Buddy/);
  assert.equal((auth.match(/assets\/sales-buddy-logo-option-1\.png/g) || []).length, 2);
  assert.doesNotMatch(auth, /class="cb-login-title">Sales Buddy<\/div>/);
  assert.equal((html.match(/data-action="manual-entry"/g) || []).length, 1);
  assert.equal((js.match(/data-action="manual-entry"/g) || []).length, 0);
  const today = js.slice(js.indexOf("function renderToday"), js.indexOf("function renderCopilotComposer"));
  assert.doesNotMatch(today, /data-action="manual-entry"/);
});

test("light theme uses a unified pale shell while dark mode keeps its own sidebar", () => {
  const css = read("style.css");
  assert.match(css, /\.side-nav\s*\{[^}]*background:\s*var\(--surface\)/s);
  assert.match(css, /\[data-theme="dark"\]\s+\.side-nav\s*\{[^}]*background:\s*#101828/s);
});

test("customer header surfaces staff, funding, and website facts", () => {
  const js = read("app.js");
  const data = read("data.js");
  const detail = js.slice(js.indexOf("function renderCustomerDetail"), js.indexOf("function renderStageTrack"));
  assert.match(detail, /renderCustomerFacts\(customer\)/);
  assert.match(js, /function renderCustomerFacts\(customer\)/);
  assert.match(js, /customer\.fields\.staff/);
  assert.match(js, /customer\.fields\.funding/);
  assert.match(js, /customer\.fields\.website/);
  assert.match(data, /key:\s*"website"/);
});

test("customer rows expose one full-row navigation target without covering row actions", () => {
  const js = read("app.js");
  const css = read("style.css");
  const row = js.slice(js.indexOf("function renderCustomerRow"), js.indexOf("function openCustomer"));
  assert.match(row, /class="customer-cell identity-cell"[^>]*data-action="open-customer"/);
  assert.match(row, /class="report-mini"[^>]*data-action="open-report"/);
  assert.match(row, /summary data-action="toggle-row-menu"/);
  assert.match(css, /\.customer-row\s*\{[^}]*position:relative[^}]*cursor:pointer/);
  assert.match(css, /\.identity-cell::after\s*\{[^}]*position:absolute[^}]*inset:0/);
  assert.match(css, /\.customer-row>\.row-actions\s*\{[^}]*z-index:2[^}]*pointer-events:none/);
  assert.match(css, /\.customer-row>\.row-actions>button,\.customer-row>\.row-actions>details\s*\{[^}]*pointer-events:auto/);
  assert.match(css, /\.identity-cell:focus-visible::after\s*\{[^}]*outline:2px/);
});

test("new customer creation captures website while keeping the default B grade", () => {
  const js = read("app.js");
  const source = js.slice(js.indexOf("function openNewCustomer"), js.indexOf("function openCustomerImport"));
  assert.match(source, /官方网站<input name="website"/);
  assert.doesNotMatch(source, /name="grade"/);
  assert.match(source, /grade:\s*"B"/);
  assert.match(source, /normalizeWebsiteUrl\(rawWebsite\)/);
  assert.match(source, /customer\.fields\.website\.v = website/);
  assert.match(source, /请输入有效的官方网站地址/);
  assert.doesNotMatch(source, /customer\.(?:website|domain)\s*=/);
});

test("customer detail is driven by a small set of confirmable Sales Buddy action cards", () => {
  const js = read("app.js");
  const css = read("style.css");
  const detail = js.slice(js.indexOf("function renderCustomerDetail"), js.indexOf("function renderStageTrack"));
  assert.match(detail, /renderGuidedActions\(customer\)/);
  assert.match(js, /现在建议做/);
  assert.match(js, /\.slice\(0,\s*3\)/);
  assert.match(js, /const mainAction = action\.kind === "meeting" \? "open-meeting-card" : "open-guided-confirm"/);
  assert.match(js, /data-action="\$\{mainAction\}"/);
  assert.match(js, /data-action="defer-guided-action"/);
  assert.match(js, /data-action="dismiss-guided-action"/);
  assert.match(js, /data-form="meeting-prep"/);
  assert.match(js, /customer\.meetingPreps\.push/);
  assert.match(css, /\.guided-action-primary\s*\{/);
  assert.match(css, /\.guided-action-options\s*\{/);
});

test("customer detail keeps stage progression above guided actions in a contained header layout", () => {
  const js = read("app.js");
  const css = read("style.css");
  const detail = js.slice(js.indexOf("function renderCustomerDetail"), js.indexOf("function renderGuidedActions"));
  assert.ok(detail.indexOf('class="customer-control-bar"') < detail.indexOf("renderGuidedActions(customer)"));
  assert.match(css, /\.customer-summary-header\s*\{[^}]*display:grid/);
  assert.match(css, /\.customer-summary-header\s*\{[^}]*background:var\(--surface\)/);
  assert.match(css, /\.customer-facts\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test("guided confirmations open editable forms and persist confirmed customer facts", () => {
  const js = read("app.js");
  assert.match(js, /action === "open-guided-confirm"/);
  assert.match(js, /data-form="guided-confirm"/);
  assert.match(js, /function openGuidedConfirmation\(customerId, key\)/);
  assert.match(js, /function submitGuidedConfirmation\(form\)/);
  assert.match(js, /customer\.painPoints\[0\]/);
  assert.match(js, /customer\.orgChain\.push/);
  assert.match(js, /customer\.guidedConfirmations\[key\]/);
  assert.match(js, /customer\.guidedActions\[key\] = \{ status: "resolved"/);
});

test("saved meeting prep cards return to the customer workspace and remain editable", () => {
  const js = read("app.js");
  const css = read("style.css");
  const overview = js.slice(js.indexOf("function renderOverview"), js.indexOf("function renderCompactContact"));
  assert.match(overview, /renderMeetingPrepArchive\(customer\)/);
  assert.match(js, /function renderMeetingPrepArchive\(customer\)/);
  assert.match(js, /data-prep="\$\{safe\(prep\.id\)\}"/);
  assert.match(js, /function openMeetingPrep\(customerId, prepId = ""\)/);
  assert.match(js, /customer\.meetingPreps\.find\(item => item\.id === prepId\)/);
  assert.match(js, /existing \? Object\.assign\(existing, record\) : customer\.meetingPreps\.push\(record\)/);
  assert.match(css, /\.meeting-prep-archive\s*\{/);
});

test("phase one exposes a six-dimension opportunity diagnosis that sales can calibrate", () => {
  const js = read("app.js");
  const css = read("style.css");
  assert.match(js, /const OPPORTUNITY_DIMENSIONS = \[/);
  for (const label of ["痛苦", "权力", "构想", "价值", "控制", "里程碑"]) assert.match(js, new RegExp(label));
  assert.match(js, /renderOpportunityDiagnosis\(customer\)/);
  assert.match(js, /data-action="edit-opportunity-diagnosis"/);
  assert.match(js, /data-form="opportunity-diagnosis"/);
  assert.match(js, /customer\.opportunityDiagnosis =/);
  assert.match(js, /function renderDiagnosisRadar\(diagnosis\)/);
  assert.match(js, /class="diagnosis-radar"/);
  assert.match(js, /<polygon/);
  assert.match(css, /\.opportunity-diagnosis\s*\{/);
  assert.match(css, /\.diagnosis-visual\s*\{/);
  assert.match(css, /\.diagnosis-radar\s*\{/);
  assert.match(css, /\.diagnosis-visual\s*\{[^}]*grid-template-columns:minmax\(0,/);
  assert.match(css, /\.diagnosis-radar\s*\{[^}]*overflow:hidden/);
});

test("customer overview follows the approved business-first reading order", () => {
  const js = read("app.js");
  const css = read("style.css");
  const overview = js.slice(js.indexOf("function renderOverview"), js.indexOf("function inferOpportunityDiagnosis"));
  const summary = overview.indexOf('class="panel overview-summary"');
  const recent = overview.indexOf('class="panel recent-progress-panel"');
  const business = overview.indexOf("renderBusinessBrief(customer)");
  const relations = overview.indexOf('class="panel overview-relations-panel"');
  const pain = overview.indexOf('class="panel overview-pain-solution-panel"');
  const diagnosis = overview.indexOf("renderOpportunityDiagnosis(customer)");
  assert.ok(summary > 0 && recent > summary && business > recent && relations > business && pain > relations && diagnosis > pain);
  assert.doesNotMatch(overview, /recent-progress-panel wide-panel/);
  assert.match(js, /class="panel opportunity-diagnosis wide-panel"/);
  assert.match(css, /\.overview-grid\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)[^}]*align-items:stretch/);
  assert.match(css, /\.recent-progress-panel,\.overview-pain-solution-panel\s*\{[^}]*min-height:0[^}]*height:auto[^}]*align-self:stretch/);
  assert.doesNotMatch(css, /\.recent-progress-panel\s*\{[^}]*min-height:250px/);
  assert.match(css, /\.opportunity-diagnosis\.wide-panel \.diagnosis-visual/);
  assert.match(css, /@media\s*\(max-width:680px\)[\s\S]*?\.opportunity-diagnosis\.wide-panel \.diagnosis-visual\s*\{[^}]*grid-template-columns:1fr/);
});

test("phase one includes an editable product and business model brief", () => {
  const js = read("app.js");
  const css = read("style.css");
  assert.match(js, /renderBusinessBrief\(customer\)/);
  assert.match(js, /data-action="edit-business-brief"/);
  assert.match(js, /data-form="business-brief"/);
  assert.match(js, /customer\.businessBrief =/);
  assert.match(js, /核心产品|赚钱逻辑|经营状况|相似竞品/);
  assert.match(css, /\.business-brief\s*\{/);
});

test("phase one closes the loop with a meeting-linked post-meeting confirmation", () => {
  const js = read("app.js");
  assert.match(js, /data-action="open-meeting-review"/);
  assert.match(js, /data-form="meeting-review"/);
  assert.match(js, /customer\.meetingReviews\.push/);
  assert.match(js, /prep\.status = "completed"/);
  assert.match(js, /source: "meeting-review"/);
  assert.match(js, /weakDimensions/);
});

test("phase two groups global news and hiring into an editable external signal workspace", () => {
  const js = read("app.js");
  const css = read("style.css");
  assert.match(js, /\["signals", "外部信号"\]/);
  assert.match(js, /function renderExternalSignals\(customer\)/);
  assert.match(js, /全球新闻/);
  assert.match(js, /招聘动向/);
  assert.match(js, /data-action="add-market-news"/);
  assert.match(js, /data-action="add-hiring-signal"/);
  assert.match(js, /data-form="market-news"/);
  assert.match(js, /data-form="hiring-signal"/);
  assert.match(js, /customer\.marketNews\.push/);
  assert.match(js, /customer\.hiringSignals\.push/);
  assert.match(css, /\.external-signal-grid\s*\{/);
});

test("phase two renders an editable pain chain and joint work plan", () => {
  const js = read("app.js");
  const css = read("style.css");
  const overview = js.slice(js.indexOf("function renderOverview"), js.indexOf("function inferOpportunityDiagnosis"));
  assert.match(overview, /renderPainChain\(customer\)/);
  assert.match(overview, /renderJointWorkPlan\(customer\)/);
  assert.match(js, /function openPainChain\(customerId\)/);
  assert.match(js, /data-form="pain-chain"/);
  assert.match(js, /customer\.painChain =/);
  assert.match(js, /function openWorkPlanItem\(customerId, itemId = ""\)/);
  assert.match(js, /data-form="work-plan"/);
  assert.match(js, /customer\.jointWorkPlan\.push/);
  assert.match(css, /\.pain-chain-flow\s*\{/);
  assert.match(css, /\.joint-plan-list\s*\{/);
});

test("company avatars are removed from customer business surfaces", () => {
  const js = read("app.js");
  const css = read("style.css");
  for (const renderer of ["renderPulseItem", "renderCustomerRow", "renderCustomerDetail"]) {
    const start = js.indexOf(`function ${renderer}`);
    const end = js.indexOf("\nfunction ", start + 10);
    assert.doesNotMatch(js.slice(start, end), /avatar\(customer|avatar\(item\.customer/);
  }
  assert.doesNotMatch(css, /\.customer-avatar\s*\{/);
});

test("phase three provides an editable negotiation assistant with give-get discipline", () => {
  const js = read("app.js");
  const css = read("style.css");
  assert.match(js, /\["closing", "成交工具"\]/);
  assert.match(js, /function renderClosingWorkspace\(customer\)/);
  assert.match(js, /function renderNegotiationAssistant\(customer\)/);
  assert.match(js, /data-action="edit-negotiation-brief"/);
  assert.match(js, /data-form="negotiation-brief"/);
  assert.match(js, /customer\.negotiationBrief =/);
  for (const label of ["目标结果", "必须守住", "可以交换", "交换条件", "红线"]) assert.match(js, new RegExp(label));
  assert.match(css, /\.negotiation-board\s*\{/);
  assert.match(css, /\.negotiation-lanes\s*\{/);
});

test("phase three generates, saves, copies, and downloads complete sales assets", () => {
  const js = read("app.js");
  const css = read("style.css");
  assert.match(js, /const SALES_ASSET_TYPES = \[/);
  for (const label of ["客户一页纸", "会后跟进邮件", "方案大纲", "谈判作战卡"]) assert.match(js, new RegExp(label));
  assert.match(js, /function buildSalesAssetContent\(customer, type\)/);
  assert.match(js, /function generateSalesAsset\(customerId, type\)/);
  assert.match(js, /customer\.salesAssets\.unshift/);
  assert.match(js, /action === "copy-sales-asset"/);
  assert.match(js, /action === "download-sales-asset"/);
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.match(js, /downloadTextFile/);
  assert.match(css, /\.sales-asset-studio\s*\{/);
  assert.match(css, /\.sales-asset-grid\s*\{/);
});

test("customer stages use a clickable roadmap with a moving penguin instead of a dropdown", () => {
  const js = read("app.js");
  const css = read("style.css");
  const detail = js.slice(js.indexOf("function renderCustomerDetail"), js.indexOf("function renderCustomerTab"));
  assert.match(detail, /renderStageTrack\(customer\)/);
  assert.doesNotMatch(detail, /renderChoiceControl\(customer, "stage"\)/);
  assert.match(detail, /class="stage-step[\s\S]*data-action="set-stage"/);
  assert.match(detail, /class="stage-penguin stage-penguin--/);
  assert.match(js, /animateStagePenguin\(customerId, previousStage, stage\)/);
  assert.match(detail, /stage-step--lost/);
  assert.match(detail, /customer\.stage === "lost" \? pipelineStages\.findIndex\(stage => stage\.key === "proposal"\) : currentIndex/);
  assert.match(css, /\.stage-penguin\.is-moving \.pg-img/);
  assert.match(css, /prefers-reduced-motion:reduce[\s\S]*\.stage-penguin/);
});

test("each customer stage uses its approved penguin pose", () => {
  const { api } = loadWorkspaceTestApi();
  const expected = {
    lead: "search",
    contact: "wave",
    meeting: "stand",
    proposal: "scratch",
    won: "success",
    lost: "lost",
  };

  for (const [stage, pose] of Object.entries(expected)) {
    assert.equal(api.stagePenguinPose(stage), pose);
  }
  assert.match(api.penguinSVG("lost"), /assets\/penguin\/lost\.png/);
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
  assert.match(css, /@keyframes\s+assistantBreath\s*\{[^}]*50%\s*\{[^}]*translateY\(-3px\)\s*scale\(1\.03\)/i);
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

test("report includes saved meeting preparation content without product copy", () => {
  const html = ReportBuilder.build({
    name: "启明科技",
    meetingPreps: [{
      createdAt: "2026-07-18 09:30",
      objective: "确认海外业务的真实优先级",
      focus: ["今年海外收入目标是多少？", "预算由谁最终审批？"],
      hook: "下次带海外节点延迟测试方案",
      notes: "重点关注东南亚市场",
    }],
  }, reportContext);

  assert.match(html, /会前沟通准备/);
  assert.match(html, /确认海外业务的真实优先级/);
  assert.match(html, /今年海外收入目标是多少/);
  assert.match(html, /下次带海外节点延迟测试方案/);
  assert.doesNotMatch(html, /Sales Buddy|AI|自动生成/);
});

test("report retains salesperson confirmation notes for pain and decision process", () => {
  const html = ReportBuilder.build({
    name: "启明科技",
    painPoints: [{ v: "海外访问延迟影响付费转化" }],
    guidedConfirmations: {
      "confirm-pain": { note: "客户 CTO 在会议中明确确认" },
      "confirm-power": { note: "CTO 技术评估，CEO 审批预算" },
    },
  }, reportContext);

  assert.match(html, /客户确认依据：客户 CTO 在会议中明确确认/);
  assert.match(html, /决策流程确认：CTO 技术评估，CEO 审批预算/);
});

test("report includes phase-one diagnosis, business brief, and post-meeting confirmation", () => {
  const html = ReportBuilder.build({
    name: "启明科技",
    opportunityDiagnosis: {
      pain: 8, power: 6, vision: 5, value: 4, control: 3, milestone: 7,
      note: "价值量化仍需客户确认",
    },
    businessBrief: {
      products: "海外社交应用",
      revenueLogic: "订阅与广告收入",
      operatingStatus: "海外收入快速增长",
      competitors: "竞品甲、竞品乙",
    },
    meetingReviews: [{
      createdAt: "2026-07-19 14:00",
      summary: "客户确认海外访问体验影响付费",
      confirmed: "预算由 CEO 审批",
      hookResult: "同意下周进行技术评审",
      next: "发送延迟测试方案",
    }],
  }, reportContext);

  assert.match(html, /六维机会诊断/);
  assert.match(html, /痛苦：8\/10/);
  assert.match(html, /产品与商业模式简报/);
  assert.match(html, /订阅与广告收入/);
  assert.match(html, /会后确认/);
  assert.match(html, /同意下周进行技术评审/);
});

test("report includes phase-two external signals, pain chain, and joint work plan", () => {
  const html = ReportBuilder.build({
    name: "启明科技",
    marketNews: [{ title: "海外产品完成新一轮融资", publishedAt: "2026-07-18", market: "北美", signal: "海外扩张提速", impact: "需要评估海外基础设施", sourceUrl: "https://example.com/news" }],
    hiringSignals: [{ role: "海外社区运营", location: "新加坡", postedAt: "2026-07-17", signal: "正在建立海外运营团队", opportunity: "全球网络与合规可作为切入点" }],
    painChain: { signal: "海外团队快速扩张", pain: "跨区访问不稳定", impact: "影响协同和上线效率", solution: "全球加速与海外节点", question: "是否愿意共同做一轮跨区实测？" },
    jointWorkPlan: [{ title: "完成海外延迟 PoC", ourOwner: "客户经理", customerOwner: "CTO", dueDate: "2026-07-30", deliverable: "三地延迟对比报告", status: "doing" }],
  }, reportContext);

  for (const expected of ["外部市场与招聘信号", "海外产品完成新一轮融资", "海外社区运营", "机会痛苦链", "跨区访问不稳定", "联合工作计划", "三地延迟对比报告"]) {
    assert.match(html, new RegExp(expected));
  }
});

test("report includes the confirmed negotiation brief without duplicating generated assets", () => {
  const html = ReportBuilder.build({
    name: "启明科技",
    negotiationBrief: {
      objective: "签署海外加速 PoC",
      customerPosition: "希望先免费测试并锁定折扣",
      valueAnchor: "降低核心地区延迟并保障开服稳定",
      mustHave: "明确成功标准和付费转正式条件",
      flexible: "可提供有限测试资源",
      giveGet: "提供测试资源，换取 CTO 评审和采购时间表",
      redLine: "不承诺无限期免费资源",
      objections: "担心迁移风险和长期成本",
      response: "先以旁路小流量验证，达标后再扩大范围",
      closeAction: "确认 PoC 负责人和启动日期",
    },
    salesAssets: [{ type: "followup-email", title: "会后跟进邮件", content: "这段内容不应重复进入全景报告" }],
  }, reportContext);

  assert.match(html, /谈判与成交策略/);
  assert.match(html, /签署海外加速 PoC/);
  assert.match(html, /提供测试资源，换取 CTO 评审和采购时间表/);
  assert.doesNotMatch(html, /这段内容不应重复进入全景报告/);
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
  assert.match(js, /return builder\.build\(reportSource,\s*\{/);
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

  assert.match(css, /\.customer-row>\.muted-cell:nth-child\(3\)\s*\{[^}]*display:\s*flex/i);
  assert.match(css, /\.customer-row>\.muted-cell:nth-child\(5\)\s*\{[^}]*display:\s*flex/i);
  assert.match(css, /\.customer-row>\.next-cell\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/i);
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

test("approved mascot poses render their complete files without CSS cropping", () => {
  const css = read("style.css");
  const js = read("app.js");

  assert.match(css, /\.pg-img\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*object-fit:\s*contain/i);
  assert.match(css, /\.qq-penguin--brand\s*\{[^}]*width:\s*48px[^}]*height:\s*48px/i);
  assert.match(css, /\.qq-penguin--assistant\s*\{[^}]*width:\s*64px[^}]*height:\s*64px/i);
  assert.match(js, /return `<img class="pg-img" src="assets\/penguin\/\$\{p\}\.png"/);
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

test("completed tasks can be restored without losing their content", () => {
  const { api } = loadFinalFixApi();
  const customer = { notes: [{ id: "n1", next: "提交方案", nextDate: "2026-07-20", taskDone: false }] };
  const completed = api.applyTaskCompletion(customer, "n1", true, "2026-07-17 15:00");
  assert.equal(completed.taskDone, true);
  assert.equal(completed.completedAt, "2026-07-17 15:00");
  const restored = api.applyTaskCompletion(customer, "n1", false);
  assert.equal(restored.taskDone, false);
  assert.equal("completedAt" in restored, false);
  assert.equal(restored.next, "提交方案");
  assert.match(read("app.js"), /data-action="\$\{taskAction\}"[\s\S]*取消完成/);
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

test("cloud upload metadata survives makeAsset and always refreshes before evidence open", async () => {
  const uploadTempCalls = [];
  const engine = loadAssetEngineApi({
    uploadFile: async ({ cloudPath }) => ({ fileID: "cloud://bucket/uploaded.pdf", cloudPath }),
    getTempFileURL: async ({ fileList }) => {
      uploadTempCalls.push(...fileList);
      return { fileList: [{ tempFileURL: "https://expired.example.com/uploaded.pdf" }] };
    },
  });
  const meta = await engine._uploadToCloud({ name: "uploaded.pdf", size: 42, type: "application/pdf" });
  const asset = engine.makeAsset("file", meta, { caption: "云端证据" });
  assert.equal(asset.fileID, "cloud://bucket/uploaded.pdf");
  assert.match(asset.cloudPath, /^evidence\/user-1\//);
  assert.equal(asset.dataUrl, "https://expired.example.com/uploaded.pdf");

  const refreshCalls = [];
  const harness = loadEvidenceOpenApi({ cloudEnabled: true, getTempFileURL: async ({ fileList }) => {
    refreshCalls.push(...fileList);
    return { fileList: [{ tempFileURL: "https://fresh.example.com/uploaded.pdf" }] };
  } });
  harness.api.setCustomers([{ id: "c1", assets: [{ ...asset, id: "a1" }] }]);
  await harness.api.openEvidenceAsset("c1", "a1");
  assert.deepEqual(refreshCalls, ["cloud://bucket/uploaded.pdf"]);
  assert.deepEqual(harness.opened, ["https://fresh.example.com/uploaded.pdf"]);
  assert.equal(harness.opened.includes("https://expired.example.com/uploaded.pdf"), false);

  const cloudPathAsset = engine.makeAsset("file", { cloudPath: "evidence/user-1/path-only.pdf", dataUrl: "https://expired.example.com/path.pdf", name: "path.pdf" });
  assert.equal(cloudPathAsset.cloudPath, "evidence/user-1/path-only.pdf");
  assert.equal(harness.api.evidenceOpenTarget(cloudPathAsset).kind, "cloud");
  harness.api.setCustomers([{ id: "c1", assets: [{ ...cloudPathAsset, id: "path" }] }]);
  await harness.api.openEvidenceAsset("c1", "path");
  assert.deepEqual(refreshCalls, ["cloud://bucket/uploaded.pdf", "evidence/user-1/path-only.pdf"]);
  assert.deepEqual(harness.opened, ["https://fresh.example.com/uploaded.pdf", "https://fresh.example.com/uploaded.pdf"]);
  assert.equal(harness.api.evidenceOpenTarget({ id: "old", dataUrl: "https://legacy.example.com/local.pdf" }).kind, "open");
  assert.equal(harness.api.evidenceOpenTarget({ id: "local", name: "local.pdf", size: 10 }).kind, "unavailable");
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

test("account API, import module, and SheetJS load before the application runtime", () => {
  const html = read("index.html");
  const api = html.indexOf('src="api-client.js"');
  const importer = html.indexOf('src="customer-import.js"');
  const auth = html.indexOf('src="auth.js"');
  const sheet = html.indexOf("xlsx.full.min.js");
  const app = html.indexOf('src="app.js"');
  assert.ok(api > 0 && importer > api && auth > importer && sheet > auth && app > sheet);
  assert.match(html, /id="currentUserName"/);
  assert.match(html, /data-action="logout"/);
});

test("customer workspace exposes validated CSV and Excel batch import", () => {
  const js = read("app.js");
  assert.match(js, /data-action="import-customers"/);
  assert.match(js, /accept="\.csv,\.tsv,\.xlsx,\.xls/);
  assert.match(js, /CustomerImporter\.importRows\(customerImportRows, customers/);
  assert.match(js, /XLSX\.utils\.sheet_to_json/);
  assert.match(js, /下载 CSV 模板/);
  assert.match(js, /新增 \$\{result\.imported\}，更新 \$\{result\.updated\}/);
});

test("authentication coordinates API login while CRM sync remains user-scoped", () => {
  const auth = read("auth.js");
  const crm = read("crm.js");
  const app = read("app.js");
  assert.match(auth, /SalesAPI\.register/);
  assert.match(auth, /SalesAPI\.login/);
  assert.match(auth, /const AuthCoordinator/);
  assert.match(crm, /ApiAuth\._mirrorKey\(\)/);
  assert.match(crm, /SalesAPI\.saveCustomers\(/);
  assert.match(app, /SalesAPI\.extractAI/);
  assert.match(app, /AI API 尚未配置，已使用本地规则整理/);
});
