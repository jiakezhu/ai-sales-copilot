// 云销副驾 · 产品重构版
// 核心链路：AI / 语音 / 手动采集 → 销售确认 → 客户全流程沉淀 → 一键全景报告

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const safe = (value) => String(value == null ? "" : value).replace(/[&<>\"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const icon = (name, className = "") => `<i data-lucide="${name}"${className ? ` class="${className}"` : ""}></i>`;
const DIALOG_FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

let customers = [];
let reportCustomer = null;
let toastTimer = null;
let assistantStateTimer = null;
let currentAssistantState = "idle";
let modalReturnFocus = null;
let reportReturnFocus = null;
const trustedEvidenceBlobUrls = new Set();

const state = {
  page: "today",
  customerId: null,
  customerTab: "overview",
  query: "",
  stageFilter: "all",
  aiDraft: null,
  copilotAttachments: [],
  recording: false,
};

const NAV_ITEMS = [
  { key: "today", label: "今日", icon: "house" },
  { key: "customers", label: "客户", icon: "building-2" },
  { key: "tasks", label: "待办", icon: "circle-check" },
  { key: "analytics", label: "分析", icon: "chart-no-axes-column-increasing" },
];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  initTheme();
  try {
    if (typeof CloudAuth !== "undefined" && CloudAuth.boot) await CloudAuth.boot();
  } catch (error) {
    console.warn("Cloud boot unavailable, using local data", error);
  }
  customers = CRM.load().map(ensureCustomerShape);
  fillStaticPenguins();
  bindAppEvents();
  renderApp();
}

// 把 HTML 里 [data-penguin] 占位符填充为对应姿态的 SVG 企鹅
function fillStaticPenguins() {
  document.querySelectorAll("[data-penguin]").forEach(el => {
    if (el.dataset.penguinDone) return;
    el.innerHTML = penguinSVG(el.dataset.penguin || "stand");
    el.dataset.penguinDone = "1";
  });
}

function ensureCustomerShape(customer) {
  customer.fields ||= {};
  FIELD_DEFS.forEach(def => customer.fields[def.key] ||= { v: "" });
  customer.notes ||= [];
  customer.assets ||= [];
  customer.orgChain ||= [];
  customer.painPoints ||= [];
  customer.solution ||= [];
  customer.funnel ||= { reached: 0, connected: 0, meeting: 0, proposal: 0, won: 0 };
  customer.stageHistory ||= [{ stage: customer.stage || "lead", date: customer.notes.at(-1)?.date || todayStr(), note: "当前阶段" }];
  customer.notes.forEach(note => { if (typeof note.taskDone !== "boolean") note.taskDone = false; });
  return customer;
}

function persist(message) {
  CRM.save(customers);
  if (message) toast(message);
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.dataset.theme = saved;
}

function bindAppEvents() {
  document.addEventListener("click", handleAction);
  document.addEventListener("change", handleChange);
  document.addEventListener("submit", handleSubmit);

  $("#globalSearch").addEventListener("input", event => {
    state.query = event.target.value.trim().toLowerCase();
    if (state.query) {
      state.page = "customers";
      state.customerId = null;
    }
    renderApp();
  });

  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      $("#globalSearch").focus();
    }
    if (event.key === "Tab" && trapDialogFocus(event)) return;
    if (event.key !== "Escape") return;
    if (!$("#reportLayer")?.classList.contains("hidden")) return closeReport();
    if (!$("#modalLayer")?.classList.contains("hidden")) return closeModal();
    closeChoiceMenus();
    closeRowMenus(undefined, true);
  });
}

async function handleAction(event) {
  const trigger = prepareRowMenusForAction(event);
  if (!trigger) { closeChoiceMenus(); return; }
  const action = trigger.dataset.action;

  if (action === "nav") return navigate(trigger.dataset.page);
  if (action === "go-today") return navigate("today");
  if (action === "theme") return toggleTheme();
  if (action === "new-customer") return openNewCustomer();
  if (action === "manual-entry") return openManualEntry(trigger.dataset.customer || state.customerId);
  if (action === "edit-note") return openManualEntry(trigger.dataset.customer, trigger.dataset.note);
  if (action === "remove-note") return deleteProgressNote(trigger.dataset.customer, trigger.dataset.note);
  if (action === "focus-copilot") return focusCopilot();
  if (action === "analyze-ai") return analyzeCopilot();
  if (action === "voice") return startVoiceCapture(trigger);
  if (action === "confirm-ai") return confirmAIDraft();
  if (action === "discard-ai") return discardAIDraft();
  if (action === "open-customer") return openCustomer(trigger.dataset.id);
  if (action === "customer-tab") return switchCustomerTab(trigger.dataset.tab);
  if (action === "back-customers") { state.customerId = null; return renderApp(); }
  if (action === "complete-task") return completeTask(trigger.dataset.customer, trigger.dataset.note);
  if (action === "open-report") return openReport(trigger.dataset.id || state.customerId);
  if (action === "close-report") return closeReport();
  if (action === "export-pdf") return window.print();
  if (action === "export-word") return exportWordReport();
  if (action === "close-modal") return closeModal();
  if (action === "add-contact") return openContactForm(trigger.dataset.customer || state.customerId);
  if (action === "edit-contact") return openContactForm(trigger.dataset.customer, trigger.dataset.contact);
  if (action === "add-pain") return openPainForm(trigger.dataset.customer || state.customerId);
  if (action === "add-solution") return openSolutionForm(trigger.dataset.customer || state.customerId);
  if (action === "remove-pain") return removePain(trigger.dataset.customer, Number(trigger.dataset.index));
  if (action === "remove-contact") return removeContact(trigger.dataset.customer, trigger.dataset.contact);
  if (action === "open-asset") return openEvidenceAsset(trigger.dataset.customer, trigger.dataset.asset);
  if (action === "remove-asset") return deleteEvidenceAsset(trigger.dataset.customer, trigger.dataset.asset);
  if (action === "toggle-choice") return toggleChoiceMenu(trigger);
  if (action === "toggle-row-menu") return;
  if (action === "set-stage") { closeChoiceMenus(); return updateCustomerStage(trigger.dataset.customer, trigger.dataset.value); }
  if (action === "set-grade") { closeChoiceMenus(); return updateCustomerGrade(trigger.dataset.customer, trigger.dataset.value); }
  if (action === "filter-stage") { state.stageFilter = trigger.dataset.value; return renderApp(); }
  if (action === "reset-filters") { state.query = ""; state.stageFilter = "all"; $("#globalSearch").value = ""; return renderApp(); }
}

async function handleChange(event) {
  const target = event.target;
  if (target.id === "stageFilter") {
    state.stageFilter = target.value;
    return renderApp();
  }
  if (target.matches("[data-customer-stage]")) return updateCustomerStage(target.dataset.customerStage, target.value);
  if (target.matches("[data-customer-grade]")) return updateCustomerGrade(target.dataset.customerGrade, target.value);
  if (target.matches("[data-intel-field]")) return updateIntelField(target);
  if (target.id === "copilotFiles") return handleCopilotFiles(target.files);
  if (target.id === "aiTargetSelect" && state.aiDraft) {
    state.aiDraft.customerId = target.value;
    renderAIDraft();
  }
}

async function handleSubmit(event) {
  if (!event.target.matches("[data-form]")) return;
  event.preventDefault();
  const type = event.target.dataset.form;
  if (type === "new-customer") return submitNewCustomer(event.target);
  if (type === "manual-entry") return submitManualEntry(event.target);
  if (type === "contact") return submitContact(event.target);
  if (type === "pain") return submitPain(event.target);
  if (type === "solution") return submitSolution(event.target);
}

function navigate(page) {
  state.page = page;
  state.customerId = null;
  state.customerTab = "overview";
  renderApp();
  $("#pageRoot").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderApp() {
  renderNavigation();
  const root = $("#pageRoot");
  if (state.page === "today") root.innerHTML = renderToday();
  if (state.page === "customers") root.innerHTML = state.customerId ? renderCustomerDetail(getCustomer(state.customerId)) : renderCustomers();
  if (state.page === "tasks") root.innerHTML = renderTasks();
  if (state.page === "analytics") root.innerHTML = renderAnalytics();
  if (state.aiDraft && state.page === "today") renderAIDraft();
  reconcileAssistantState();
  refreshIcons();
}

function renderNavigation() {
  const taskCount = getTasks().filter(task => !task.done).length;
  const html = NAV_ITEMS.map(item => `
    <button class="nav-item ${state.page === item.key ? "active" : ""}" data-action="nav" data-page="${item.key}">
      <span class="nav-icon">${icon(item.icon)}</span><span>${item.label}</span>${item.key === "tasks" && taskCount ? `<em>${taskCount}</em>` : ""}
    </button>`).join("");
  $("#primaryNav").innerHTML = html;
  $("#mobileNav").innerHTML = html;
  $("#themeToggle").dataset.action = "theme";
}

function renderToday() {
  const tasks = getTasks().filter(task => !task.done);
  const overdue = tasks.filter(task => task.overdue);
  const priority = tasks.sort(taskPriority).slice(0, 4);
  const stale = customers
    .map(customer => ({ customer, days: daysSince(lastActivityDate(customer)) }))
    .filter(item => item.days >= 14 && ["S", "A"].includes(item.customer.grade))
    .sort((a, b) => b.days - a.days);

  return `
    <div class="page today-page">
      <header class="today-command">
        <div><p class="eyebrow">${formatLongDate(new Date())}</p><h1>早上好，先推进最重要的客户</h1><p>商务鹅帮你整理信息，你负责确认和决策。</p></div>
        <button class="td-button td-button--outline" data-action="manual-entry">${icon("square-pen")} 手动记录</button>
      </header>
      <section class="ai-assistant-card" id="copilotCard">
        <span class="qq-penguin qq-penguin--assistant" aria-hidden="true">${penguinSVG("wave")}</span>
        <div class="ai-assistant-copy"><span>商务鹅</span><h2>刚发生了什么？说给商务鹅听</h2><p>会议、电话、微信和材料，随口一说就整理成客户推进记录。</p></div>
        <div class="ai-compose">${renderCopilotComposer()}</div>
        <div id="aiDraft"></div>
      </section>
      <div class="today-layout">
        <section class="today-action-list">
          <div class="td-panel">${renderTodayActions(priority, overdue)}</div>
        </section>
        <aside class="account-signal-list">
          <div class="td-panel">${renderCustomerSignals(stale)}</div>
        </aside>
      </div>
    </div>`;
}

function renderCopilotComposer() {
  return `<div class="copilot-compose">
    <textarea id="copilotInput" rows="3" placeholder="例如：刚和星澜互娱王工通了电话，对方担心海外延迟。下周三发 GAAP 对比方案，并提醒我跟进。"></textarea>
    <div class="compose-actions">
      <label class="attach-button" title="附加资料"><input id="copilotFiles" type="file" multiple hidden />${icon("paperclip")} 资料</label>
      <button class="voice-button" data-action="voice" aria-label="语音输入">${icon("mic")} 语音</button>
      <span class="compose-hint">AI 只提取明确出现的信息</span>
      <button class="primary-button" data-action="analyze-ai">识别并整理 ${icon("arrow-right")}</button>
    </div>
  </div><div id="copilotFileStatus" class="copilot-file-status" aria-live="polite">${copilotFileStatusMarkup()}</div>`;
}

function copilotFileStatusMarkup() {
  if (!state.copilotAttachments.length) return "";
  return `<span class="copilot-file-label">${icon("paperclip")} 已关联 ${state.copilotAttachments.length} 份资料</span>${state.copilotAttachments.map(attachment => `<span class="copilot-file-chip" title="${safe(attachment.mime || "文件")}">${safe(attachment.name)} · ${formatFileSize(attachment.size)}</span>`).join("")}`;
}

function renderTodayActions(priority, overdue) {
  return `<div class="section-heading"><div><p class="eyebrow">NEXT ACTION</p><h2>优先行动</h2></div><button class="text-button" data-action="nav" data-page="tasks">${overdue.length ? `${overdue.length} 项逾期 · ` : ""}查看全部 →</button></div>
    <div class="priority-list">
      ${priority.length ? priority.map(renderPriorityTask).join("") : emptyState("所有待办都处理完了", "可以记录一次新的客户触达。", "success")}
    </div>`;
}

function renderCustomerSignals(stale) {
  return `<div class="section-heading"><div><p class="eyebrow">ACCOUNT PULSE</p><h2>客户脉搏</h2></div><button class="text-button" data-action="nav" data-page="customers">全部客户 →</button></div>
    ${renderAccountPulse(stale)}`;
}

function renderPriorityTask(task) {
  return `<article class="priority-item">
    <button class="task-check" data-action="complete-task" data-customer="${task.customer.id}" data-note="${task.note.id}" aria-label="完成待办"></button>
    <button class="priority-main" data-action="open-customer" data-id="${task.customer.id}">
      <span class="priority-title">${safe(task.text)}</span>
      <span class="priority-meta"><b class="grade-dot grade-${task.customer.grade}">${task.customer.grade}</b>${safe(task.customer.name)} · ${safe(task.note.contact || "未指定联系人")}</span>
    </button>
    <span class="date-chip ${task.overdue ? "overdue" : task.today ? "today" : ""}">${task.overdue ? `逾期 ${Math.abs(task.days)} 天` : task.today ? "今天" : formatShortDate(task.date)}</span>
  </article>`;
}

function renderAccountPulse(stale) {
  const top = stale.slice(0, 3);
  if (!top.length) {
    const recent = customers.slice(0, 3).map(customer => ({ customer, days: daysSince(lastActivityDate(customer)) }));
    return `<div class="pulse-list">${recent.map(item => renderPulseItem(item, false)).join("")}</div>`;
  }
  return `<div class="pulse-alert">${icon("clock-alert")}<div><b>${top.length} 个重点客户需要重新触达</b><p>超过两周没有新增推进记录</p></div></div><div class="pulse-list">${top.map(item => renderPulseItem(item, true)).join("")}</div>`;
}

function renderPulseItem(item, stale) {
  const next = getNextTask(item.customer);
  return `<button class="pulse-item" data-action="open-customer" data-id="${item.customer.id}">
    ${avatar(item.customer)}<span><b>${safe(item.customer.name)}</b><small>${stageLabel(item.customer.stage)} · ${stale ? `${item.days} 天未更新` : (next ? `下一步：${safe(next.text)}` : "暂无待办")}</small></span>${icon("chevron-right")}
  </button>`;
}

function renderCustomers() {
  const filtered = customers.filter(customer => {
    const haystack = [customer.name, customer.fields.industry?.v, ...customer.orgChain.map(x => x.name)].join(" ").toLowerCase();
    return (!state.query || haystack.includes(state.query)) && (state.stageFilter === "all" || customer.stage === state.stageFilter);
  });
  return `<div class="page customers-page">
    <section class="page-heading">
      <div><p class="eyebrow">ACCOUNT WORKSPACE</p><h1>客户</h1><p>围绕下一步行动管理客户，而不是维护静态名单。</p></div>
      <button class="primary-button" data-action="new-customer">${icon("plus")} 新建客户</button>
    </section>
    <section class="filter-bar">
      <div class="filter-summary"><b>${filtered.length}</b> 个客户</div>
      <div class="stage-filter-chips"><span>阶段</span><button class="${state.stageFilter === "all" ? "active" : ""}" data-action="filter-stage" data-value="all">全部</button>${CRM_STAGES.map(s => `<button class="${state.stageFilter === s.key ? "active" : ""}" data-action="filter-stage" data-value="${s.key}">${s.label}</button>`).join("")}</div>
      ${(state.query || state.stageFilter !== "all") ? `<button class="text-button" data-action="reset-filters">清除筛选</button>` : ""}
    </section>
    <section class="td-panel customer-worktable">
      <div class="table-head"><span>客户</span><span>阶段</span><span>关键联系人</span><span>下一步</span><span>最近更新</span><span></span></div>
      <div class="table-body">${filtered.length ? filtered.map(renderCustomerRow).join("") : emptyState("没有匹配的客户", "换一个关键词或清除筛选。", "search")}</div>
    </section>
  </div>`;
}

function renderCustomerRow(customer) {
  const next = getNextTask(customer);
  const keyContact = customer.orgChain.find(p => /CEO|CTO|总监|负责人|VP/.test(p.role || "")) || customer.orgChain[0];
  return `<article class="customer-row">
    <button class="customer-cell identity-cell" data-action="open-customer" data-id="${customer.id}">${avatar(customer)}<span><b>${safe(customer.name)}</b><small>${safe(customer.fields.industry?.v || "行业未填写")} · ${customer.grade} 级</small></span></button>
    <span data-label="阶段"><b class="stage-pill stage-${customer.stage}">${stageLabel(customer.stage)}</b></span>
    <span class="muted-cell" data-label="关键联系人">${keyContact ? `<b>${safe(keyContact.name)}</b><small>${safe(keyContact.role)}</small>` : "待补充"}</span>
    <span class="next-cell ${next?.overdue ? "danger-text" : ""}" data-label="下一步">${next ? `<b>${safe(next.text)}</b><small>${next.overdue ? "已逾期" : formatShortDate(next.date)}</small>` : "暂无待办"}</span>
    <span class="muted-cell" data-label="最近更新">${formatRelative(lastActivityDate(customer))}</span>
    <span class="row-actions"><button class="report-mini" data-action="open-report" data-id="${customer.id}">${icon("file-text")} 生成报告</button><details class="row-more-actions"><summary data-action="toggle-row-menu" aria-label="更多客户操作">${icon("ellipsis")}</summary><button data-action="open-customer" data-id="${customer.id}">${icon("external-link")} 查看客户</button></details></span>
  </article>`;
}

function openCustomer(id) {
  state.page = "customers";
  state.customerId = id;
  state.customerTab = "overview";
  renderApp();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function switchCustomerTab(tab) {
  state.customerTab = tab;
  renderApp();
  const anchor = $(".detail-section-nav");
  if (anchor && window.scrollY > anchor.offsetTop) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCustomerDetail(customer) {
  if (!customer) return renderCustomers();
  const next = getNextTask(customer);
  const tabs = [
    ["overview", "作战概览"], ["timeline", "推进记录"], ["relations", "关键关系"], ["intel", "情报与证据"],
  ];
  return `<div class="page customer-detail">
    <button class="back-link" data-action="back-customers">${icon("arrow-left")} 返回客户列表</button>
    <header class="customer-summary-header">
      <div class="customer-title-group">${avatar(customer, "large")}<div><div class="title-line"><h1>${safe(customer.name)}</h1><b class="grade-badge grade-${customer.grade}">${customer.grade}</b></div><p>${safe(customer.fields.industry?.v || "行业未填写")} · 最近更新 ${formatRelative(lastActivityDate(customer))}</p></div></div>
      <div class="customer-hero-actions"><button class="secondary-button" data-action="manual-entry" data-customer="${customer.id}">${icon("square-pen")} 手动记录</button><button class="report-button" data-action="open-report" data-id="${customer.id}"><span>${icon("file-text")}</span><b>生成全景报告</b><small>汇总全部客户信息</small></button></div>
    </header>
    <section class="customer-control-bar">
      ${renderChoiceControl(customer, "stage")}
      <div class="stage-track">${CRM_STAGES.filter(s => s.key !== "lost").map((s, i) => `<span class="${stageIndex(customer.stage) >= i ? "done" : ""} ${customer.stage === s.key ? "current" : ""}"><i></i>${s.label}</span>`).join("")}</div>
      ${renderChoiceControl(customer, "grade")}
    </section>
    ${next ? `<section class="next-action-banner ${next.overdue ? "overdue" : ""}"><span class="next-icon">${icon("move-right")}</span><div><small>${next.overdue ? "当前最紧急 · 已逾期" : "下一步行动"}</small><b>${safe(next.text)}</b><p>${safe(next.note.contact || "未指定联系人")} · ${formatShortDate(next.date)}</p></div><button class="primary-button" data-action="complete-task" data-customer="${customer.id}" data-note="${next.note.id}">${icon("check")} 标记完成</button></section>` : ""}
    <nav class="detail-section-nav" aria-label="客户档案分区">${tabs.map(([key,label]) => `<button class="${state.customerTab === key ? "active" : ""}" data-action="customer-tab" data-tab="${key}" aria-current="${state.customerTab === key ? "page" : "false"}">${label}</button>`).join("")}</nav>
    <section class="customer-tab-content">${renderCustomerTab(customer)}</section>
  </div>`;
}

function renderChoiceControl(customer, type) {
  const isStage = type === "stage";
  const options = isStage ? CRM_STAGES : GRADES;
  const value = isStage ? customer.stage : customer.grade;
  const current = options.find(item => item.key === value) || options[0];
  const action = isStage ? "set-stage" : "set-grade";
  const label = isStage ? "销售阶段" : "客户优先级";
  const visual = isStage
    ? `<span class="choice-dot stage-dot-${safe(current.key)}"></span>`
    : `<span class="choice-grade grade-${safe(current.key)}">${safe(current.key)}</span>`;
  return `<div class="choice-field"><span class="choice-label">${label}</span><div class="choice-control">
    <button class="choice-trigger" data-action="toggle-choice" aria-haspopup="listbox" aria-expanded="false">${visual}<b>${safe(current.label)}</b>${icon("chevron-down")}</button>
    <div class="choice-menu" role="listbox">${options.map(item => {
      const itemVisual = isStage ? `<span class="choice-dot stage-dot-${safe(item.key)}"></span>` : `<span class="choice-grade grade-${safe(item.key)}">${safe(item.key)}</span>`;
      return `<button class="choice-option ${item.key === value ? "selected" : ""}" role="option" aria-selected="${item.key === value}" data-action="${action}" data-customer="${customer.id}" data-value="${safe(item.key)}">${itemVisual}<span>${safe(item.label)}</span>${item.key === value ? icon("check") : ""}</button>`;
    }).join("")}</div>
  </div></div>`;
}

function renderCustomerTab(customer) {
  if (state.customerTab === "timeline") return renderTimeline(customer);
  if (state.customerTab === "relations") return renderRelations(customer);
  if (state.customerTab === "intel") return renderIntelligence(customer);
  return renderOverview(customer);
}

function renderOverview(customer) {
  const recent = [...customer.notes].sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
  const contacts = customer.orgChain.slice(0, 3);
  const completeness = profileCompleteness(customer);
  return `<div class="overview-grid">
    <section class="panel overview-summary wide-panel">
      <div class="section-heading"><div><p class="eyebrow">ACCOUNT BRIEF</p><h2>作战摘要</h2></div><span class="health-score">档案完整度 ${completeness}%</span></div>
      <div class="brief-grid">
        <div><small>核心机会</small><p>${safe(customer.painPoints[0]?.v || "尚未明确核心痛点")}</p></div>
        <div><small>关系进展</small><p>${safe(customer.fields.relation?.v || "尚未补充客户关系")}</p></div>
        <div><small>上云现状</small><p>${safe(customer.fields.cloudStatus?.v || "尚未了解上云现状")}</p></div>
        <div><small>推荐切入</small><p>${safe(customer.solution[0]?.product || "待确认客户痛点后匹配方案")}</p></div>
      </div>
      ${customer.raidFile?.plan?.action ? `<div class="strategy-callout"><span>策略</span><p>${safe(customer.raidFile.plan.action)}</p></div>` : ""}
    </section>
    <section class="panel">
      <div class="section-heading"><h2>关键关系</h2><button class="text-button" data-action="customer-tab" data-tab="relations">查看关系图 ${icon("arrow-right")}</button></div>
      <div class="contact-stack">${contacts.length ? contacts.map(renderCompactContact).join("") : emptyState("还没有联系人", "先添加一个关键人。")}</div>
      <button class="soft-button full" data-action="add-contact" data-customer="${customer.id}">${icon("user-plus")} 添加联系人</button>
    </section>
    <section class="panel wide-panel">
      <div class="section-heading"><h2>最近推进</h2><button class="text-button" data-action="customer-tab" data-tab="timeline">查看全部 ${icon("arrow-right")}</button></div>
      <div class="mini-timeline">${recent.length ? recent.map(note => renderMiniTimeline(note)).join("") : emptyState("还没有推进记录", "记录第一次沟通。")}</div>
    </section>
    <section class="panel">
      <div class="section-heading"><h2>痛点与方案</h2><button class="text-button" data-action="customer-tab" data-tab="intel">编辑 ${icon("arrow-right")}</button></div>
      <div class="tag-list">${customer.painPoints.slice(0,3).map(p => `<span>${safe(p.v)}</span>`).join("") || `<span class="empty-tag">待补充痛点</span>`}</div>
      <div class="solution-preview">${customer.solution.slice(0,2).map(s => `<article><b>${safe(s.product)}</b><small>${safe(s.reason)}</small></article>`).join("") || `<p class="muted">补充痛点后再匹配方案。</p>`}</div>
    </section>
  </div>`;
}

function renderCompactContact(person) {
  return `<article class="compact-contact"><span class="person-avatar">${safe(person.name?.[0] || "人")}</span><div><b>${safe(person.name)}</b><small>${safe(person.role || "职位未填写")}</small></div><span class="relation-state">${person.note ? "已建联" : "待确认"}</span></article>`;
}

function renderMiniTimeline(note) {
  const method = methodMeta(note.method);
  return `<article><span class="timeline-dot" style="--dot:${method.color}">${icon(methodIconName(note.method))}</span><div><b>${safe(note.content)}</b><small>${safe(method.label)} · ${safe(note.contact || "未指定联系人")} · ${formatDateTime(note.date)}</small></div></article>`;
}

function renderTimeline(customer) {
  const notes = [...customer.notes].sort((a,b) => String(b.date).localeCompare(String(a.date)));
  return `<div class="content-layout">
    <section class="panel timeline-panel">
      <div class="section-heading"><div><p class="eyebrow">PROGRESS JOURNEY</p><h2>全流程客户推进记录</h2></div><button class="primary-button" data-action="manual-entry" data-customer="${customer.id}">${icon("plus")} 记录推进</button></div>
      <div class="full-timeline">${notes.length ? notes.map(note => renderTimelineItem(customer, note)).join("") : emptyState("还没有推进记录", "电话、会议、微信、材料与阶段变化都会沉淀在这里。")}</div>
    </section>
    <aside class="panel timeline-aside"><h3>${icon("workflow")} 推进记录会自动关联</h3><ul><li>联系人与沟通方式</li><li>下一步行动和提醒</li><li>阶段及情报变化</li><li>附件和佐证材料</li></ul><button class="soft-button full" data-action="focus-copilot">${icon("sparkles")} 用 AI 整理记录</button></aside>
  </div>`;
}

function renderTimelineItem(customer, note) {
  const method = methodMeta(note.method);
  return `<article class="timeline-item">
    <span class="timeline-marker" style="--dot:${method.color}">${icon(methodIconName(note.method))}</span>
    <div class="timeline-card"><div class="timeline-head"><span><b>${safe(method.label)}</b>${note.contact ? ` · ${safe(note.contact)}` : ""}</span><span class="timeline-head-side"><time>${formatDateTime(note.date)}</time><span class="timeline-actions"><button data-action="edit-note" data-customer="${customer.id}" data-note="${note.id}" aria-label="编辑推进记录">${icon("pencil")}</button><button data-action="remove-note" data-customer="${customer.id}" data-note="${note.id}" aria-label="删除推进记录">${icon("trash-2")}</button></span></span></div>${note.content ? `<p>${safe(note.content)}</p>` : ""}
      ${note.next ? `<div class="timeline-next ${note.taskDone ? "done" : ""}"><span>${icon(note.taskDone ? "check" : "arrow-right")} ${note.taskDone ? "已完成" : "下一步"}</span><b>${safe(note.next)}</b><time>${formatShortDate(note.nextDate)}</time></div>` : ""}
      ${note.attachments?.length ? `<div class="attachment-row">${note.attachments.map(a => `<span>${icon("paperclip")} ${safe(a.name)}</span>`).join("")}</div>` : ""}
    </div>
  </article>`;
}

function renderRelations(customer) {
  const roots = customer.orgChain.filter(person => !person.pid || !customer.orgChain.some(p => p.id === person.pid));
  return `<section class="panel relations-panel">
    <div class="section-heading"><div><p class="eyebrow">STAKEHOLDER MAP</p><h2>关键关系与决策链</h2></div><button class="primary-button" data-action="add-contact" data-customer="${customer.id}">${icon("user-plus")} 添加联系人</button></div>
    <div class="relation-legend"><span><i class="positive"></i>已建联</span><span><i class="neutral"></i>信息不足</span><p>展示汇报关系、影响力和真实接触状态。</p></div>
    <div class="org-map">${roots.length ? roots.map(root => renderOrgBranch(customer, root, new Set())).join("") : emptyState("还没有关系图", "从决策人或当前对接人开始添加。")}</div>
  </section>`;
}

function renderOrgBranch(customer, person, visited) {
  if (visited.has(person.id)) return "";
  const nextVisited = new Set(visited); nextVisited.add(person.id);
  const children = customer.orgChain.filter(p => p.pid === person.id);
  const built = Boolean(person.phone || person.wechat || person.email || person.note);
  return `<div class="org-branch"><article class="person-card ${built ? "connected" : ""}"><div class="person-main"><span class="person-avatar large">${safe(person.name?.[0] || "人")}</span><div><b>${safe(person.name)}</b><small>${safe(person.role || "职位未填写")}</small></div><span class="influence-pill">${person.level === 1 ? "决策" : person.level === 2 ? "影响" : "执行"}</span></div><div class="person-contact">${person.phone ? `<span>${icon("phone")} ${safe(person.phone)}</span>` : ""}${person.wechat ? `<span>${icon("message-circle")} ${safe(person.wechat)}</span>` : ""}${person.email ? `<span>${icon("mail")} ${safe(person.email)}</span>` : ""}</div><p>${safe(person.note || "尚未补充关系备注")}</p><div class="person-actions"><button data-action="edit-contact" data-customer="${customer.id}" data-contact="${person.id}">${icon("pencil")} 编辑</button><button data-action="remove-contact" data-customer="${customer.id}" data-contact="${person.id}">${icon("trash-2")} 删除</button></div></article>${children.length ? `<div class="org-children">${children.map(child => renderOrgBranch(customer, child, nextVisited)).join("")}</div>` : ""}</div>`;
}

function renderIntelligence(customer) {
  const publicFields = FIELD_DEFS.filter(d => d.public);
  const privateFields = FIELD_DEFS.filter(d => !d.public);
  return `<div class="intel-layout">
    <section class="panel intelligence-panel">
      <div class="section-heading"><div><p class="eyebrow">CUSTOMER INTELLIGENCE</p><h2>情报与证据</h2></div><span class="save-hint">修改后自动保存</span></div>
      <div class="intel-section"><div class="intel-section-title"><span>公开</span><div><b>基础信息</b><small>可通过公开渠道核实</small></div></div><div class="intel-form-grid">${publicFields.map(def => intelField(customer, def)).join("")}</div></div>
      <div class="intel-section"><div class="intel-section-title private"><span>私有</span><div><b>一线情报</b><small>来自真实沟通，是推进关键</small></div></div><div class="intel-form-grid single">${privateFields.map(def => intelField(customer, def, true)).join("")}</div></div>
    </section>
    <aside class="intel-side">
      <section class="panel"><div class="section-heading"><h2>核心痛点</h2><button class="text-button" data-action="add-pain" data-customer="${customer.id}">${icon("plus")} 添加</button></div><div class="editable-list">${customer.painPoints.length ? customer.painPoints.map((p,i) => `<article><span>${safe(p.v)}</span><button data-action="remove-pain" data-customer="${customer.id}" data-index="${i}" aria-label="删除痛点">${icon("x")}</button></article>`).join("") : emptyState("尚未记录痛点", "从沟通中持续补充。")}</div></section>
      <section class="panel"><div class="section-heading"><h2>匹配方案</h2><button class="text-button" data-action="add-solution" data-customer="${customer.id}">${icon("plus")} 添加</button></div><div class="solution-list">${customer.solution.length ? customer.solution.map(s => `<article><b>${safe(s.product)}</b><p>${safe(s.reason)}</p></article>`).join("") : emptyState("尚未匹配方案", "基于明确痛点再提供方案。")}</div></section>
      <section class="panel"><div class="section-heading"><h2>证据材料</h2><span>${customer.assets.length}</span></div>${customer.assets.length ? `<div class="asset-list">${customer.assets.map(a => renderEvidenceItem(customer, a)).join("")}</div>` : emptyState("还没有证据材料", "可在记录推进时上传文件。")}</section>
    </aside>
  </div>`;
}

function evidenceOpenTarget(asset) {
  const url = String(asset?.dataUrl || asset?.fileUrl || asset?.url || "").trim();
  const cloudRef = String(asset?.fileID || asset?.fileId || asset?.cloudFileID || asset?.cloudPath || asset?.cloudRef || asset?.storagePath || (/^cloud:\/\//i.test(url) ? url : "")).trim();
  if (cloudRef) return { kind: "cloud", url: cloudRef };
  if (/^https?:\/\/[^\s<>"']+$/i.test(url)) {
    const image = Boolean(asset?.isImage) || /\.(?:png|jpe?g|gif|webp)(?:[?#]|$)/i.test(url);
    return { kind: image ? "preview" : "open", url };
  }
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(url)) return { kind: "preview", url };
  if (trustedEvidenceBlobUrls.has(url) && /^blob:https?:\/\/[^\s<>"']+$/i.test(url)) return { kind: "preview", url };
  if (url) return { kind: "unsafe", url: "" };
  return { kind: "unavailable", url: "" };
}

function registerEvidenceBlobUrl(url) {
  const value = String(url || "").trim();
  if (/^blob:https?:\/\/[^\s<>"']+$/i.test(value)) trustedEvidenceBlobUrls.add(value);
}

function renderEvidenceItem(customer, asset) {
  const target = evidenceOpenTarget(asset);
  const availability = target.kind === "unavailable" ? "仅保存了本地元数据，无法预览" : target.kind === "unsafe" ? "链接不安全，无法打开" : target.kind === "cloud" ? "云端材料，打开时获取临时链接" : target.kind === "preview" ? "可预览" : "可打开或下载";
  const unavailable = ["unavailable", "unsafe"].includes(target.kind);
  return `<article><span>${icon(target.kind === "preview" ? "image" : "file-check-2")}</span><div><b>${safe(asset.name || "未命名材料")}</b><small>${safe(assetTypeLabel(asset.type))} · ${formatRelative(asset.createdAt)} · ${availability}</small></div><span class="asset-actions"><button data-action="open-asset" data-customer="${safe(customer.id)}" data-asset="${safe(asset.id)}" ${unavailable ? "disabled" : ""} aria-label="${unavailable ? "此材料不可打开" : "打开材料"}">${icon(target.kind === "preview" ? "eye" : "external-link")}</button><button data-action="remove-asset" data-customer="${safe(customer.id)}" data-asset="${safe(asset.id)}" aria-label="删除材料">${icon("trash-2")}</button></span></article>`;
}

function intelField(customer, def, multiline = false) {
  const value = customer.fields[def.key]?.v || "";
  return `<label class="intel-field ${multiline ? "wide" : ""}"><span>${safe(def.label)}</span>${multiline ? `<textarea rows="3" data-intel-field="${def.key}" data-customer="${customer.id}" placeholder="${safe(def.ph)}">${safe(value)}</textarea>` : `<input data-intel-field="${def.key}" data-customer="${customer.id}" value="${safe(value)}" placeholder="${safe(def.ph)}" />`}</label>`;
}

function renderTasks() {
  const tasks = getTasks().sort(taskPriority);
  const open = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);
  return `<div class="page tasks-page">
    <section class="page-heading"><div><p class="eyebrow">ACTION CENTER</p><h1>待办</h1><p>所有客户的下一步行动集中管理，完成后保留历史。</p></div><button class="primary-button" data-action="manual-entry">${icon("plus")} 新建推进</button></section>
    <div class="task-summary"><span><b>${open.filter(t => t.overdue).length}</b> 已逾期</span><span><b>${open.filter(t => t.today).length}</b> 今天</span><span><b>${open.filter(t => !t.overdue && !t.today).length}</b> 即将开始</span></div>
    <section class="td-panel task-worktable"><div class="section-heading"><h2>待处理</h2><span>${open.length}</span></div><div class="task-list">${open.length ? open.map(renderTaskRow).join("") : emptyState("没有待处理任务", "新的下一步行动会自动出现在这里。", "success")}</div></section>
    ${done.length ? `<section class="td-panel task-worktable completed-worktable"><div class="section-heading"><h2>已完成</h2><span>${done.length}</span></div><div class="task-list completed">${done.slice(0,8).map(renderTaskRow).join("")}</div></section>` : ""}
  </div>`;
}

function renderTaskRow(task) {
  return `<article class="task-row ${task.done ? "done" : ""}"><button class="task-check ${task.done ? "checked" : ""}" ${task.done ? "disabled" : `data-action="complete-task" data-customer="${task.customer.id}" data-note="${task.note.id}"`} aria-label="${task.done ? "已完成" : "完成待办"}">${task.done ? icon("check") : ""}</button><button class="task-content" data-action="open-customer" data-id="${task.customer.id}"><b>${safe(task.text)}</b><span>${safe(task.customer.name)} · ${safe(task.note.contact || "未指定联系人")}</span></button><b class="grade-dot grade-${task.customer.grade}">${task.customer.grade}</b><time class="${task.overdue && !task.done ? "danger-text" : ""}">${formatShortDate(task.date)}</time></article>`;
}

function getStalledPriorityCustomers(customerList = customers) {
  return customerList
    .map(customer => ({ customer, days: daysSince(lastActivityDate(customer)) }))
    .filter(item => item.days >= 14 && ["S", "A"].includes(item.customer.grade) && !["won", "lost"].includes(item.customer.stage))
    .sort((a, b) => b.days - a.days);
}

function renderAnalytics() {
  const maxStage = Math.max(1, ...CRM_STAGES.map(s => customers.filter(c => c.stage === s.key).length));
  const stalledPriority = getStalledPriorityCustomers();
  return `<div class="page analytics-page">
    <section class="page-heading"><div><p class="eyebrow">PERFORMANCE</p><h1>分析</h1><p>看推进节奏和客户结构，不重复展示无行动价值的数据。</p></div></section>
    <div class="analytics-workspace">
      <section class="td-panel"><div class="section-heading"><div><p class="eyebrow">PIPELINE</p><h2>推进阶段分布</h2></div></div><div class="bar-chart">${CRM_STAGES.map(stage => { const count=customers.filter(c=>c.stage===stage.key).length; return `<div><span>${stage.label}</span><i><b style="width:${count/maxStage*100}%;--bar:${stage.color}"></b></i><strong>${count}</strong></div>`; }).join("")}</div></section>
      <div class="analytics-side">
        <section class="td-panel stalled-customers"><div class="section-heading"><div><p class="eyebrow">FOLLOW-UP RISK</p><h2>停滞重点客户</h2></div><span>${stalledPriority.length}</span></div>${stalledPriority.length ? `<div class="stalled-list">${stalledPriority.map(item => `<button data-action="open-customer" data-id="${item.customer.id}">${avatar(item.customer)}<span><b>${safe(item.customer.name)}</b><small>${stageLabel(item.customer.stage)} · ${item.days} 天未更新</small></span>${icon("arrow-right")}</button>`).join("")}</div>` : emptyState("重点客户推进正常", "暂时没有超过两周未更新的 S/A 客户。")}</section>
        <section class="td-panel"><div class="section-heading"><div><p class="eyebrow">GRADE STRUCTURE</p><h2>客户等级结构</h2></div></div><div class="grade-chart">${GRADES.map(g => `<article style="--grade:${g.color}"><b>${g.key}</b><strong>${customers.filter(c=>c.grade===g.key).length}</strong><small>${safe(g.label.split("·").at(-1).trim())}</small></article>`).join("")}</div></section>
      </div>
    </div>
  </div>`;
}

// ---------- AI 信息收件箱 ----------
function applyAssistantState(nextAssistantState) {
  const card = $("#copilotCard");
  if (!card) return;
  card.classList.remove("assistant-listening", "assistant-reviewing", "assistant-success");
  card.dataset.assistantState = nextAssistantState;
  if (nextAssistantState !== "idle") card.classList.add(`assistant-${nextAssistantState}`);
}

function setAssistantState(assistantState) {
  clearTimeout(assistantStateTimer);
  assistantStateTimer = null;
  currentAssistantState = assistantState;
  applyAssistantState(assistantState);
  if (assistantState === "success") {
    assistantStateTimer = setTimeout(() => setAssistantState("idle"), 1200);
  }
}

function deriveAssistantState() {
  if (state.recording) return "listening";
  if (state.aiDraft) return "reviewing";
  return currentAssistantState === "success" ? "success" : "idle";
}

function reconcileAssistantState() {
  const nextAssistantState = deriveAssistantState();
  if (nextAssistantState === currentAssistantState) return applyAssistantState(nextAssistantState);
  setAssistantState(nextAssistantState);
}

function focusCopilot() {
  if (state.page !== "today") {
    state.page = "today";
    state.customerId = null;
    renderApp();
  }
  requestAnimationFrame(() => {
    $("#copilotCard")?.scrollIntoView({ behavior: "smooth", block: "center" });
    $("#copilotInput")?.focus();
  });
}

async function handleCopilotFiles(fileList) {
  const attachments = [];
  let failed = 0;
  for (const file of Array.from(fileList || [])) {
    try {
      const meta = await AssetEngine.readFile(file);
      attachments.push(AssetEngine.makeAsset("file", meta, { caption: "由 AI 信息收件箱关联" }));
    } catch (error) {
      failed += 1;
      console.warn("Copilot attachment skipped", error);
    }
  }
  state.copilotAttachments = attachments;
  const status = $("#copilotFileStatus");
  if (status) status.innerHTML = copilotFileStatusMarkup();
  if (state.aiDraft) {
    state.aiDraft.attachments = [...attachments];
    renderAIDraft();
  } else {
    refreshIcons();
  }
  if (failed) toast(`${failed} 份资料读取失败，请重新选择`);
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function analyzeCopilot(baseDate = new Date()) {
  const input = $("#copilotInput");
  const raw = input?.value.trim();
  if (!raw) return toast("先输入一段客户信息，或使用语音记录");
  const extracted = AIEngine.extract(raw);
  const matched = customers.find(c => raw.includes(c.name)) || customers.find(c => extracted.name && c.name.includes(extracted.name));
  const method = /微信/.test(raw) ? "wechat" : /邮件/.test(raw) ? "email" : /拜访|上门/.test(raw) ? "visit" : /会议|开会/.test(raw) ? "meeting" : "phone";
  const action = extractNextAction(raw, baseDate);
  state.aiDraft = {
    customerId: matched?.id || "",
    raw,
    found: extracted.found,
    method,
    contact: extractContact(raw, matched),
    next: action.next,
    nextDate: action.nextDate,
    attachments: [...state.copilotAttachments],
  };
  renderAIDraft();
  $("#aiDraft")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function extractContact(raw, matchedCustomer) {
  const text = String(raw || "");
  const known = [...(matchedCustomer?.orgChain || [])]
    .filter(person => person?.name && text.includes(person.name))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (known) return known.name;
  const customerIndex = matchedCustomer?.name ? text.indexOf(matchedCustomer.name) : -1;
  if (customerIndex >= 0) {
    const afterCustomer = text.slice(customerIndex + matchedCustomer.name.length);
    const direct = afterCustomer.match(/^\s*(?:的)?([\u4e00-\u9fa5A-Za-z·]{2,10}?)(?=通了电话|沟通|通话|聊|开会|说|，|,)/);
    if (direct) return direct[1];
  }
  const fallback = text.match(/(?:和|跟|联系了?|对接人[：:]?)\s*([\u4e00-\u9fa5A-Za-z·]{2,10}?)(?=通了电话|沟通|通话|聊|开会|说|，|,)/);
  return fallback?.[1] || "";
}

function renderAIDraft() {
  const host = $("#aiDraft");
  if (!host || !state.aiDraft) return;
  const draft = state.aiDraft;
  const fields = Object.entries(draft.found);
  host.innerHTML = `<section class="ai-review">
    <div class="review-head"><div><span class="review-kicker">AI 已整理 · 等待确认</span><h3>准备写入客户档案</h3></div><label>关联客户<div class="modern-select"><select id="aiTargetSelect"><option value="">请选择客户</option>${customers.map(c => `<option value="${c.id}" ${draft.customerId === c.id ? "selected" : ""}>${safe(c.name)}</option>`).join("")}</select>${icon("chevron-down")}</div></label></div>
    <div class="review-items">
      <label class="review-item main-review"><input class="draft-check" type="checkbox" data-kind="note" checked /><span class="review-check"></span><div><small>新增推进记录 · ${safe(methodMeta(draft.method).label)}</small><b>${safe(draft.raw)}</b>${draft.contact ? `<p>对接人：${safe(draft.contact)}</p>` : ""}</div></label>
      ${fields.map(([key,value]) => { const def=FIELD_DEFS.find(d=>d.key===key); return `<label class="review-item"><input class="draft-check" type="checkbox" data-kind="field" data-key="${key}" checked /><span class="review-check"></span><div><small>更新情报 · ${safe(def?.label || key)}</small><b>${safe(value)}</b></div></label>`; }).join("")}
      ${draft.next ? `<label class="review-item"><input class="draft-check" type="checkbox" data-kind="task" checked /><span class="review-check"></span><div><small>创建下一步${draft.nextDate ? ` · ${formatShortDate(draft.nextDate)}` : ""}</small><b>${safe(draft.next)}</b></div></label>` : ""}
      ${draft.attachments?.length ? `<article class="review-item review-attachment"><span class="review-file-icon">${icon("files")}</span><div><small>随推进记录保存 · ${draft.attachments.length} 份资料</small><b>${draft.attachments.map(attachment => safe(attachment.name)).join("、")}</b></div></article>` : ""}
    </div>
    <div class="review-actions"><button class="text-button" data-action="discard-ai">取消</button><span>所有内容写入后仍可手动修改</span><button class="primary-button" data-action="confirm-ai" ${draft.customerId ? "" : "disabled"}>确认并写入</button></div>
  </section>`;
  reconcileAssistantState();
  refreshIcons();
}

function confirmAIDraft() {
  const draft = state.aiDraft;
  if (!draft?.customerId) return toast("请选择要写入的客户");
  const customer = getCustomer(draft.customerId);
  const checks = $$(".draft-check", $("#aiDraft"));
  const selection = {
    note: checks.some(box => box.dataset.kind === "note" && box.checked),
    task: checks.some(box => box.dataset.kind === "task" && box.checked),
    fields: checks.filter(box => box.dataset.kind === "field" && box.checked).map(box => box.dataset.key),
  };
  const result = applyAIDraftSelection(customer, draft, selection, nowDateTime(), uid("n"));
  if (!result.persisted) return toast("请至少选择一项要写入的内容");
  persist();
  state.aiDraft = null;
  state.copilotAttachments = [];
  const input = $("#copilotInput"); if (input) input.value = "";
  renderApp();
  setAssistantState("success");
  toast(`已写入「${customer.name}」，可随时手动修改`);
}

function applyAIDraftSelection(customer, draft, selection, createdAt, noteId) {
  const fieldKeys = Array.isArray(selection?.fields) ? selection.fields : [];
  const createNote = Boolean(selection?.note || selection?.task);
  if (!createNote && !fieldKeys.length) return { persisted: false };
  fieldKeys.forEach(key => { customer.fields[key] = { v: draft.found[key] }; });
  if (createNote) {
    const attachments = [...(draft.attachments || [])];
    customer.assets.push(...attachments);
    customer.notes.push({
      id: noteId, method: draft.method, date: createdAt, contact: draft.contact,
      place: "", content: selection.note ? draft.raw : "",
      next: selection.task ? draft.next : "",
      nextDate: selection.task ? (draft.nextDate || String(createdAt).slice(0, 10)) : "",
      taskDone: false, source: selection.note ? "ai-confirmed" : "ai-action-only", attachments,
    });
  }
  return { persisted: true };
}

function discardAIDraft() {
  state.aiDraft = null;
  const host = $("#aiDraft"); if (host) host.innerHTML = "";
  setAssistantState("idle");
}

function startVoiceCapture(button) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return toast("当前浏览器暂不支持语音识别，可以直接输入文字");
  if (state.recording) return;
  const recognition = new Recognition();
  recognition.lang = "zh-CN";
  recognition.interimResults = true;
  recognition.continuous = false;
  state.recording = true;
  setAssistantState("listening");
  button.classList.add("recording");
  button.innerHTML = `${icon("audio-lines")} 正在听`;
  refreshIcons();
  const input = $("#copilotInput");
  const before = input.value;
  recognition.onresult = event => {
    const speech = Array.from(event.results).map(result => result[0].transcript).join("");
    input.value = `${before}${before ? " " : ""}${speech}`;
  };
  recognition.onerror = () => toast("没有听清，请再试一次或改用文字输入");
  recognition.onend = () => {
    state.recording = false;
    reconcileAssistantState();
    button.classList.remove("recording");
    button.innerHTML = `${icon("mic")} 语音`;
    refreshIcons();
    input.focus();
  };
  recognition.start();
}

// ---------- 手动录入 ----------
function openNewCustomer() {
  showModal(`<div class="modal-head"><div><p class="eyebrow">NEW ACCOUNT</p><h2 id="modalTitle">新建客户</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="new-customer"><label>客户名称<input name="name" required autofocus placeholder="公司或组织名称" /></label><label>所属行业<input name="industry" placeholder="例如：游戏、零售、SaaS" /></label><fieldset class="choice-fieldset"><legend>重点等级</legend><div class="option-cards grade-options">${GRADES.map(g => `<label><input type="radio" name="grade" value="${g.key}" ${g.key === "B" ? "checked" : ""}/><span class="grade-option grade-${g.key}">${g.key}</span><b>${safe(g.label.split("·").at(-1).trim())}</b></label>`).join("")}</div></fieldset><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("arrow-right")} 创建并进入档案</button></div></form>`);
}

function submitNewCustomer(form) {
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  if (!name) return;
  const customer = ensureCustomerShape({ id: uid(), name, logo: name[0], color: customerColor(customers.length), stage: "lead", grade: data.get("grade") || "B", fields: {}, notes: [], assets: [], orgChain: [], painPoints: [], solution: [] });
  customer.fields.industry.v = String(data.get("industry") || "").trim();
  customers.unshift(customer);
  persist(); closeModal(); openCustomer(customer.id); toast("客户已创建，可手动填写或交给 AI 整理信息");
}

function openManualEntry(customerId, noteId = "") {
  const selected = customerId || state.customerId || "";
  const customer = getCustomer(selected);
  const note = customer?.notes.find(item => item.id === noteId);
  const value = (input) => safe(input || "");
  const dateValue = note?.date ? String(note.date).replace(" ", "T").slice(0, 16) : toLocalInput(new Date());
  showModal(`<div class="modal-head"><div><p class="eyebrow">PROGRESS ENTRY</p><h2 id="modalTitle">${note ? "编辑客户推进" : "手动记录客户推进"}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="manual-entry"><input type="hidden" name="noteId" value="${value(noteId)}" /><label>关联客户<div class="modern-select"><select name="customerId" required ${note ? "disabled" : ""}><option value="">请选择客户</option>${customers.map(c => `<option value="${c.id}" ${selected === c.id ? "selected" : ""}>${safe(c.name)}</option>`).join("")}</select>${note ? `<input type="hidden" name="customerId" value="${selected}" />` : ""}${icon("chevron-down")}</div></label><fieldset class="choice-fieldset"><legend>沟通方式</legend><div class="option-cards method-options">${CONTACT_METHODS.map((m,i) => `<label><input type="radio" name="method" value="${m.key}" ${note ? note.method === m.key : i===0 ? "checked" : ""}/><span>${icon(methodIconName(m.key))}</span><b>${safe(m.label)}</b></label>`).join("")}</div></fieldset><label>沟通时间<input type="datetime-local" name="date" value="${dateValue}" /></label><label>对接人<input name="contact" value="${value(note?.contact)}" placeholder="姓名或职位" /></label><label>沟通内容<textarea name="content" rows="5" placeholder="记录对方态度、需求、异议和重要事实">${value(note?.content)}</textarea></label><div class="form-row"><label>下一步行动<input name="next" value="${value(note?.next)}" placeholder="例如：发送方案、预约拜访" /></label><label>提醒日期<input type="date" name="nextDate" value="${value(note?.nextDate)}" /></label></div>${note?.attachments?.length ? `<div class="preserved-attachments"><b>已有材料（保存编辑时保留）</b>${note.attachments.map(a => `<span>${icon("paperclip")} ${safe(a.name)}</span>`).join("")}</div>` : ""}<label class="file-field">${icon("paperclip")} 佐证材料<input type="file" name="files" multiple /><small>支持图片和常见文件；材料会关联到本次推进记录</small></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} ${note ? "保存修改" : "保存推进记录"}</button></div></form>`);
}

async function submitManualEntry(form) {
  const data = new FormData(form);
  const customer = getCustomer(data.get("customerId"));
  if (!customer) return toast("请选择关联客户");
  const noteId = String(data.get("noteId") || "");
  const existing = customer.notes.find(note => note.id === noteId);
  const content = String(data.get("content") || "").trim();
  const next = String(data.get("next") || "").trim();
  if (!content && !next) return toast("请填写沟通内容或下一步行动");
  const files = Array.from(form.elements.files.files || []);
  const attachments = [];
  for (const file of files) {
    try {
      const meta = await AssetEngine.readFile(file);
      const asset = AssetEngine.makeAsset("file", meta, { caption: "随推进记录上传" });
      customer.assets.push(asset); attachments.push(asset);
    } catch (error) { console.warn("Attachment skipped", error); }
  }
  const patch = { id: noteId || uid("n"), method: data.get("method"), date: normalizeDateInput(data.get("date")), contact: String(data.get("contact") || "").trim(), place: existing?.place || "", content, next, nextDate: String(data.get("nextDate") || ""), source: existing?.source || "manual", attachments: [...(existing?.attachments || []), ...attachments] };
  upsertProgressNote(customer, patch);
  persist(); closeModal();
  if (state.customerId === customer.id) state.customerTab = "timeline";
  renderApp(); toast(existing ? "客户推进记录已更新" : "客户推进记录已保存");
}

function openContactForm(customerId, contactId = "") {
  const customer = getCustomer(customerId);
  if (!customer) return;
  const person = customer.orgChain.find(item => item.id === contactId);
  const value = input => safe(input || "");
  showModal(`<div class="modal-head"><div><p class="eyebrow">STAKEHOLDER</p><h2 id="modalTitle">${person ? "编辑关键联系人" : "添加关键联系人"}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="contact"><input type="hidden" name="customerId" value="${customer.id}" /><input type="hidden" name="contactId" value="${value(contactId)}" /><div class="form-row"><label>姓名<input name="name" required value="${value(person?.name)}" /></label><label>职位<input name="role" value="${value(person?.role)}" placeholder="例如：CTO、采购负责人" /></label></div><fieldset class="choice-fieldset"><legend>角色层级</legend><div class="option-cards role-options">${[[1,"crown","决策层"],[2,"users","影响层"],[3,"wrench","执行层"]].map(([level,iconName,label]) => `<label><input type="radio" name="level" value="${level}" ${(person?.level || 2) === level ? "checked" : ""}/><span>${icon(iconName)}</span><b>${label}</b></label>`).join("")}</div></fieldset><label>上级<div class="modern-select"><select name="pid"><option value="">无上级</option>${customer.orgChain.filter(p => p.id !== contactId).map(p => `<option value="${p.id}" ${person?.pid === p.id ? "selected" : ""}>${safe(p.name)} · ${safe(p.role)}</option>`).join("")}</select>${icon("chevron-down")}</div></label><div class="form-row"><label>电话<input name="phone" value="${value(person?.phone)}" /></label><label>微信<input name="wechat" value="${value(person?.wechat)}" /></label></div><label>邮箱<input name="email" type="email" value="${value(person?.email)}" /></label><label>关系备注<textarea name="note" rows="3" placeholder="影响力、态度、关注点、建联情况">${value(person?.note)}</textarea></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon(person ? "check" : "user-plus")} ${person ? "保存修改" : "保存联系人"}</button></div></form>`);
}

function submitContact(form) {
  const data = new FormData(form); const customer = getCustomer(data.get("customerId")); if (!customer) return;
  const contactId = String(data.get("contactId") || "");
  upsertContact(customer, { id: contactId || uid("o"), pid: data.get("pid") || null, name: String(data.get("name") || "").trim(), role: String(data.get("role") || "").trim(), level: Number(data.get("level") || 2), phone: String(data.get("phone") || "").trim(), wechat: String(data.get("wechat") || "").trim(), email: String(data.get("email") || "").trim(), note: String(data.get("note") || "").trim(), photo: customer.orgChain.find(p => p.id === contactId)?.photo || "" });
  persist(); closeModal(); renderApp(); toast(contactId ? "联系人已更新" : "联系人已加入关系图");
}

function openPainForm(customerId) {
  showSimpleTextForm("pain", customerId, "添加客户痛点", "痛点描述", "记录客户明确表达的业务问题或顾虑");
}

function openSolutionForm(customerId) {
  const customer = getCustomer(customerId); if (!customer) return;
  showModal(`<div class="modal-head"><div><p class="eyebrow">SOLUTION</p><h2 id="modalTitle">添加匹配方案</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="solution"><input type="hidden" name="customerId" value="${customer.id}" /><label>产品或方案<input name="product" required placeholder="例如：全球应用加速 GAAP" /></label><label>匹配理由<textarea name="reason" rows="4" required placeholder="它解决客户的哪个明确痛点？"></textarea></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存方案</button></div></form>`);
}

function showSimpleTextForm(type, customerId, title, label, placeholder) {
  const customer=getCustomer(customerId); if(!customer) return;
  showModal(`<div class="modal-head"><div><p class="eyebrow">CUSTOMER INTELLIGENCE</p><h2 id="modalTitle">${title}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="${type}"><input type="hidden" name="customerId" value="${customer.id}" /><label>${label}<textarea name="value" rows="4" required placeholder="${placeholder}"></textarea></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存</button></div></form>`);
}

function submitPain(form) { const data=new FormData(form), customer=getCustomer(data.get("customerId")); if(!customer)return; customer.painPoints.push({v:String(data.get("value")||"").trim()}); persist(); closeModal(); renderApp(); toast("痛点已保存"); }
function submitSolution(form) { const data=new FormData(form), customer=getCustomer(data.get("customerId")); if(!customer)return; customer.solution.push({product:String(data.get("product")||"").trim(),reason:String(data.get("reason")||"").trim()}); persist(); closeModal(); renderApp(); toast("方案已保存"); }

function removePain(customerId, index) { const c=getCustomer(customerId); if(!c?.painPoints[index])return; c.painPoints.splice(index,1); persist(); renderApp(); }
function removeContact(customerId, contactId) { const c=getCustomer(customerId); if(!c || !window.confirm("确认删除这个联系人？其下属将移到关系图顶层。"))return; c.orgChain = c.orgChain.filter(p=>p.id!==contactId); c.orgChain.forEach(p=>{if(p.pid===contactId)p.pid=null;}); persist(); renderApp(); toast("联系人已删除，下属已移到顶层"); }

function upsertProgressNote(customer, notePatch) {
  const index = customer.notes.findIndex(note => note.id === notePatch.id);
  if (index < 0) { customer.notes.push({ taskDone: false, ...notePatch }); return customer.notes.at(-1); }
  const current = customer.notes[index];
  const taskChanged = current.next !== notePatch.next || current.nextDate !== notePatch.nextDate;
  customer.notes[index] = { ...current, ...notePatch, id: current.id, attachments: notePatch.attachments || current.attachments || [], taskDone: taskChanged ? false : Boolean(current.taskDone) };
  if (taskChanged) delete customer.notes[index].completedAt;
  return customer.notes[index];
}

function removeProgressNote(customer, noteId) {
  const before = customer.notes.length;
  customer.notes = customer.notes.filter(note => note.id !== noteId);
  return customer.notes.length !== before;
}

function deleteProgressNote(customerId, noteId) {
  const customer = getCustomer(customerId);
  if (!customer || !window.confirm("确认删除这条推进记录？关联待办也会同步删除。")) return;
  if (!removeProgressNote(customer, noteId)) return;
  persist(); renderApp(); toast("推进记录和关联待办已删除");
}

function upsertContact(customer, contactPatch) {
  const index = customer.orgChain.findIndex(person => person.id === contactPatch.id);
  if (index < 0) { customer.orgChain.push(contactPatch); return customer.orgChain.at(-1); }
  const current = customer.orgChain[index];
  customer.orgChain[index] = { ...current, ...contactPatch, id: current.id };
  return customer.orgChain[index];
}

function removeEvidenceAsset(customer, assetId) {
  customer.assets = customer.assets.filter(asset => asset.id !== assetId);
  customer.notes.forEach(note => { note.attachments = (note.attachments || []).filter(asset => asset.id !== assetId); });
}

async function resolveCloudEvidenceUrl(cloudRef) {
  const app = typeof CloudAuth !== "undefined" ? CloudAuth?.app : null;
  if (typeof CLOUD_ENABLED === "undefined" || !CLOUD_ENABLED || typeof app?.getTempFileURL !== "function") return "";
  try {
    const result = await app.getTempFileURL({ fileList: [cloudRef] });
    const url = String(result?.fileList?.[0]?.tempFileURL || "").trim();
    return /^https:\/\/[^\s<>"']+$/i.test(url) ? url : "";
  } catch (error) {
    console.warn("Cloud evidence URL unavailable", error);
    return "";
  }
}

async function openEvidenceAsset(customerId, assetId) {
  const asset = getCustomer(customerId)?.assets.find(item => item.id === assetId);
  const target = evidenceOpenTarget(asset);
  if (target.kind === "unavailable") return toast("该本地文件仅保存了名称和大小，无法预览");
  if (target.kind === "unsafe") return toast("材料链接不安全，已拒绝打开");
  if (target.kind === "cloud") {
    const temporaryUrl = await resolveCloudEvidenceUrl(target.url);
    if (!temporaryUrl) return toast("云端材料暂时无法打开，请稍后重试");
    window.open(temporaryUrl, "_blank", "noopener,noreferrer");
    return;
  }
  window.open(target.url, "_blank", "noopener,noreferrer");
}

function deleteEvidenceAsset(customerId, assetId) {
  const customer = getCustomer(customerId);
  if (!customer || !window.confirm("确认删除这份材料？报告中的证据索引也会同步更新。")) return;
  removeEvidenceAsset(customer, assetId);
  persist(); renderApp(); toast("材料已删除，推进记录引用已同步清理");
}

function updateCustomerStage(customerId, stage) {
  const customer=getCustomer(customerId); if(!customer || customer.stage===stage)return;
  customer.stage=stage; customer.stageHistory.push({stage,date:nowDateTime(),note:"手动更新阶段"}); persist("客户阶段已更新"); renderApp();
}
function updateCustomerGrade(customerId, grade) { const customer=getCustomer(customerId); if(!customer)return; customer.grade=grade; persist("客户优先级已更新"); renderApp(); }
function updateIntelField(target) { const customer=getCustomer(target.dataset.customer); if(!customer)return; customer.fields[target.dataset.intelField] = {v:target.value.trim()}; persist(); toast("情报已保存"); }

// ---------- 全景报告 ----------
const WORD_REPORT_STYLES = `
  @page { size: A4; margin: 18mm 17mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #172b4d; font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; font-size: 10.5pt; line-height: 1.65; widows: 2; orphans: 2; }
  .report-heading { padding-bottom: 18pt; border-bottom: 2.25pt solid #0052d9; }
  .report-heading > p { margin: 0; color: #0052d9; font-size: 9pt; font-weight: 700; letter-spacing: 1pt; }
  .report-heading h1 { margin: 6pt 0 11pt; font-family: "Songti SC", SimSun, "Microsoft YaHei", serif; font-size: 25pt; line-height: 1.25; }
  .report-heading > div { margin-top: 4pt; }
  .report-heading span { display: inline-block; margin: 0 5pt 4pt 0; padding: 3pt 6pt; background: #f2f3f5; font-size: 8.5pt; }
  .report-section { margin-top: 22pt; }
  .report-section-title { margin-bottom: 10pt; padding-bottom: 5pt; border-bottom: .75pt solid #dfe3e8; page-break-after: avoid; }
  .report-section h2 { margin: 0; font-size: 14pt; line-height: 1.4; }
  .report-field-grid { font-size: 0; }
  .report-field-grid > div { display: inline-block; width: 46%; margin: 0 2% 7pt 0; padding: 8pt; border-left: 2.25pt solid #d9e1ff; background: #f7f9fc; vertical-align: top; page-break-inside: avoid; font-size: 10.5pt; }
  .report-field-grid span { color: #66717d; font-size: 8.5pt; }
  .report-field-grid p { margin: 3pt 0 0; line-height: 1.6; }
  ul { margin: 0; padding-left: 17pt; }
  li { margin: 0 0 5pt; page-break-inside: avoid; }
  .report-progress article { padding: 8pt 0; border-bottom: .75pt solid #edf0f2; page-break-inside: avoid; }
  .report-progress time { display: block; color: #7a8491; font-size: 8.5pt; }
  .report-progress b { font-size: 9.5pt; }
  .report-progress p { margin: 3pt 0; }
  .report-progress small { color: #0052d9; font-size: 8.5pt; }
`;

function openReport(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) return;
  reportReturnFocus = document.activeElement;
  const builder = getReportBuilder();
  if (!builder) return reportBuilderUnavailable();
  let reportHtml;
  try { reportHtml = buildReport(customer, builder); }
  catch (error) { console.error("Report preview unavailable", error); return reportBuilderUnavailable(); }
  if (typeof reportHtml !== "string" || !reportHtml.trim()) return reportBuilderUnavailable();
  reportCustomer = customer;
  $("#reportDocument").innerHTML = reportHtml;
  $("#reportStatus").textContent = `${customer.name} · ${formatLongDate(new Date())}`;
  const layer = $("#reportLayer");
  layer.classList.remove("hidden");
  layer.setAttribute?.("aria-hidden", "false");
  document.body.classList.add("report-open");
  refreshIcons();
  window.scrollTo({ top: 0 });
  requestAnimationFrame(() => layer.querySelector?.('[data-action="close-report"]')?.focus?.() || layer.focus?.());
}

function closeReport() {
  const layer = $("#reportLayer");
  if (layer) {
    layer.classList.add("hidden");
    layer.setAttribute?.("aria-hidden", "true");
  }
  document.body.classList.remove("report-open");
  reportCustomer = null;
  restoreDialogFocus(reportReturnFocus);
  reportReturnFocus = null;
}

function getReportBuilder() {
  const builder = typeof ReportBuilder === "undefined" ? null : ReportBuilder;
  return builder && typeof builder.build === "function" && typeof builder.wrapWord === "function" ? builder : null;
}

function reportBuilderUnavailable() {
  closeReport();
  toast("报告组件未加载，请刷新页面后重试");
}

function buildReport(customer, builder = getReportBuilder()) {
  if (!builder) return "";
  return builder.build(customer, {
    fieldDefs: FIELD_DEFS,
    stages: CRM_STAGES,
    methods: CONTACT_METHODS,
    assetTypes: ASSET_TYPES,
    formatDateTime,
    formatShortDate,
    reportDate: formatLongDate(new Date()),
  });
}

function exportWordReport() {
  if (!reportCustomer) return;
  const builder = getReportBuilder();
  if (!builder) return reportBuilderUnavailable();
  let doc;
  try { doc = builder.wrapWord($("#reportDocument").innerHTML, WORD_REPORT_STYLES); }
  catch (error) { console.error("Report export unavailable", error); return reportBuilderUnavailable(); }
  if (typeof doc !== "string" || !doc.trim()) return reportBuilderUnavailable();
  const blob = new Blob(["\ufeff", doc], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href=url; link.download=`${reportCustomer.name}_客户全景报告_${todayStr()}.doc`; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000); toast("Word 报告已导出");
}

// ---------- 数据计算 ----------
function getCustomer(id) { return customers.find(customer => customer.id === id); }
function getTasks(onlyCustomer) {
  const scope = onlyCustomer ? [onlyCustomer] : customers;
  const today = todayStr();
  return scope.flatMap(customer => customer.notes.filter(note => note.next && note.nextDate).map(note => {
    const diff = dateDiff(today, note.nextDate);
    return { customer, note, text: note.next, date: note.nextDate, done: Boolean(note.taskDone), overdue: !note.taskDone && note.nextDate < today, today: !note.taskDone && note.nextDate === today, days: diff };
  }));
}
function getNextTask(customer) { return getTasks(customer).filter(t=>!t.done).sort(taskPriority)[0] || null; }
function taskPriority(a,b) { if(a.done!==b.done)return a.done?1:-1; const grade={S:0,A:1,B:2,C:3}; if(a.overdue!==b.overdue)return a.overdue?-1:1; if(a.date!==b.date)return String(a.date).localeCompare(String(b.date)); return grade[a.customer.grade]-grade[b.customer.grade]; }
function completeTask(customerId,noteId) { const c=getCustomer(customerId), note=c?.notes.find(n=>n.id===noteId); if(!note)return; note.taskDone=true; note.completedAt=nowDateTime(); persist(); renderApp(); toast("已完成，历史记录已保留"); }
function getNotesThisWeek() { const start=new Date(); const day=(start.getDay()+6)%7; start.setDate(start.getDate()-day); start.setHours(0,0,0,0); return customers.flatMap(c=>c.notes).filter(n=>parseDate(n.date)>=start); }
function lastActivityDate(customer) { return [...customer.notes].map(n=>n.date).filter(Boolean).sort().at(-1) || customer.stageHistory?.at(-1)?.date || todayStr(); }
function profileCompleteness(customer) { const fieldCount=FIELD_DEFS.filter(d=>customer.fields[d.key]?.v?.trim()).length; const total=FIELD_DEFS.length+4; const bonus=[customer.notes.length,customer.orgChain.length,customer.painPoints.length,customer.assets.length].filter(Boolean).length; return Math.round((fieldCount+bonus)/total*100); }
function stageIndex(stage) { return CRM_STAGES.filter(s=>s.key!=="lost").findIndex(s=>s.key===stage); }
function stageLabel(stage) { return CRM_STAGES.find(s=>s.key===stage)?.label || "未设置"; }
function assetTypeLabel(type) { return ASSET_TYPES.find(t=>t.key===type)?.label || "其他附件"; }
function customerColor(index) { return ["#2864dc","#7357d9","#0f9f78","#dc6754","#d28b21"][index%5]; }
function avatar(customer,size="") { return `<span class="customer-avatar ${size}" style="--avatar:${safe(customer.color||"#2864dc")}">${safe(customer.logo||customer.name?.[0]||"客")}</span>`; }
function dateDiff(from,to) { const a=parseDate(from),b=parseDate(to); return Math.round((b-a)/86400000); }
function daysSince(date) { const d=parseDate(date); return d ? Math.max(0,Math.floor((new Date()-d)/86400000)) : 0; }
function parseDate(value) { if(!value)return null; const normalized=String(value).replace(" ","T"); const d=new Date(normalized); return Number.isNaN(d.getTime())?null:d; }
function formatShortDate(value) { const d=parseDate(value); if(!d)return "未排期"; return `${d.getMonth()+1}月${d.getDate()}日`; }
function formatDateTime(value) { const d=parseDate(value); if(!d)return safe(value||""); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
function formatLongDate(date) { return `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日 · 星期${"日一二三四五六"[date.getDay()]}`; }
function formatRelative(value) { const days=daysSince(value); if(days===0)return "今天"; if(days===1)return "昨天"; if(days<30)return `${days} 天前`; return formatShortDate(value); }
function toLocalInput(date) { const p=n=>String(n).padStart(2,"0"); return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`; }
function normalizeDateInput(value) { return String(value||"").replace("T"," ") || nowDateTime(); }
function dateString(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function parseNaturalDate(text, baseDate = new Date()) {
  const input = String(text || "");
  const explicit = input.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})[日号]?/);
  if (explicit) return dateString(new Date(Number(explicit[1]), Number(explicit[2]) - 1, Number(explicit[3])));
  const monthDay = input.match(/(?<!\d)(\d{1,2})月(\d{1,2})[日号]?/);
  if (monthDay) return dateString(new Date(baseDate.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2])));
  const relative = input.match(/(今天|明天|后天)/);
  if (relative) {
    const offset = { 今天: 0, 明天: 1, 后天: 2 }[relative[1]];
    return dateString(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offset));
  }
  const week = input.match(/(本周|下下周|下周)([一二三四五六日天])?/);
  if (week) {
    const weekOffset = { 本周: 0, 下周: 1, 下下周: 2 }[week[1]];
    const weekday = week[2] ? { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }[week[2]] : 7;
    const currentWeekday = baseDate.getDay() || 7;
    return dateString(new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() - currentWeekday + 1 + weekOffset * 7 + weekday - 1));
  }
  return "";
}
function extractNextAction(text, baseDate = new Date()) {
  const input = String(text || "");
  const dateToken = input.match(/(?:20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}[日号]?|\d{1,2}月\d{1,2}[日号]?|今天|明天|后天|(?:本周|下下周|下周)[一二三四五六日天]?)/);
  if (dateToken) {
    const tail = input.slice((dateToken.index || 0) + dateToken[0].length).split(/[。；\n]/)[0]
      .replace(/^[，,:：\s]+/, "").replace(/[，,]?\s*(?:并)?提醒我.*$/, "").trim();
    if (tail) return { next: tail, nextDate: parseNaturalDate(dateToken[0], baseDate) };
  }
  const generic = input.match(/(?:下一步|接下来|后续|提醒我)[：:]?([^。；\n]+)/);
  return { next: generic?.[1]?.replace(/(?:并)?提醒我.*$/, "").trim() || "", nextDate: parseNaturalDate(input, baseDate) };
}
function extractDate(text, baseDate = new Date()) { return parseNaturalDate(text, baseDate); }

// ---------- 通用 UI ----------
function methodIconName(method) {
  return ({ phone:"phone", wechat:"message-circle", email:"mail", visit:"map-pin", meeting:"presentation", other:"notebook-pen" })[method] || "message-square";
}
function refreshIcons() {
  if (!window.lucide?.createIcons) return;
  requestAnimationFrame(() => window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } }));
}
function toggleChoiceMenu(trigger) {
  const control = trigger.closest(".choice-control");
  const opening = !control.classList.contains("open");
  closeChoiceMenus(control);
  control.classList.toggle("open", opening);
  trigger.setAttribute("aria-expanded", String(opening));
}
function closeChoiceMenus(except) {
  $$(".choice-control.open").forEach(control => {
    if (control === except) return;
    control.classList.remove("open");
    control.querySelector(".choice-trigger")?.setAttribute("aria-expanded", "false");
  });
}
function prepareRowMenusForAction(event, root = document) {
  const rowMenu = event.target.closest(".row-more-actions");
  const trigger = event.target.closest("[data-action]");
  if (trigger?.dataset.action === "toggle-row-menu") closeRowMenus(rowMenu, false, root);
  else if (!rowMenu) closeRowMenus(undefined, false, root);
  return trigger;
}
function closeRowMenus(except, restoreFocus = false, root = document) {
  Array.from(root.querySelectorAll(".row-more-actions[open]")).forEach(menu => {
    if (menu === except) return;
    const focusWasInside = restoreFocus && menu.contains(root.activeElement);
    menu.removeAttribute("open");
    if (focusWasInside) menu.querySelector("summary")?.focus();
  });
}
function toggleTheme() { const next=document.documentElement.dataset.theme==="dark"?"light":"dark"; document.documentElement.dataset.theme=next; localStorage.setItem(THEME_KEY,next); }
function showModal(content) {
  const layer = $("#modalLayer");
  const panel = $("#modalPanel");
  modalReturnFocus = document.activeElement;
  panel.innerHTML = content;
  layer.classList.remove("hidden");
  layer.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  refreshIcons();
  requestAnimationFrame(() => panel.querySelector("input[autofocus]")?.focus() || panel.querySelector(DIALOG_FOCUSABLE)?.focus() || panel.focus());
}
function closeModal() {
  const layer = $("#modalLayer");
  if (!layer || layer.classList.contains("hidden")) return;
  layer.classList.add("hidden");
  layer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  restoreDialogFocus(modalReturnFocus);
  modalReturnFocus = null;
}
function restoreDialogFocus(element) {
  if (element && typeof element.focus === "function") element.focus({ preventScroll: true });
}
function trapDialogFocus(event) {
  const report = $("#reportLayer");
  const modal = $("#modalLayer");
  const layer = report && !report.classList.contains("hidden") ? report : modal && !modal.classList.contains("hidden") ? modal : null;
  if (!layer) return false;
  const focusable = Array.from(layer.querySelectorAll(DIALOG_FOCUSABLE))
    .filter(element => !element.closest("[hidden]") && element.getClientRects().length);
  if (!focusable.length) { event.preventDefault(); layer.focus(); return true; }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!layer.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return true; }
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  return true;
}
function toast(message) { const el=$("#toast"); clearTimeout(toastTimer); el.textContent=message; el.classList.remove("hidden"); toastTimer=setTimeout(()=>el.classList.add("hidden"),2600); }
function emptyState(title,copy,pose="scratch") { return `<div class="empty-state"><span class="empty-penguin">${penguinSVG(pose)}</span><b>${safe(title)}</b><p>${safe(copy)}</p></div>`; }

// ===================================================================
// QQ 企鹅（照用户提供的参考图 1:1 还原：光头无毛、水滴身、
// 黑脸上嵌白脸盘、圆眼+眉毛、橙三角嘴、蓝围巾挂黄星、两只橙脚）
// pose: stand(招牌站姿) / wave(招手) / scratch(挠头) / search(找东西) / success(比耶)
// ===================================================================
function penguinSVG(pose = "stand") {
  const defs = `
    <defs>
      <radialGradient id="pgBody" cx="40%" cy="24%" r="84%">
        <stop offset="0%" stop-color="#2c333d"/>
        <stop offset="48%" stop-color="#1c222a"/>
        <stop offset="100%" stop-color="#0d1116"/>
      </radialGradient>
      <radialGradient id="pgBelly" cx="46%" cy="30%" r="78%">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="75%" stop-color="#f4f8fc"/>
        <stop offset="100%" stop-color="#e0e8f0"/>
      </radialGradient>
      <linearGradient id="pgBeak" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffb547"/>
        <stop offset="55%" stop-color="#f7941e"/>
        <stop offset="100%" stop-color="#e8720f"/>
      </linearGradient>
      <linearGradient id="pgScarf" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#7cc6e8"/>
        <stop offset="100%" stop-color="#3a9bd0"/>
      </linearGradient>
      <linearGradient id="pgStar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ffe14d"/>
        <stop offset="100%" stop-color="#f7b500"/>
      </linearGradient>
      <radialGradient id="pgFloor" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(0,0,0,.2)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
      </radialGradient>
    </defs>`;

  // 地面阴影
  const floor = `<ellipse cx="100" cy="191" rx="48" ry="7" fill="url(#pgFloor)"/>`;

  let leftArm, rightArm, feet, face, extra = "";

  // —— 白脸盘（黑脸上嵌一块白色区域，框住眼和嘴）——
  const faceDisk = `<path d="M100 46 C74 46 60 66 60 92 C60 116 78 130 100 130 C122 130 140 116 140 92 C140 66 126 46 100 46 Z" fill="url(#pgBelly)"/>`;

  // —— 眉毛（两撇细黑眉）——
  const brows = `
    <g fill="none" stroke="#12161c" stroke-width="3" stroke-linecap="round">
      <path d="M78 60 q10 -5 19 -1"/>
      <path d="M122 60 q-10 -5 -19 -1"/>
    </g>`;

  // 眼睛：大而圆、间距近、黑眼珠带高光（照参考图）
  const eyesOpen = `
    <g>
      <ellipse cx="89" cy="78" rx="11" ry="13" fill="#fff"/>
      <ellipse cx="111" cy="78" rx="11" ry="13" fill="#fff"/>
      <circle cx="90" cy="79" r="7" fill="#12161c"/>
      <circle cx="110" cy="79" r="7" fill="#12161c"/>
      <circle cx="92.5" cy="76" r="2.4" fill="#fff"/>
      <circle cx="112.5" cy="76" r="2.4" fill="#fff"/>
    </g>`;
  const eyesHappy = `
    <g fill="none" stroke="#12161c" stroke-width="3.6" stroke-linecap="round">
      <path d="M80 80 q9 -10 18 0"/>
      <path d="M102 80 q9 -10 18 0"/>
    </g>`;
  const eyesSearch = `
    <g>
      <ellipse cx="89" cy="78" rx="11" ry="13" fill="#fff"/>
      <ellipse cx="111" cy="78" rx="11" ry="13" fill="#fff"/>
      <circle cx="94" cy="80" r="7" fill="#12161c"/>
      <circle cx="115" cy="80" r="7" fill="#12161c"/>
      <circle cx="96.5" cy="77" r="2.2" fill="#fff"/>
      <circle cx="117.5" cy="77" r="2.2" fill="#fff"/>
    </g>`;

  // 橙色小三角扁嘴
  const beak = `
    <path d="M92 96 L108 96 L100 108 Z" fill="url(#pgBeak)"/>
    <path d="M92 96 L108 96" stroke="#c9740f" stroke-width="1.2"/>`;

  let eyeSet = eyesOpen;

  // 短圆贴身翅膀（贴在身体两侧）
  leftArm = `<path class="pg-arm-l" d="M50 116 q-16 8 -13 36 q3 11 14 7 q3 -22 3 -45 z" fill="url(#pgBody)"/>`;
  rightArm = `<path class="pg-arm-r" d="M150 116 q16 8 13 36 q-3 11 -14 7 q-3 -22 -3 -45 z" fill="url(#pgBody)"/>`;
  // 两只并排橙色小脚丫
  feet = `
    <g fill="url(#pgBeak)">
      <path d="M78 178 q-13 3 -15 13 q0 6 8 6 q11 0 18 -4 q2 -9 -11 -15 z"/>
      <path d="M122 178 q13 3 15 13 q0 6 -8 6 q-11 0 -18 -4 q-2 -9 11 -15 z"/>
    </g>`;

  if (pose === "wave") {
    rightArm = `<g class="pg-wave" style="transform-origin:150px 116px"><path d="M150 116 q26 -12 34 -34 q6 -8 12 2 q0 24 -30 48 q-14 8 -16 -16 z" fill="url(#pgBody)"/></g>`;
  } else if (pose === "scratch") {
    rightArm = `<path d="M150 116 q22 -22 26 -48 q6 -8 12 2 q0 26 -22 58 q-12 10 -16 -12 z" fill="url(#pgBody)"/>`;
    extra = `<g stroke="#f6ad55" stroke-width="3" stroke-linecap="round" opacity=".9"><path d="M150 34 l6 -10"/><path d="M164 40 l10 -6"/></g>`;
  } else if (pose === "search") {
    eyeSet = eyesSearch;
    rightArm = `<path d="M150 112 q24 -10 32 -2 q8 6 -2 12 q-16 4 -32 8 q-8 -12 2 -18 z" fill="url(#pgBody)"/>`;
    extra = `<circle cx="150" cy="58" r="12" fill="none" stroke="#f6ad55" stroke-width="3.4"/><line x1="159" y1="67" x2="170" y2="80" stroke="#f6ad55" stroke-width="4" stroke-linecap="round"/>`;
  } else if (pose === "success") {
    eyeSet = eyesHappy;
    rightArm = `<g style="transform-origin:150px 116px"><path d="M150 116 q26 -12 34 -34 q6 -8 12 2 q0 24 -30 48 q-14 8 -16 -16 z" fill="url(#pgBody)"/></g>`;
    extra = `<g stroke="#ffd93b" stroke-width="3" stroke-linecap="round"><path d="M42 50 l-10 -8"/><path d="M54 36 l-4 -12"/><path d="M160 32 l6 -12"/></g>`;
  }

  // 组合脸部（脸盘 + 眉 + 眼 + 嘴）
  face = `${faceDisk}${brows}${eyeSet}${beak}`;

  // 蓝围巾（绕颈）+ 黄色五角星吊坠
  const scarf = `
    <path d="M66 128 q34 20 68 0 q5 11 -4 18 q-30 15 -60 0 q-9 -7 -4 -18 z" fill="url(#pgScarf)"/>
    <path d="M118 142 q9 16 3 30 q-2 5 -10 3 q-5 -16 -1 -33 z" fill="url(#pgScarf)"/>
    <g transform="translate(100 150)">
      <path d="M0 -11 L3.2 -3.5 L11 -3.5 L4.8 1.5 L7 9 L0 4.3 L-7 9 L-4.8 1.5 L-11 -3.5 L-3.2 -3.5 Z" fill="url(#pgStar)" stroke="#e0a500" stroke-width="0.8"/>
    </g>`;

  return `<svg class="pg-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
    ${defs}
    ${floor}
    ${leftArm}
    ${rightArm}
    <!-- 身体：水滴形，头身一体、光头无脖子 -->
    <path d="M100 20 C60 20 48 60 48 110 C48 158 68 188 100 188 C132 188 152 158 152 110 C152 60 140 20 100 20 Z" fill="url(#pgBody)"/>
    <!-- 白肚子：从围巾下方到腹部 -->
    <path d="M100 120 C80 120 70 140 70 156 C70 174 84 184 100 184 C116 184 130 174 130 156 C130 140 120 120 100 120 Z" fill="url(#pgBelly)"/>
    <!-- 头顶高光 -->
    <ellipse cx="84" cy="42" rx="16" ry="9" fill="rgba(255,255,255,.12)"/>
    ${face}
    ${scarf}
    ${feet}
    ${extra}
  </svg>`;
}
