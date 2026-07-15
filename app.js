// 云销副驾 · 产品重构版
// 核心链路：AI / 语音 / 手动采集 → 销售确认 → 客户全流程沉淀 → 一键全景报告

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const safe = (value) => String(value == null ? "" : value).replace(/[&<>\"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const icon = (name, className = "") => `<i data-lucide="${name}"${className ? ` class="${className}"` : ""}></i>`;

let customers = [];
let reportCustomer = null;
let toastTimer = null;

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
  bindAppEvents();
  renderApp();
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
    if (event.key === "Escape") {
      closeModal();
      closeReport();
    }
  });
}

async function handleAction(event) {
  const trigger = event.target.closest("[data-action]");
  if (!trigger) { closeChoiceMenus(); return; }
  const action = trigger.dataset.action;

  if (action === "nav") return navigate(trigger.dataset.page);
  if (action === "go-today") return navigate("today");
  if (action === "theme") return toggleTheme();
  if (action === "new-customer") return openNewCustomer();
  if (action === "manual-entry") return openManualEntry(trigger.dataset.customer || state.customerId);
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
  if (action === "add-pain") return openPainForm(trigger.dataset.customer || state.customerId);
  if (action === "add-solution") return openSolutionForm(trigger.dataset.customer || state.customerId);
  if (action === "remove-pain") return removePain(trigger.dataset.customer, Number(trigger.dataset.index));
  if (action === "remove-contact") return removeContact(trigger.dataset.customer, trigger.dataset.contact);
  if (action === "toggle-choice") return toggleChoiceMenu(trigger);
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
      ${priority.length ? priority.map(renderPriorityTask).join("") : emptyState("所有待办都处理完了", "可以记录一次新的客户触达。")}
    </div>`;
}

function renderCustomerSignals(stale) {
  return `<div class="section-heading"><div><p class="eyebrow">ACCOUNT PULSE</p><h2>客户脉搏</h2></div><button class="text-button" data-action="nav" data-page="customers">全部客户 →</button></div>
    ${renderAccountPulse(stale)}`;
}

function metricCard(label, value, hint, tone) {
  return `<article class="metric-card ${tone}"><div class="metric-top"><span>${label}</span><i></i></div><strong>${value}</strong><small>${hint}</small></article>`;
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
    <section class="customer-table panel">
      <div class="table-head"><span>客户</span><span>阶段</span><span>关键联系人</span><span>下一步</span><span>最近更新</span><span></span></div>
      <div class="table-body">${filtered.length ? filtered.map(renderCustomerRow).join("") : emptyState("没有匹配的客户", "换一个关键词或清除筛选。")}</div>
    </section>
  </div>`;
}

function renderCustomerRow(customer) {
  const next = getNextTask(customer);
  const keyContact = customer.orgChain.find(p => /CEO|CTO|总监|负责人|VP/.test(p.role || "")) || customer.orgChain[0];
  return `<article class="customer-row">
    <button class="customer-cell identity-cell" data-action="open-customer" data-id="${customer.id}">${avatar(customer)}<span><b>${safe(customer.name)}</b><small>${safe(customer.fields.industry?.v || "行业未填写")} · ${customer.grade} 级</small></span></button>
    <span><b class="stage-pill stage-${customer.stage}">${stageLabel(customer.stage)}</b></span>
    <span class="muted-cell">${keyContact ? `<b>${safe(keyContact.name)}</b><small>${safe(keyContact.role)}</small>` : "待补充"}</span>
    <span class="next-cell ${next?.overdue ? "danger-text" : ""}">${next ? `<b>${safe(next.text)}</b><small>${next.overdue ? "已逾期" : formatShortDate(next.date)}</small>` : "暂无待办"}</span>
    <span class="muted-cell">${formatRelative(lastActivityDate(customer))}</span>
    <span class="row-actions"><button class="report-mini" data-action="open-report" data-id="${customer.id}">${icon("file-text")} 生成报告</button><button class="arrow-button" data-action="open-customer" data-id="${customer.id}" aria-label="打开客户">${icon("chevron-right")}</button></span>
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
  const anchor = $(".customer-tabs");
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
    <section class="customer-hero">
      <div class="customer-title-group">${avatar(customer, "large")}<div><div class="title-line"><h1>${safe(customer.name)}</h1><b class="grade-badge grade-${customer.grade}">${customer.grade}</b></div><p>${safe(customer.fields.industry?.v || "行业未填写")} · 最近更新 ${formatRelative(lastActivityDate(customer))}</p></div></div>
      <div class="customer-hero-actions"><button class="secondary-button" data-action="manual-entry" data-customer="${customer.id}">${icon("square-pen")} 手动记录</button><button class="report-button" data-action="open-report" data-id="${customer.id}"><span>${icon("file-text")}</span><b>生成全景报告</b><small>汇总全部客户信息</small></button></div>
    </section>
    <section class="customer-control-bar">
      ${renderChoiceControl(customer, "stage")}
      <div class="stage-track">${CRM_STAGES.filter(s => s.key !== "lost").map((s, i) => `<span class="${stageIndex(customer.stage) >= i ? "done" : ""} ${customer.stage === s.key ? "current" : ""}"><i></i>${s.label}</span>`).join("")}</div>
      ${renderChoiceControl(customer, "grade")}
    </section>
    ${next ? `<section class="next-action-banner ${next.overdue ? "overdue" : ""}"><span class="next-icon">${icon("move-right")}</span><div><small>${next.overdue ? "当前最紧急 · 已逾期" : "下一步行动"}</small><b>${safe(next.text)}</b><p>${safe(next.note.contact || "未指定联系人")} · ${formatShortDate(next.date)}</p></div><button class="primary-button" data-action="complete-task" data-customer="${customer.id}" data-note="${next.note.id}">${icon("check")} 标记完成</button></section>` : ""}
    <nav class="customer-tabs">${tabs.map(([key,label]) => `<button class="${state.customerTab === key ? "active" : ""}" data-action="customer-tab" data-tab="${key}">${label}</button>`).join("")}</nav>
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
      <div class="section-heading"><h2>关键关系</h2><button class="text-button" data-action="customer-tab" data-tab="relations">查看关系图 →</button></div>
      <div class="contact-stack">${contacts.length ? contacts.map(renderCompactContact).join("") : emptyState("还没有联系人", "先添加一个关键人。")}</div>
      <button class="soft-button full" data-action="add-contact" data-customer="${customer.id}">${icon("user-plus")} 添加联系人</button>
    </section>
    <section class="panel wide-panel">
      <div class="section-heading"><h2>最近推进</h2><button class="text-button" data-action="customer-tab" data-tab="timeline">查看全部 ${icon("arrow-right")}</button></div>
      <div class="mini-timeline">${recent.length ? recent.map(note => renderMiniTimeline(note)).join("") : emptyState("还没有推进记录", "记录第一次沟通。")}</div>
    </section>
    <section class="panel">
      <div class="section-heading"><h2>痛点与方案</h2><button class="text-button" data-action="customer-tab" data-tab="intel">编辑 →</button></div>
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
    <div class="timeline-card"><div class="timeline-head"><span><b>${safe(method.label)}</b>${note.contact ? ` · ${safe(note.contact)}` : ""}</span><time>${formatDateTime(note.date)}</time></div><p>${safe(note.content)}</p>
      ${note.next ? `<div class="timeline-next ${note.taskDone ? "done" : ""}"><span>${note.taskDone ? "✓ 已完成" : "→ 下一步"}</span><b>${safe(note.next)}</b><time>${formatShortDate(note.nextDate)}</time></div>` : ""}
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
  return `<div class="org-branch"><article class="person-card ${built ? "connected" : ""}"><div class="person-main"><span class="person-avatar large">${safe(person.name?.[0] || "人")}</span><div><b>${safe(person.name)}</b><small>${safe(person.role || "职位未填写")}</small></div><span class="influence-pill">${person.level === 1 ? "决策" : person.level === 2 ? "影响" : "执行"}</span></div><div class="person-contact">${person.phone ? `<span>${icon("phone")} ${safe(person.phone)}</span>` : ""}${person.wechat ? `<span>${icon("message-circle")} ${safe(person.wechat)}</span>` : ""}${person.email ? `<span>${icon("mail")} ${safe(person.email)}</span>` : ""}</div><p>${safe(person.note || "尚未补充关系备注")}</p><button class="remove-link" data-action="remove-contact" data-customer="${customer.id}" data-contact="${person.id}">删除</button></article>${children.length ? `<div class="org-children">${children.map(child => renderOrgBranch(customer, child, nextVisited)).join("")}</div>` : ""}</div>`;
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
      <section class="panel"><div class="section-heading"><h2>核心痛点</h2><button class="text-button" data-action="add-pain" data-customer="${customer.id}">＋ 添加</button></div><div class="editable-list">${customer.painPoints.length ? customer.painPoints.map((p,i) => `<article><span>${safe(p.v)}</span><button data-action="remove-pain" data-customer="${customer.id}" data-index="${i}" aria-label="删除痛点">×</button></article>`).join("") : emptyState("尚未记录痛点", "从沟通中持续补充。")}</div></section>
      <section class="panel"><div class="section-heading"><h2>匹配方案</h2><button class="text-button" data-action="add-solution" data-customer="${customer.id}">＋ 添加</button></div><div class="solution-list">${customer.solution.length ? customer.solution.map(s => `<article><b>${safe(s.product)}</b><p>${safe(s.reason)}</p></article>`).join("") : emptyState("尚未匹配方案", "基于明确痛点再提供方案。")}</div></section>
      <section class="panel"><div class="section-heading"><h2>证据材料</h2><span>${customer.assets.length}</span></div>${customer.assets.length ? `<div class="asset-list">${customer.assets.slice(0,5).map(a => `<article><span>${icon("file-check-2")}</span><div><b>${safe(a.name)}</b><small>${safe(assetTypeLabel(a.type))} · ${formatRelative(a.createdAt)}</small></div></article>`).join("")}</div>` : emptyState("还没有证据材料", "可在记录推进时上传文件。")}</section>
    </aside>
  </div>`;
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
    <section class="panel task-board"><div class="section-heading"><h2>待处理</h2><span>${open.length}</span></div><div class="task-list">${open.length ? open.map(renderTaskRow).join("") : emptyState("没有待处理任务", "新的下一步行动会自动出现在这里。")}</div></section>
    ${done.length ? `<section class="panel completed-board"><div class="section-heading"><h2>已完成</h2><span>${done.length}</span></div><div class="task-list completed">${done.slice(0,8).map(renderTaskRow).join("")}</div></section>` : ""}
  </div>`;
}

function renderTaskRow(task) {
  return `<article class="task-row ${task.done ? "done" : ""}"><button class="task-check ${task.done ? "checked" : ""}" ${task.done ? "disabled" : `data-action="complete-task" data-customer="${task.customer.id}" data-note="${task.note.id}"`} aria-label="${task.done ? "已完成" : "完成待办"}">${task.done ? "✓" : ""}</button><button class="task-content" data-action="open-customer" data-id="${task.customer.id}"><b>${safe(task.text)}</b><span>${safe(task.customer.name)} · ${safe(task.note.contact || "未指定联系人")}</span></button><b class="grade-dot grade-${task.customer.grade}">${task.customer.grade}</b><time class="${task.overdue && !task.done ? "danger-text" : ""}">${formatShortDate(task.date)}</time></article>`;
}

function renderAnalytics() {
  const allNotes = customers.flatMap(customer => customer.notes.map(note => ({ customer, note })));
  const reached = customers.reduce((sum,c) => sum + Number(c.funnel?.reached || 0), 0);
  const won = customers.reduce((sum,c) => sum + Number(c.funnel?.won || 0), 0);
  const conversion = reached ? Math.round(won / reached * 1000) / 10 : 0;
  const maxStage = Math.max(1, ...CRM_STAGES.map(s => customers.filter(c => c.stage === s.key).length));
  return `<div class="page analytics-page">
    <section class="page-heading"><div><p class="eyebrow">PERFORMANCE</p><h1>分析</h1><p>看推进节奏和客户结构，不重复展示无行动价值的数据。</p></div></section>
    <section class="metric-strip analytics-metrics">${metricCard("客户总数",customers.length,"全部在管客户","blue")}${metricCard("近 30 天跟进",allNotes.filter(x => daysSince(x.note.date) <= 30).length,"真实沟通记录","violet")}${metricCard("整体转化率",`${conversion}%`,"成交 ÷ 触达","green")}${metricCard("S/A 客户",customers.filter(c => ["S","A"].includes(c.grade)).length,"重点投入对象","red")}</section>
    <div class="analytics-grid"><section class="panel"><div class="section-heading"><div><p class="eyebrow">PIPELINE</p><h2>推进阶段分布</h2></div></div><div class="bar-chart">${CRM_STAGES.map(stage => { const count=customers.filter(c=>c.stage===stage.key).length; return `<div><span>${stage.label}</span><i><b style="width:${count/maxStage*100}%;--bar:${stage.color}"></b></i><strong>${count}</strong></div>`; }).join("")}</div></section><section class="panel"><div class="section-heading"><div><p class="eyebrow">PRIORITY MIX</p><h2>客户优先级</h2></div></div><div class="grade-chart">${GRADES.map(g => `<article style="--grade:${g.color}"><b>${g.key}</b><strong>${customers.filter(c=>c.grade===g.key).length}</strong><small>${safe(g.label.split("·").at(-1).trim())}</small></article>`).join("")}</div></section></div>
  </div>`;
}

// ---------- AI 信息收件箱 ----------
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

function analyzeCopilot() {
  const input = $("#copilotInput");
  const raw = input?.value.trim();
  if (!raw) return toast("先输入一段客户信息，或使用语音记录");
  const extracted = AIEngine.extract(raw);
  const matched = customers.find(c => raw.includes(c.name)) || customers.find(c => extracted.name && c.name.includes(extracted.name));
  const method = /微信/.test(raw) ? "wechat" : /邮件/.test(raw) ? "email" : /拜访|上门/.test(raw) ? "visit" : /会议|开会/.test(raw) ? "meeting" : "phone";
  const contactMatch = raw.match(/(?:和|跟|联系了?|对接人[：:]?)\s*([\u4e00-\u9fa5A-Za-z]{2,10})(?:沟通|聊|通话|开会|说|，|,)/);
  const nextMatch = raw.match(/(?:下一步|接下来|后续|提醒我)[：:]?([^。；\n]+)/);
  const date = extractDate(raw);
  state.aiDraft = {
    customerId: matched?.id || "",
    raw,
    found: extracted.found,
    method,
    contact: contactMatch?.[1] || "",
    next: nextMatch?.[1]?.replace(/(?:并)?提醒我.*$/, "").trim() || "",
    nextDate: date,
    attachments: [...state.copilotAttachments],
  };
  renderAIDraft();
  $("#aiDraft")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
  refreshIcons();
}

function confirmAIDraft() {
  const draft = state.aiDraft;
  if (!draft?.customerId) return toast("请选择要写入的客户");
  const customer = getCustomer(draft.customerId);
  const checks = $$(".draft-check", $("#aiDraft"));
  const isChecked = kind => checks.some(box => box.dataset.kind === kind && box.checked);
  checks.filter(box => box.dataset.kind === "field" && box.checked).forEach(box => {
    customer.fields[box.dataset.key] = { v: draft.found[box.dataset.key] };
  });
  if (isChecked("note")) {
    const attachments = [...(draft.attachments || [])];
    customer.assets.push(...attachments);
    customer.notes.push({
      id: uid("n"), method: draft.method, date: nowDateTime(), contact: draft.contact,
      place: "", content: draft.raw, next: isChecked("task") ? draft.next : "",
      nextDate: isChecked("task") ? draft.nextDate : "", taskDone: false, source: "ai-confirmed",
      attachments,
    });
  }
  persist();
  state.aiDraft = null;
  state.copilotAttachments = [];
  const input = $("#copilotInput"); if (input) input.value = "";
  renderApp();
  toast(`已写入「${customer.name}」，可随时手动修改`);
}

function discardAIDraft() {
  state.aiDraft = null;
  const host = $("#aiDraft"); if (host) host.innerHTML = "";
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
    button.classList.remove("recording");
    button.innerHTML = `${icon("mic")} 语音`;
    refreshIcons();
    input.focus();
  };
  recognition.start();
}

// ---------- 手动录入 ----------
function openNewCustomer() {
  showModal(`<div class="modal-head"><div><p class="eyebrow">NEW ACCOUNT</p><h2 id="modalTitle">新建客户</h2></div><button class="icon-button" data-action="close-modal">${icon("x")}</button></div><form class="modal-form" data-form="new-customer"><label>客户名称<input name="name" required autofocus placeholder="公司或组织名称" /></label><label>所属行业<input name="industry" placeholder="例如：游戏、零售、SaaS" /></label><fieldset class="choice-fieldset"><legend>重点等级</legend><div class="option-cards grade-options">${GRADES.map(g => `<label><input type="radio" name="grade" value="${g.key}" ${g.key === "B" ? "checked" : ""}/><span class="grade-option grade-${g.key}">${g.key}</span><b>${safe(g.label.split("·").at(-1).trim())}</b></label>`).join("")}</div></fieldset><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("arrow-right")} 创建并进入档案</button></div></form>`);
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

function openManualEntry(customerId) {
  const selected = customerId || state.customerId || "";
  showModal(`<div class="modal-head"><div><p class="eyebrow">PROGRESS ENTRY</p><h2 id="modalTitle">手动记录客户推进</h2></div><button class="icon-button" data-action="close-modal">${icon("x")}</button></div><form class="modal-form" data-form="manual-entry"><label>关联客户<div class="modern-select"><select name="customerId" required><option value="">请选择客户</option>${customers.map(c => `<option value="${c.id}" ${selected === c.id ? "selected" : ""}>${safe(c.name)}</option>`).join("")}</select>${icon("chevron-down")}</div></label><fieldset class="choice-fieldset"><legend>沟通方式</legend><div class="option-cards method-options">${CONTACT_METHODS.map((m,i) => `<label><input type="radio" name="method" value="${m.key}" ${i===0?"checked":""}/><span>${icon(methodIconName(m.key))}</span><b>${safe(m.label)}</b></label>`).join("")}</div></fieldset><label>沟通时间<input type="datetime-local" name="date" value="${toLocalInput(new Date())}" /></label><label>对接人<input name="contact" placeholder="姓名或职位" /></label><label>沟通内容<textarea name="content" rows="5" required placeholder="记录对方态度、需求、异议和重要事实"></textarea></label><div class="form-row"><label>下一步行动<input name="next" placeholder="例如：发送方案、预约拜访" /></label><label>提醒日期<input type="date" name="nextDate" /></label></div><label class="file-field">${icon("paperclip")} 佐证材料<input type="file" name="files" multiple /><small>支持图片和常见文件；材料会关联到本次推进记录</small></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存推进记录</button></div></form>`);
}

async function submitManualEntry(form) {
  const data = new FormData(form);
  const customer = getCustomer(data.get("customerId"));
  if (!customer) return toast("请选择关联客户");
  const files = Array.from(form.elements.files.files || []);
  const attachments = [];
  for (const file of files) {
    try {
      const meta = await AssetEngine.readFile(file);
      const asset = AssetEngine.makeAsset("file", meta, { caption: "随推进记录上传" });
      customer.assets.push(asset); attachments.push(asset);
    } catch (error) { console.warn("Attachment skipped", error); }
  }
  customer.notes.push({ id: uid("n"), method: data.get("method"), date: normalizeDateInput(data.get("date")), contact: String(data.get("contact") || "").trim(), place: "", content: String(data.get("content") || "").trim(), next: String(data.get("next") || "").trim(), nextDate: String(data.get("nextDate") || ""), taskDone: false, source: "manual", attachments });
  persist(); closeModal();
  if (state.customerId === customer.id) state.customerTab = "timeline";
  renderApp(); toast("客户推进记录已保存");
}

function openContactForm(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) return;
  showModal(`<div class="modal-head"><div><p class="eyebrow">STAKEHOLDER</p><h2 id="modalTitle">添加关键联系人</h2></div><button class="icon-button" data-action="close-modal">${icon("x")}</button></div><form class="modal-form" data-form="contact"><input type="hidden" name="customerId" value="${customer.id}" /><div class="form-row"><label>姓名<input name="name" required /></label><label>职位<input name="role" placeholder="例如：CTO、采购负责人" /></label></div><fieldset class="choice-fieldset"><legend>角色层级</legend><div class="option-cards role-options"><label><input type="radio" name="level" value="1"/><span>${icon("crown")}</span><b>决策层</b></label><label><input type="radio" name="level" value="2" checked/><span>${icon("users")}</span><b>影响层</b></label><label><input type="radio" name="level" value="3"/><span>${icon("wrench")}</span><b>执行层</b></label></div></fieldset><label>上级<div class="modern-select"><select name="pid"><option value="">无上级</option>${customer.orgChain.map(p => `<option value="${p.id}">${safe(p.name)} · ${safe(p.role)}</option>`).join("")}</select>${icon("chevron-down")}</div></label><div class="form-row"><label>电话<input name="phone" /></label><label>微信<input name="wechat" /></label></div><label>邮箱<input name="email" type="email" /></label><label>关系备注<textarea name="note" rows="3" placeholder="影响力、态度、关注点、建联情况"></textarea></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("user-plus")} 保存联系人</button></div></form>`);
}

function submitContact(form) {
  const data = new FormData(form); const customer = getCustomer(data.get("customerId")); if (!customer) return;
  customer.orgChain.push({ id: uid("o"), pid: data.get("pid") || null, name: String(data.get("name") || "").trim(), role: String(data.get("role") || "").trim(), level: Number(data.get("level") || 2), phone: String(data.get("phone") || "").trim(), wechat: String(data.get("wechat") || "").trim(), email: String(data.get("email") || "").trim(), note: String(data.get("note") || "").trim(), photo: "" });
  persist(); closeModal(); renderApp(); toast("联系人已加入关系图");
}

function openPainForm(customerId) {
  showSimpleTextForm("pain", customerId, "添加客户痛点", "痛点描述", "记录客户明确表达的业务问题或顾虑");
}

function openSolutionForm(customerId) {
  const customer = getCustomer(customerId); if (!customer) return;
  showModal(`<div class="modal-head"><div><p class="eyebrow">SOLUTION</p><h2 id="modalTitle">添加匹配方案</h2></div><button class="icon-button" data-action="close-modal">${icon("x")}</button></div><form class="modal-form" data-form="solution"><input type="hidden" name="customerId" value="${customer.id}" /><label>产品或方案<input name="product" required placeholder="例如：全球应用加速 GAAP" /></label><label>匹配理由<textarea name="reason" rows="4" required placeholder="它解决客户的哪个明确痛点？"></textarea></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存方案</button></div></form>`);
}

function showSimpleTextForm(type, customerId, title, label, placeholder) {
  const customer=getCustomer(customerId); if(!customer) return;
  showModal(`<div class="modal-head"><div><p class="eyebrow">CUSTOMER INTELLIGENCE</p><h2 id="modalTitle">${title}</h2></div><button class="icon-button" data-action="close-modal">${icon("x")}</button></div><form class="modal-form" data-form="${type}"><input type="hidden" name="customerId" value="${customer.id}" /><label>${label}<textarea name="value" rows="4" required placeholder="${placeholder}"></textarea></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存</button></div></form>`);
}

function submitPain(form) { const data=new FormData(form), customer=getCustomer(data.get("customerId")); if(!customer)return; customer.painPoints.push({v:String(data.get("value")||"").trim()}); persist(); closeModal(); renderApp(); toast("痛点已保存"); }
function submitSolution(form) { const data=new FormData(form), customer=getCustomer(data.get("customerId")); if(!customer)return; customer.solution.push({product:String(data.get("product")||"").trim(),reason:String(data.get("reason")||"").trim()}); persist(); closeModal(); renderApp(); toast("方案已保存"); }

function removePain(customerId, index) { const c=getCustomer(customerId); if(!c?.painPoints[index])return; c.painPoints.splice(index,1); persist(); renderApp(); }
function removeContact(customerId, contactId) { const c=getCustomer(customerId); if(!c)return; c.orgChain = c.orgChain.filter(p=>p.id!==contactId); c.orgChain.forEach(p=>{if(p.pid===contactId)p.pid=null;}); persist(); renderApp(); toast("联系人已删除，下属已移到顶层"); }

function updateCustomerStage(customerId, stage) {
  const customer=getCustomer(customerId); if(!customer || customer.stage===stage)return;
  customer.stage=stage; customer.stageHistory.push({stage,date:nowDateTime(),note:"手动更新阶段"}); persist("客户阶段已更新"); renderApp();
}
function updateCustomerGrade(customerId, grade) { const customer=getCustomer(customerId); if(!customer)return; customer.grade=grade; persist("客户优先级已更新"); renderApp(); }
function updateIntelField(target) { const customer=getCustomer(target.dataset.customer); if(!customer)return; customer.fields[target.dataset.intelField] = {v:target.value.trim()}; persist(); toast("情报已保存"); }

// ---------- 全景报告 ----------
function openReport(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) return;
  reportCustomer = customer;
  $("#reportDocument").innerHTML = buildReport(customer);
  $("#reportStatus").textContent = `生成于 ${formatDateTime(nowDateTime())} · 可继续返回档案修改`;
  $("#reportLayer").classList.remove("hidden");
  document.body.classList.add("report-open");
  refreshIcons();
  window.scrollTo({ top: 0 });
}

function closeReport() {
  $("#reportLayer").classList.add("hidden");
  document.body.classList.remove("report-open");
  reportCustomer = null;
}

function buildReport(customer) {
  const notes=[...customer.notes].sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const tasks=getTasks(customer).filter(t=>!t.done);
  const publicFields=FIELD_DEFS.filter(d=>d.public);
  const privateFields=FIELD_DEFS.filter(d=>!d.public);
  const raid=customer.raidFile || {};
  const reportRow=(label,value)=>`<div class="report-field"><span>${safe(label)}</span><p>${safe(value || "未填写")}</p></div>`;
  return `<header class="report-cover"><div class="report-brand"><span>Y</span> 云销副驾</div><p class="report-type">客户全景报告 / ACCOUNT 360</p><h1>${safe(customer.name)}</h1><div class="report-cover-meta"><span>${customer.grade} 级客户</span><span>${stageLabel(customer.stage)}</span><span>${safe(customer.fields.industry?.v || "行业未填写")}</span></div><p class="report-date">报告生成日期：${formatLongDate(new Date())}</p></header>
  <section class="report-section report-executive"><div class="report-section-title"><span>01</span><h2>执行摘要</h2></div><div class="report-summary-grid">${reportRow("下一步行动",tasks[0]?.text || raid.plan?.action)}${reportRow("核心机会",customer.painPoints[0]?.v)}${reportRow("关系进展",customer.fields.relation?.v)}${reportRow("推荐切入",customer.solution[0]?.product)}</div></section>
  <section class="report-section"><div class="report-section-title"><span>02</span><h2>客户基本面</h2></div><div class="report-data-grid">${publicFields.map(d=>reportRow(d.label,customer.fields[d.key]?.v)).join("")}</div></section>
  <section class="report-section"><div class="report-section-title"><span>03</span><h2>一线私有情报</h2></div><div class="report-data-grid single">${privateFields.map(d=>reportRow(d.label,customer.fields[d.key]?.v)).join("")}</div></section>
  <section class="report-section"><div class="report-section-title"><span>04</span><h2>关键关系与组织架构</h2></div>${customer.orgChain.length?`<table class="report-table"><thead><tr><th>姓名</th><th>职位 / 层级</th><th>联系方式</th><th>关系备注</th></tr></thead><tbody>${customer.orgChain.map(p=>`<tr><td><b>${safe(p.name)}</b></td><td>${safe(p.role)} / ${p.level===1?"决策层":p.level===2?"影响层":"执行层"}</td><td>${safe([p.phone,p.wechat,p.email].filter(Boolean).join(" · ") || "未填写")}</td><td>${safe(p.note || "未填写")}</td></tr>`).join("")}</tbody></table>`:reportEmpty("尚未建立关键关系")}</section>
  <section class="report-section"><div class="report-section-title"><span>05</span><h2>痛点、竞对与方案</h2></div><div class="report-two-col"><div><h3>核心痛点</h3>${reportList(customer.painPoints.map(p=>p.v))}<h3>外部竞对</h3>${reportList((raid.competitors||[]).map(c=>`${c.name}：${c.coverage}；优势 ${c.pros}；劣势 ${c.cons}`))}</div><div><h3>匹配方案</h3>${customer.solution.length?customer.solution.map(s=>`<article class="report-solution"><b>${safe(s.product)}</b><p>${safe(s.reason)}</p></article>`).join(""):reportEmpty("尚未匹配方案")}<h3>商务 / 技术策略</h3><p class="report-paragraph">${safe(raid.solution?.biz || "未填写")}</p><p class="report-paragraph">${safe(raid.solution?.tech || "未填写")}</p></div></div></section>
  <section class="report-section page-break"><div class="report-section-title"><span>06</span><h2>全流程客户推进记录</h2></div>${notes.length?`<div class="report-timeline">${notes.map(note=>`<article><time>${formatDateTime(note.date)}</time><div><b>${safe(methodMeta(note.method).label)}${note.contact?` · ${safe(note.contact)}`:""}</b><p>${safe(note.content)}</p>${note.next?`<small>${note.taskDone?"已完成":"下一步"}：${safe(note.next)} · ${formatShortDate(note.nextDate)}</small>`:""}</div></article>`).join("")}</div>`:reportEmpty("尚无推进记录")}</section>
  <section class="report-section"><div class="report-section-title"><span>07</span><h2>阶段历史与当前待办</h2></div><div class="report-two-col"><div><h3>阶段历史</h3>${reportList((customer.stageHistory||[]).map(h=>`${formatDateTime(h.date)} · ${stageLabel(h.stage)} · ${h.note||""}`))}</div><div><h3>当前待办</h3>${reportList(tasks.map(t=>`${formatShortDate(t.date)} · ${t.text}${t.note.contact?` · ${t.note.contact}`:""}`))}</div></div></section>
  <section class="report-section"><div class="report-section-title"><span>08</span><h2>阶段目标与攻坚计划</h2></div><div class="report-data-grid single">${reportRow("3 个月目标",raid.goals?.g1)}${reportRow("6 个月目标",raid.goals?.g2)}${reportRow("长期布局",raid.goals?.g3)}${reportRow("下一步攻坚动作",raid.plan?.action)}${reportRow("需要支持事项",raid.plan?.support)}</div></section>
  <section class="report-section"><div class="report-section-title"><span>09</span><h2>材料与证据索引</h2></div>${customer.assets.length?`<table class="report-table"><thead><tr><th>材料名称</th><th>类型</th><th>关联说明</th><th>录入时间</th></tr></thead><tbody>${customer.assets.map(a=>`<tr><td>${safe(a.name)}</td><td>${safe(assetTypeLabel(a.type))}</td><td>${safe(a.caption||"未填写")}</td><td>${formatDateTime(a.createdAt)}</td></tr>`).join("")}</tbody></table>`:reportEmpty("尚无材料附件")}</section>
  <footer class="report-footer"><b>云销副驾 · 客户全景报告</b><p>本报告由客户档案实时汇总生成。AI 提取内容均经销售确认；未填写项明确保留，不进行虚构补全。</p></footer>`;
}

function reportList(items) { return items.filter(Boolean).length ? `<ul class="report-list">${items.filter(Boolean).map(item=>`<li>${safe(item)}</li>`).join("")}</ul>` : reportEmpty("暂无内容"); }
function reportEmpty(text) { return `<p class="report-empty">${safe(text)}</p>`; }

function exportWordReport() {
  if (!reportCustomer) return;
  const styles = `body{font-family:Arial,'Microsoft YaHei',sans-serif;color:#162033;line-height:1.6;margin:36px}.report-cover{padding:40px 0;border-bottom:3px solid #2864dc}.report-cover h1{font-size:34px}.report-section{margin:32px 0}.report-section-title{display:flex;gap:12px;align-items:center;border-bottom:1px solid #ccd5e3}.report-section-title span{color:#2864dc;font-weight:bold}.report-data-grid,.report-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.report-field{border:1px solid #dce2ea;padding:12px}.report-field span{color:#69758a;font-size:12px}.report-table{width:100%;border-collapse:collapse}.report-table th,.report-table td{border:1px solid #dce2ea;padding:8px;text-align:left}.report-two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px}.report-footer{margin-top:50px;border-top:1px solid #dce2ea;padding-top:16px;color:#69758a}`;
  const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${styles}</style></head><body>${$("#reportDocument").innerHTML}</body></html>`;
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
function extractDate(text) { const iso=text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/); if(iso)return `${iso[1]}-${String(iso[2]).padStart(2,"0")}-${String(iso[3]).padStart(2,"0")}`; const md=text.match(/(\d{1,2})月(\d{1,2})[日号]?/); if(md)return `${new Date().getFullYear()}-${String(md[1]).padStart(2,"0")}-${String(md[2]).padStart(2,"0")}`; return ""; }

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
function toggleTheme() { const next=document.documentElement.dataset.theme==="dark"?"light":"dark"; document.documentElement.dataset.theme=next; localStorage.setItem(THEME_KEY,next); }
function showModal(content) { $("#modalPanel").innerHTML=content; $("#modalLayer").classList.remove("hidden"); document.body.classList.add("modal-open"); refreshIcons(); requestAnimationFrame(()=>$("#modalPanel input[autofocus]")?.focus()); }
function closeModal() { $("#modalLayer").classList.add("hidden"); document.body.classList.remove("modal-open"); }
function toast(message) { const el=$("#toast"); clearTimeout(toastTimer); el.textContent=message; el.classList.remove("hidden"); toastTimer=setTimeout(()=>el.classList.add("hidden"),2600); }
function emptyState(title,copy) { return `<div class="empty-state"><span>·</span><b>${safe(title)}</b><p>${safe(copy)}</p></div>`; }
