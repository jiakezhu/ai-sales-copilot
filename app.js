// 云销副驾 · 产品重构版
// 核心链路：AI / 语音 / 手动采集 → 销售确认 → 客户全流程沉淀 → 一键全景报告

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const safe = (value) => String(value == null ? "" : value).replace(/[&<>\"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
const icon = (name, className = "") => `<i data-lucide="${name}"${className ? ` class="${className}"` : ""}></i>`;
const DIALOG_FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

let customers = [];
let reportCustomer = null;
let customerImportRows = [];
let customerImportFormat = "rows";
let customerImportFileName = "";
let customerImportSelectedRows = new Set();
let selectedCustomerIds = new Set();
let customerMultiSelectEnabled = false;
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
  taskFocus: null,
  analyticsPeriod: "this-week",
  analyticsMetric: "",
  analyticsAiSummary: "",
  analyticsAiPeriodKey: "",
  analyticsAiLoading: false,
  analyticsActionSelections: {},
};

const NAV_ITEMS = [
  { key: "today", label: "今日", icon: "house" },
  { key: "customers", label: "客户", icon: "building-2" },
  { key: "tasks", label: "待办", icon: "circle-check" },
  { key: "analytics", label: "分析", icon: "chart-no-axes-column-increasing" },
];

const OPPORTUNITY_DIMENSIONS = [
  { key: "pain", label: "痛苦", icon: "heart-crack", hint: "客户是否明确承认业务痛点" },
  { key: "power", label: "权力", icon: "crown", hint: "是否接触并确认真正决策者" },
  { key: "vision", label: "构想", icon: "lightbulb", hint: "客户是否认可解决问题所需能力" },
  { key: "value", label: "价值", icon: "chart-no-axes-combined", hint: "收益是否被客户认可并量化" },
  { key: "control", label: "控制", icon: "route", hint: "是否能推动并影响购买流程" },
  { key: "milestone", label: "里程碑", icon: "flag", hint: "机会是否有明确且已完成的阶段成果" },
];

const SALES_ASSET_TYPES = [
  { key: "account-onepager", label: "客户一页纸", icon: "contact-round", description: "客户背景、机会、关系与下一步的单页摘要" },
  { key: "followup-email", label: "会后跟进邮件", icon: "mail-check", description: "基于最近会议和双方约定生成可直接修改的邮件" },
  { key: "solution-outline", label: "方案大纲", icon: "panels-top-left", description: "从客户问题到验证路径的专业方案结构" },
  { key: "negotiation-card", label: "谈判作战卡", icon: "handshake", description: "目标、交换条件、红线与异议处理的一页作战卡" },
];

const INTEL_SOURCES = [
  ["", "来源待补充"], ["customer", "客户自报"], ["website", "官网"], ["qcc", "企查查"],
  ["tyc", "天眼查"], ["qxb", "企信慧眼"], ["web", "全网检索"], ["panshi", "磐石"],
];
const INTEL_CONFIDENCES = [["unverified", "待核"], ["high", "高置信"], ["medium", "中置信"], ["low", "低置信"]];
const ADMITTANCE_CHANNELS = [["", "待核"], ["direct", "官网直客"], ["longtail", "长尾"], ["ka", "KA"], ["region", "区域"], ["partner", "渠道/合作伙伴"]];
const ADMITTANCE_STATUSES = [["unverified", "待核"], ["clear", "无主报备"], ["reported", "已报备"], ["followed", "已有人跟"]];
const PHONE_TYPES = [["unverified", "待核验"], ["direct", "直联号码"], ["agent", "代记账/第三方"]];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  initTheme();
  try {
    if (typeof AuthCoordinator !== "undefined" && AuthCoordinator.boot) await AuthCoordinator.boot();
    else if (typeof CloudAuth !== "undefined" && CloudAuth.boot) await CloudAuth.boot();
  } catch (error) {
    console.warn("Authentication boot unavailable, using local data", error);
  }
  customers = CRM.load().map(ensureCustomerShape);
  fillStaticPenguins();
  bindAppEvents();
  updateCurrentUserUI();
  renderApp();
}

// 把 HTML 里 [data-penguin] 占位符填充为对应姿态的企鹅图片
function updateCurrentUserUI() {
  const user = typeof AuthCoordinator !== "undefined" ? AuthCoordinator.user : null;
  const name = user?.name || user?.displayName || user?.email || "我的工作台";
  const nameNode = $("#currentUserName");
  const metaNode = $("#currentUserMeta");
  const avatarNode = $("#currentUserAvatar");
  const logoutButton = $(".user-logout");
  if (nameNode) nameNode.textContent = name;
  if (metaNode) metaNode.textContent = user?.email || (user ? "数据仅当前账号可见" : "本地演示模式");
  if (avatarNode) avatarNode.textContent = String(name).trim().slice(0, 1) || "销";
  if (logoutButton) logoutButton.hidden = !user;
}

function fillStaticPenguins() {
  document.querySelectorAll("[data-penguin]").forEach(el => {
    if (el.dataset.penguinDone) return;
    el.innerHTML = penguinSVG(el.dataset.penguin || "stand");
    el.dataset.penguinDone = "1";
  });
}

function ensureCustomerShape(customer) {
  const seed = typeof SEED_CUSTOMERS !== "undefined" ? SEED_CUSTOMERS.find(item => item.id === customer.id) : null;
  const seedCopy = key => JSON.parse(JSON.stringify(seed?.[key] || (["painChain", "negotiationBrief"].includes(key) ? {} : [])));
  customer.fields ||= {};
  FIELD_DEFS.forEach(def => {
    const current = customer.fields[def.key];
    customer.fields[def.key] = current && typeof current === "object"
      ? { v: "", source: "", confidence: "unverified", verifiedAt: "", ...current }
      : { v: String(current || ""), source: "", confidence: "unverified", verifiedAt: "" };
  });
  customer.notes ||= [];
  customer.assets ||= [];
  customer.orgChain ||= [];
  customer.orgChain.forEach(person => { if (person.phone && !person.phoneType) person.phoneType = "unverified"; });
  customer.painPoints ||= [];
  customer.solution ||= [];
  customer.solution = customer.solution.map(item => item && typeof item === "object" ? { ...item } : item);
  customer.admittance = { status: "unverified", reportedBy: "", channel: "", uin: "", groupGid: "", source: "", confidence: "unverified", verifiedAt: "", ...(customer.admittance || {}) };
  customer.bidding ||= [];
  customer.qualifications ||= [];
  customer.guidedActions ||= {};
  customer.guidedConfirmations ||= {};
  customer.meetingPreps ||= [];
  customer.meetingReviews ||= [];
  customer.opportunityDiagnosis ||= {};
  customer.businessBrief ||= {};
  if (!Array.isArray(customer.marketNews)) customer.marketNews = seedCopy("marketNews");
  if (!Array.isArray(customer.hiringSignals)) customer.hiringSignals = seedCopy("hiringSignals");
  if (!customer.painChain || typeof customer.painChain !== "object") customer.painChain = seedCopy("painChain");
  if (!Array.isArray(customer.jointWorkPlan)) customer.jointWorkPlan = seedCopy("jointWorkPlan");
  if (Number(customer.phase2SeedVersion || 0) < 2 && seed) {
    if (!customer.marketNews.length) customer.marketNews = seedCopy("marketNews");
    if (!customer.hiringSignals.length) customer.hiringSignals = seedCopy("hiringSignals");
    if (!Object.values(customer.painChain).some(Boolean)) customer.painChain = seedCopy("painChain");
    if (!customer.jointWorkPlan.length) customer.jointWorkPlan = seedCopy("jointWorkPlan");
    customer.phase2SeedVersion = 2;
  }
  if (!customer.negotiationBrief || typeof customer.negotiationBrief !== "object") customer.negotiationBrief = seedCopy("negotiationBrief");
  if (!Array.isArray(customer.salesAssets)) customer.salesAssets = seedCopy("salesAssets");
  if (Number(customer.phase3SeedVersion || 0) < 1 && seed) {
    if (!Object.values(customer.negotiationBrief).some(Boolean)) customer.negotiationBrief = seedCopy("negotiationBrief");
    if (!customer.salesAssets.length) customer.salesAssets = seedCopy("salesAssets");
    customer.phase3SeedVersion = 1;
  }
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
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === "dark" ? "dark" : "light");
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
  if (action === "logout") return AuthCoordinator?.logout?.();
  if (action === "new-customer") return openNewCustomer();
  if (action === "import-customers") return openCustomerImport();
  if (action === "download-import-template") return downloadCustomerImportTemplate();
  if (action === "select-all-import-customers") return setCustomerImportSelection(true);
  if (action === "clear-import-customers") return setCustomerImportSelection(false);
  if (action === "delete-customer") return openDeleteCustomer(trigger.dataset.id || trigger.dataset.customer || state.customerId);
  if (action === "delete-selected-customers") return openDeleteSelectedCustomers();
  if (action === "clear-customer-selection") { selectedCustomerIds = new Set(); return renderApp(); }
  if (action === "toggle-customer-multi-select") {
    customerMultiSelectEnabled = !customerMultiSelectEnabled;
    if (!customerMultiSelectEnabled) selectedCustomerIds = new Set();
    return renderApp();
  }
  if (action === "manual-entry") return openManualEntry(trigger.dataset.customer || state.customerId);
  if (action === "open-meeting-card") return openMeetingPrep(trigger.dataset.customer || state.customerId, trigger.dataset.prep || "");
  if (action === "open-guided-confirm") return openGuidedConfirmation(trigger.dataset.customer || state.customerId, trigger.dataset.guided);
  if (action === "edit-opportunity-diagnosis") return openOpportunityDiagnosis(trigger.dataset.customer || state.customerId);
  if (action === "edit-business-brief") return openBusinessBrief(trigger.dataset.customer || state.customerId);
  if (action === "open-meeting-review") return openMeetingReview(trigger.dataset.customer || state.customerId, trigger.dataset.prep);
  if (action === "add-market-news") return openMarketNews(trigger.dataset.customer || state.customerId);
  if (action === "add-hiring-signal") return openHiringSignal(trigger.dataset.customer || state.customerId);
  if (action === "edit-pain-chain") return openPainChain(trigger.dataset.customer || state.customerId);
  if (action === "add-work-plan") return openWorkPlanItem(trigger.dataset.customer || state.customerId);
  if (action === "edit-work-plan") return openWorkPlanItem(trigger.dataset.customer || state.customerId, trigger.dataset.item);
  if (action === "toggle-work-plan") return toggleWorkPlanItem(trigger.dataset.customer || state.customerId, trigger.dataset.item);
  if (action === "edit-negotiation-brief") return openNegotiationBrief(trigger.dataset.customer || state.customerId);
  if (action === "generate-sales-asset") return generateSalesAsset(trigger.dataset.customer || state.customerId, trigger.dataset.type);
  if (action === "open-sales-asset") return openSalesAsset(trigger.dataset.customer || state.customerId, trigger.dataset.asset);
  if (action === "copy-sales-asset") return copySalesAsset(trigger.dataset.customer || state.customerId, trigger.dataset.asset);
  if (action === "download-sales-asset") return downloadSalesAsset(trigger.dataset.customer || state.customerId, trigger.dataset.asset);
  if (action === "remove-sales-asset") return removeSalesAsset(trigger.dataset.customer || state.customerId, trigger.dataset.asset);
  if (action === "resolve-guided-action") return updateGuidedAction(trigger.dataset.customer || state.customerId, trigger.dataset.guided, "resolved");
  if (action === "defer-guided-action") return updateGuidedAction(trigger.dataset.customer || state.customerId, trigger.dataset.guided, "deferred");
  if (action === "dismiss-guided-action") return updateGuidedAction(trigger.dataset.customer || state.customerId, trigger.dataset.guided, "dismissed");
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
  if (action === "complete-task") return setTaskCompletion(trigger.dataset.customer, trigger.dataset.note, true);
  if (action === "restore-task") return setTaskCompletion(trigger.dataset.customer, trigger.dataset.note, false);
  if (action === "open-report") return openReport(trigger.dataset.id || state.customerId);
  if (action === "close-report") return closeReport();
  if (action === "export-pdf") return window.print();
  if (action === "export-word") return exportWordReport();
  if (action === "close-modal") return closeModal();
  if (action === "add-contact") return openContactForm(trigger.dataset.customer || state.customerId);
  if (action === "edit-contact") return openContactForm(trigger.dataset.customer, trigger.dataset.contact);
  if (action === "add-bidding") return openBiddingForm(trigger.dataset.customer || state.customerId);
  if (action === "remove-bidding") return removeBidding(trigger.dataset.customer, trigger.dataset.item);
  if (action === "add-qualification") return openQualificationForm(trigger.dataset.customer || state.customerId);
  if (action === "remove-qualification") return removeQualification(trigger.dataset.customer, trigger.dataset.item);
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
  if (action === "set-analytics-period") return setAnalyticsPeriod(trigger.dataset.period);
  if (action === "open-analytics-metric") return openAnalyticsMetric(trigger.dataset.metric);
  if (action === "open-analytics-customer") { closeModal(); return openCustomer(trigger.dataset.id); }
  if (action === "copy-period-review") return copyPeriodReview();
  if (action === "polish-period-review") return polishPeriodReview();
  if (action === "toggle-review-action") return toggleReviewAction(trigger.dataset.actionId, trigger.checked);
  if (action === "reset-filters") { state.query = ""; state.stageFilter = "all"; $("#globalSearch").value = ""; return renderApp(); }
}

async function handleChange(event) {
  const target = event.target;
  if (target.id === "customerImportFile") return previewCustomerImport(target.files?.[0]);
  if (target.id === "customerImportStrategy") return renderCustomerImportPreview(target.value);
  if (target.matches("[data-import-customer-row]")) {
    const row = Number(target.dataset.importCustomerRow);
    if (target.checked) customerImportSelectedRows.add(row);
    else customerImportSelectedRows.delete(row);
    return renderCustomerImportPreview($("#customerImportStrategy")?.value || "skip");
  }
  if (target.matches("[data-customer-select]")) {
    const customerId = String(target.dataset.customerSelect || "");
    if (target.checked) selectedCustomerIds.add(customerId);
    else selectedCustomerIds.delete(customerId);
    return renderApp();
  }
  if (target.id === "customerSelectAll") {
    getFilteredCustomers().forEach(customer => {
      if (target.checked) selectedCustomerIds.add(customer.id);
      else selectedCustomerIds.delete(customer.id);
    });
    return renderApp();
  }
  if (target.id === "stageFilter") {
    state.stageFilter = target.value;
    return renderApp();
  }
  if (target.matches("[data-customer-stage]")) return updateCustomerStage(target.dataset.customerStage, target.value);
  if (target.matches("[data-customer-grade]")) return updateCustomerGrade(target.dataset.customerGrade, target.value);
  if (target.matches("[data-intel-field]")) return updateIntelField(target);
  if (target.matches("[data-intel-meta]")) return updateIntelMeta(target);
  if (target.matches("[data-admittance-field]")) return updateAdmittanceField(target);
  if (target.id === "copilotFiles") return handleCopilotFiles(target.files);
  if (target.matches(".diagnosis-range")) {
    const output = target.closest("label")?.querySelector("output");
    if (output) output.textContent = target.value;
    return;
  }
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
  if (type === "customer-import") return submitCustomerImport(event.target);
  if (type === "delete-customer") return submitDeleteCustomer(event.target);
  if (type === "delete-selected-customers") return submitDeleteSelectedCustomers();
  if (type === "manual-entry") return submitManualEntry(event.target);
  if (type === "meeting-prep") return submitMeetingPrep(event.target);
  if (type === "guided-confirm") return submitGuidedConfirmation(event.target);
  if (type === "opportunity-diagnosis") return submitOpportunityDiagnosis(event.target);
  if (type === "business-brief") return submitBusinessBrief(event.target);
  if (type === "meeting-review") return submitMeetingReview(event.target);
  if (type === "market-news") return submitMarketNews(event.target);
  if (type === "hiring-signal") return submitHiringSignal(event.target);
  if (type === "pain-chain") return submitPainChain(event.target);
  if (type === "work-plan") return submitWorkPlan(event.target);
  if (type === "negotiation-brief") return submitNegotiationBrief(event.target);
  if (type === "contact") return submitContact(event.target);
  if (type === "bidding") return submitBidding(event.target);
  if (type === "qualification") return submitQualification(event.target);
  if (type === "pain") return submitPain(event.target);
  if (type === "solution") return submitSolution(event.target);
}

function navigate(page) {
  state.page = page;
  state.customerId = null;
  state.customerTab = "overview";
  state.taskFocus = null;
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
  const selectAllCustomers = $("#customerSelectAll");
  if (selectAllCustomers) selectAllCustomers.indeterminate = selectAllCustomers.dataset.partial === "true";
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
        <div class="today-heading"><p class="today-date">${icon("calendar-days")}<span>${formatHomeDate(new Date())}</span></p><h1>帮助客户成功，就是你的成功</h1></div>
      </header>
      <section class="ai-assistant-card" id="copilotCard">
        <span class="qq-penguin qq-penguin--assistant" aria-hidden="true">${penguinSVG("wave")}</span>
        <div class="ai-assistant-copy"><h2>告诉 Sales Buddy 刚发生了什么</h2><p>会议、电话、微信和材料，都可以整理成清晰的客户推进记录。</p></div>
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
    <span><b>${safe(item.customer.name)}</b><small>${stageLabel(item.customer.stage)} · ${stale ? `${item.days} 天未更新` : (next ? `下一步：${safe(next.text)}` : "暂无待办")}</small></span>${icon("chevron-right")}
  </button>`;
}

function getFilteredCustomers() {
  return customers.filter(customer => {
    const haystack = [customer.name, customer.fields.industry?.v, ...customer.orgChain.map(x => x.name)].join(" ").toLowerCase();
    return (!state.query || haystack.includes(state.query)) && (state.stageFilter === "all" || customer.stage === state.stageFilter);
  });
}

function pruneCustomerSelection() {
  const existingIds = new Set(customers.map(customer => customer.id));
  selectedCustomerIds = new Set(Array.from(selectedCustomerIds).filter(id => existingIds.has(id)));
}

function renderCustomers() {
  pruneCustomerSelection();
  if (!customerMultiSelectEnabled && selectedCustomerIds.size) selectedCustomerIds = new Set();
  const filtered = getFilteredCustomers();
  const selectedCount = selectedCustomerIds.size;
  const selectedVisibleCount = filtered.filter(customer => selectedCustomerIds.has(customer.id)).length;
  const allVisibleSelected = filtered.length > 0 && selectedVisibleCount === filtered.length;
  const partiallySelected = selectedVisibleCount > 0 && !allVisibleSelected;
  return `<div class="page customers-page ${customerMultiSelectEnabled ? "multi-select-active" : ""}">
    <section class="page-heading">
      <div><p class="eyebrow">ACCOUNT WORKSPACE</p><div class="customer-title-row"><h1>客户</h1><button class="multi-select-toggle ${customerMultiSelectEnabled ? "is-active" : ""}" data-action="toggle-customer-multi-select" aria-pressed="${customerMultiSelectEnabled}">${icon(customerMultiSelectEnabled ? "x" : "list-checks")} ${customerMultiSelectEnabled ? "关闭多选" : "开启多选"}</button></div><p>围绕下一步行动管理客户，而不是维护静态名单。</p></div>
      <div class="page-heading-actions"><button class="secondary-button" data-action="import-customers">${icon("upload")} 批量导入</button><button class="primary-button" data-action="new-customer">${icon("plus")} 新建客户</button></div>
    </section>
    <section class="filter-bar">
      <div class="filter-summary"><b>${filtered.length}</b> 个客户${selectedCount ? ` · 已选 ${selectedCount}` : ""}</div>
      <div class="stage-filter-chips"><span>阶段</span><button class="${state.stageFilter === "all" ? "active" : ""}" data-action="filter-stage" data-value="all">全部</button>${CRM_STAGES.map(s => `<button class="${state.stageFilter === s.key ? "active" : ""}" data-action="filter-stage" data-value="${s.key}">${s.label}</button>`).join("")}</div>
      ${(state.query || state.stageFilter !== "all") ? `<button class="text-button" data-action="reset-filters">清除筛选</button>` : ""}
      ${customerMultiSelectEnabled && selectedCount ? `<div class="customer-bulk-actions"><button class="text-button" data-action="clear-customer-selection">取消选择</button><button class="danger-button batch-delete-button" data-action="delete-selected-customers">${icon("trash-2")} 删除所选（${selectedCount}）</button></div>` : ""}
    </section>
    <section class="td-panel customer-worktable">
      <div class="table-head">${customerMultiSelectEnabled ? `<label class="table-customer-heading"><input id="customerSelectAll" type="checkbox" data-partial="${partiallySelected}" ${allVisibleSelected ? "checked" : ""} ${filtered.length ? "" : "disabled"} aria-label="选择当前列表全部客户"/><span>客户</span></label>` : `<span>客户</span>`}<span>阶段</span><span>关键联系人</span><span>下一步</span><span>最近更新</span><span></span></div>
      <div class="table-body">${filtered.length ? filtered.map(renderCustomerRow).join("") : emptyState("没有匹配的客户", "换一个关键词或清除筛选。", "search")}</div>
    </section>
  </div>`;
}

function renderCustomerRow(customer) {
  const next = getNextTask(customer);
  const keyContact = customer.orgChain.find(p => /CEO|CTO|总监|负责人|VP/.test(p.role || "")) || customer.orgChain[0];
  const selected = selectedCustomerIds.has(customer.id);
  return `<article class="customer-row ${selected ? "is-selected" : ""}">
    <button class="customer-cell identity-cell" data-action="open-customer" data-id="${customer.id}"><span><b>${safe(customer.name)}</b><small>${safe(customer.fields.industry?.v || "行业未填写")} · ${customer.grade} 级</small></span></button>
    <span data-label="阶段"><b class="stage-pill stage-${customer.stage}">${stageLabel(customer.stage)}</b></span>
    <span class="muted-cell" data-label="关键联系人">${keyContact ? `<b>${safe(keyContact.name)}</b><small>${safe(keyContact.role)}</small>` : "待补充"}</span>
    <span class="next-cell ${next?.overdue ? "danger-text" : ""}" data-label="下一步">${next ? `<b>${safe(next.text)}</b><small>${next.overdue ? "已逾期" : formatShortDate(next.date)}</small>` : "暂无待办"}</span>
    <span class="muted-cell" data-label="最近更新">${formatRelative(lastActivityDate(customer))}</span>
    <span class="row-actions"><button class="report-mini" data-action="open-report" data-id="${customer.id}">${icon("file-text")} 生成报告</button><details class="row-more-actions"><summary data-action="toggle-row-menu" aria-label="更多客户操作">${icon("ellipsis")}</summary><div class="row-more-menu"><button data-action="open-customer" data-id="${customer.id}">${icon("external-link")} 查看客户</button><button class="danger-menu-item" data-action="delete-customer" data-id="${customer.id}">${icon("trash-2")} 删除客户</button></div></details></span>
    ${customerMultiSelectEnabled ? `<label class="customer-select-cell"><input type="checkbox" data-customer-select="${safe(customer.id)}" ${selected ? "checked" : ""} aria-label="选择 ${safe(customer.name)}"/><span class="sr-only">选择 ${safe(customer.name)}</span></label>` : ""}
  </article>`;
}
function openCustomer(id) {
  state.page = "customers";
  state.customerId = id;
  state.customerTab = "overview";
  state.taskFocus = null;
  renderApp();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function switchCustomerTab(tab) {
  state.customerTab = tab;
  renderApp();
  const anchor = $(".detail-section-nav");
  const activeTab = anchor?.querySelector("button.active");
  if (activeTab && anchor.scrollWidth > anchor.clientWidth) activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  if (anchor && window.scrollY > anchor.offsetTop) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCustomerDetail(customer) {
  if (!customer) return renderCustomers();
  const focusedTask = state.taskFocus?.customerId === customer.id
    ? getTasks(customer).find(task => task.note.id === state.taskFocus.noteId)
    : null;
  const next = focusedTask || getNextTask(customer) || getLatestCompletedTask(customer);
  const tabs = [
    ["overview", "作战概览"], ["admittance", "客户准入"], ["intel", "情报与证据"], ["timeline", "推进记录"], ["relations", "关键关系"], ["signals", "外部信号"], ["closing", "成交工具"],
  ];
  return `<div class="page customer-detail">
    <button class="back-link" data-action="back-customers">${icon("arrow-left")} 返回客户列表</button>
    <header class="customer-summary-header">
      <div class="customer-title-group"><div class="customer-title-copy"><div class="title-line"><h1>${safe(customer.name)}</h1><b class="grade-badge grade-${customer.grade}">${customer.grade}</b></div><p>${safe(customer.fields.industry?.v || "行业未填写")} · 最近更新 ${formatRelative(lastActivityDate(customer))}</p>${renderCustomerFacts(customer)}</div></div>
      <div class="customer-hero-actions"><button class="report-button" data-action="open-report" data-id="${customer.id}"><span>${icon("file-text")}</span><b>生成全景报告</b><small>汇总全部客户信息</small></button><button class="danger-button customer-delete-button" data-action="delete-customer" data-id="${customer.id}">${icon("trash-2")} 删除客户</button></div>
    </header>
    <section class="customer-control-bar">
      ${renderStageTrack(customer)}
      ${renderChoiceControl(customer, "grade")}
    </section>
    ${next ? `<section class="next-action-banner ${next.overdue ? "overdue" : ""} ${next.done ? "completed" : ""}"><span class="next-icon">${icon(next.done ? "circle-check" : "move-right")}</span><div><small>${next.done ? "最近完成" : next.overdue ? "当前最紧急 · 已逾期" : "下一步行动"}</small><b>${safe(next.text)}</b><p>${safe(next.note.contact || "未指定联系人")} · ${formatShortDate(next.date)}</p></div><button class="${next.done ? "secondary-button" : "primary-button"}" data-action="${next.done ? "restore-task" : "complete-task"}" data-customer="${customer.id}" data-note="${next.note.id}">${icon(next.done ? "rotate-ccw" : "check")} ${next.done ? "取消完成" : "标记完成"}</button></section>` : ""}
    ${renderGuidedActions(customer)}
    <nav class="detail-section-nav" aria-label="客户档案分区">${tabs.map(([key,label]) => `<button class="${state.customerTab === key ? "active" : ""}" data-action="customer-tab" data-tab="${key}" aria-current="${state.customerTab === key ? "page" : "false"}">${label}</button>`).join("")}</nav>
    <section class="customer-tab-content">${renderCustomerTab(customer)}</section>
  </div>`;
}

function renderGuidedActions(customer) {
  const actions = buildGuidedActions(customer).slice(0, 3);
  if (!actions.length) return `<section class="guided-actions guided-actions--complete"><span>${icon("circle-check")}</span><div><b>当前信息已确认</b><p>Sales Buddy 暂时没有新的建议事项。</p></div></section>`;
  const [primary, ...optional] = actions;
  return `<section class="guided-actions">
    <div class="guided-actions-heading"><div><span>${penguinSVG("search")}</span><div><small>SALES BUDDY 建议</small><h2>现在建议做</h2></div></div><p>系统已经预填，确认、稍后或跳过即可。</p></div>
    ${renderGuidedActionCard(customer, primary, true)}
    ${optional.length ? `<div class="guided-action-options">${optional.map(action => renderGuidedActionCard(customer, action, false)).join("")}</div>` : ""}
  </section>`;
}

function buildGuidedActions(customer) {
  const pain = customer.painPoints.find(item => item?.v)?.v || "";
  const decisionMaker = customer.orgChain.find(person => Number(person.level) === 1);
  const nextTask = getNextTask(customer);
  const candidates = [
    {
      key: "meeting-prep", icon: "messages-square", kind: "meeting",
      title: "准备下一次客户沟通",
      reason: nextTask ? `下一步是“${nextTask.text}”，先把本次要确认的信息和会议钩子准备好。` : "先明确本次沟通要确认的信息，以及自然约出下一次会议的钩子。",
      impact: "生成一张可直接带进会议的速记卡",
    },
    {
      key: "confirm-pain", icon: "scan-search", kind: "confirm",
      title: pain ? "确认客户的核心痛点" : "摸排客户的核心业务问题",
      reason: pain ? `档案中记录了“${pain}”，需要确认这是客户本人认可的问题，而不只是内部判断。` : "当前还没有客户明确认可的核心痛点，建议在下一次沟通中优先摸排。",
      impact: "确认后用于方案、话术和客户报告",
    },
    {
      key: "confirm-power", icon: "user-round-check", kind: "confirm",
      title: "确认最终决策链",
      reason: decisionMaker ? `目前将“${decisionMaker.name} · ${decisionMaker.role || "决策层"}”标记为决策层，需要确认预算、技术和采购分别由谁决定。` : "当前还没有明确的最终决策者，建议确认支持者、决策者和审批流程。",
      impact: "减少只和经办人反复沟通的风险",
    },
  ];
  return candidates
    .filter(action => !["resolved", "dismissed"].includes(customer.guidedActions[action.key]?.status))
    .sort((a, b) => Number(customer.guidedActions[a.key]?.status === "deferred") - Number(customer.guidedActions[b.key]?.status === "deferred"));
}

function renderGuidedActionCard(customer, action, primary) {
  const mainAction = action.kind === "meeting" ? "open-meeting-card" : "open-guided-confirm";
  const mainLabel = action.kind === "meeting" ? "生成速记卡" : "确认并沉淀";
  return `<article class="${primary ? "guided-action-primary" : "guided-action-card"}">
    <span class="guided-action-icon">${icon(action.icon)}</span>
    <div class="guided-action-copy">${primary ? '<small class="guided-priority">最优先</small>' : ""}<h3>${safe(action.title)}</h3><p>${safe(action.reason)}</p><span>${icon("arrow-up-right")} ${safe(action.impact)}</span></div>
    <div class="guided-action-buttons">
      <button class="${primary ? "primary-button" : "soft-button"}" data-action="${mainAction}" data-customer="${safe(customer.id)}" data-guided="${safe(action.key)}">${mainLabel}</button>
      <button class="text-button" data-action="defer-guided-action" data-customer="${safe(customer.id)}" data-guided="${safe(action.key)}">稍后</button>
      <button class="guided-skip" data-action="dismiss-guided-action" data-customer="${safe(customer.id)}" data-guided="${safe(action.key)}" aria-label="跳过${safe(action.title)}">跳过</button>
    </div>
  </article>`;
}

function updateGuidedAction(customerId, key, status) {
  const customer = getCustomer(customerId);
  if (!customer || !key) return;
  customer.guidedActions[key] = { status, updatedAt: nowDateTime() };
  persist();
  renderApp();
  toast(status === "resolved" ? "已确认并保存到客户档案" : status === "deferred" ? "已移到可选事项" : "已跳过这项建议");
}

function openGuidedConfirmation(customerId, key) {
  const customer = getCustomer(customerId);
  if (!customer || !["confirm-pain", "confirm-power"].includes(key)) return toast("这项确认暂时不可用");
  const confirmation = customer.guidedConfirmations[key] || {};
  const decisionMaker = customer.orgChain.find(person => Number(person.level) === 1);
  const currentPain = typeof customer.painPoints[0] === "string" ? customer.painPoints[0] : customer.painPoints[0]?.v || "";
  const isPain = key === "confirm-pain";
  const fields = isPain
    ? `<label>客户确认的核心痛点<textarea name="value" rows="4" required placeholder="用客户自己的表述记录问题">${safe(currentPain)}</textarea></label>
       <label>确认依据或影响<textarea name="note" rows="3" placeholder="例如：客户 CTO 明确确认；已影响海外付费转化">${safe(confirmation.note || "")}</textarea></label>`
    : `<div class="form-row"><label>最终决策人<input name="name" required value="${safe(decisionMaker?.name || "")}" placeholder="姓名" /></label><label>职位<input name="role" value="${safe(decisionMaker?.role || "")}" placeholder="例如：CEO" /></label></div>
       <label>决策与审批流程<textarea name="note" rows="4" placeholder="例如：CTO 负责技术评估，CEO 审批预算，采购完成合同流程">${safe(confirmation.note || "")}</textarea></label>`;
  showModal(`<div class="modal-head"><div><p class="eyebrow">SALES CONFIRMATION</p><h2 id="modalTitle">${isPain ? "确认客户核心痛点" : "确认最终决策链"}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div>
    <form class="modal-form guided-confirm-form" data-form="guided-confirm">
      <input type="hidden" name="customerId" value="${safe(customer.id)}" />
      <input type="hidden" name="key" value="${safe(key)}" />
      <div class="meeting-prep-hint">${penguinSVG("search")}<p><b>现有档案信息已预填</b><span>请修改为客户明确确认过的事实，保存后才会完成这项建议。</span></p></div>
      ${fields}
      <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 确认并保存</button></div>
    </form>`);
}

function submitGuidedConfirmation(form) {
  const data = new FormData(form);
  const customer = getCustomer(data.get("customerId"));
  const key = String(data.get("key") || "");
  if (!customer || !["confirm-pain", "confirm-power"].includes(key)) return toast("无法保存这项确认");
  const note = String(data.get("note") || "").trim();
  if (key === "confirm-pain") {
    const value = String(data.get("value") || "").trim();
    if (!value) return toast("请填写客户确认的核心痛点");
    if (customer.painPoints[0] && typeof customer.painPoints[0] === "object") customer.painPoints[0].v = value;
    else if (customer.painPoints.length) customer.painPoints[0] = { v: value, source: "sales-confirmed" };
    else customer.painPoints.push({ v: value, source: "sales-confirmed" });
  } else {
    const name = String(data.get("name") || "").trim();
    const role = String(data.get("role") || "").trim();
    if (!name) return toast("请填写最终决策人");
    const decisionMaker = customer.orgChain.find(person => Number(person.level) === 1);
    if (decisionMaker) Object.assign(decisionMaker, { name, role });
    else customer.orgChain.push({ id: uid("p"), pid: "", level: 1, name, role, note: "" });
  }
  customer.guidedConfirmations[key] = { note, confirmedAt: nowDateTime() };
  customer.guidedActions[key] = { status: "resolved", updatedAt: nowDateTime() };
  persist();
  closeModal();
  renderApp();
  toast("确认内容已保存到客户档案");
}

function openOpportunityDiagnosis(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) return toast("请先选择客户");
  const diagnosis = getOpportunityDiagnosis(customer);
  showModal(`<div class="modal-head"><div><p class="eyebrow">OPPORTUNITY CHECK</p><h2 id="modalTitle">校准六维机会诊断</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div>
    <form class="modal-form diagnosis-form" data-form="opportunity-diagnosis">
      <input type="hidden" name="customerId" value="${safe(customer.id)}" />
      <div class="meeting-prep-hint">${penguinSVG("search")}<p><b>分数已根据客户档案预估</b><span>0 表示尚未建立，10 表示已获得决策者明确认可；请按实际情况校准。</span></p></div>
      <div class="diagnosis-form-grid">${OPPORTUNITY_DIMENSIONS.map(dimension => `<label><span><b>${safe(dimension.label)}</b><small>${safe(dimension.hint)}</small></span><input class="diagnosis-range" type="range" name="${safe(dimension.key)}" min="0" max="10" step="1" value="${diagnosis[dimension.key]}" /><output>${diagnosis[dimension.key]}</output></label>`).join("")}</div>
      <label>诊断备注<textarea name="note" rows="3" placeholder="记录本次判断依据与最需要补齐的信息">${safe(customer.opportunityDiagnosis.note || "")}</textarea></label>
      <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存诊断</button></div>
    </form>`);
}

function submitOpportunityDiagnosis(form) {
  const data = new FormData(form);
  const customer = getCustomer(data.get("customerId"));
  if (!customer) return toast("客户不存在，请刷新后重试");
  customer.opportunityDiagnosis = OPPORTUNITY_DIMENSIONS.reduce((result, dimension) => {
    result[dimension.key] = Math.max(0, Math.min(10, Number(data.get(dimension.key)) || 0));
    return result;
  }, { note: String(data.get("note") || "").trim(), updatedAt: nowDateTime() });
  persist();
  closeModal();
  renderApp();
  toast("六维机会诊断已保存");
}

function openBusinessBrief(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) return toast("请先选择客户");
  const brief = deriveBusinessBrief(customer);
  const fields = [
    ["products", "核心产品或服务", "客户真正卖什么，核心产品与差异化是什么"],
    ["revenueLogic", "赚钱逻辑", "主要付费客户、收费方式、收入来源与利润驱动"],
    ["operatingStatus", "经营状况", "增长、收入、活跃用户、市场重点或经营压力"],
    ["competitors", "相似竞品", "列出相似公司或替代产品，并说明关键差异"],
    ["painHypothesis", "可能的业务痛点", "基于经营逻辑判断可能存在的问题，拜访时需要向客户确认"],
  ];
  showModal(`<div class="modal-head"><div><p class="eyebrow">BUSINESS BRIEF</p><h2 id="modalTitle">产品与商业模式简报</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div>
    <form class="modal-form business-brief-form" data-form="business-brief">
      <input type="hidden" name="customerId" value="${safe(customer.id)}" />
      <div class="meeting-prep-hint">${penguinSVG("scratch")}<p><b>现有经营情报已自动归拢</b><span>这里记录的是销售理解，不确定的内容请保留为假设，并在拜访中确认。</span></p></div>
      ${fields.map(([key, label, placeholder]) => `<label>${label}<textarea name="${key}" rows="3" placeholder="${placeholder}">${safe(brief[key] || "")}</textarea></label>`).join("")}
      <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存简报</button></div>
    </form>`);
}

function submitBusinessBrief(form) {
  const data = new FormData(form);
  const customer = getCustomer(data.get("customerId"));
  if (!customer) return toast("客户不存在，请刷新后重试");
  customer.businessBrief = {
    products: String(data.get("products") || "").trim(),
    revenueLogic: String(data.get("revenueLogic") || "").trim(),
    operatingStatus: String(data.get("operatingStatus") || "").trim(),
    competitors: String(data.get("competitors") || "").trim(),
    painHypothesis: String(data.get("painHypothesis") || "").trim(),
    updatedAt: nowDateTime(),
  };
  persist();
  closeModal();
  renderApp();
  toast("产品与商业模式简报已保存");
}

function renderStageTrack(customer) {
  const pipelineStages = CRM_STAGES.filter(stage => stage.key !== "lost");
  const currentIndex = pipelineStages.findIndex(stage => stage.key === customer.stage);
  const reachedIndex = customer.stage === "lost" ? pipelineStages.findIndex(stage => stage.key === "proposal") : currentIndex;
  const motion = stageMotion(customer.stage);
  const lostStage = CRM_STAGES.find(stage => stage.key === "lost");
  return `<div class="stage-track" data-customer="${safe(customer.id)}" aria-label="销售阶段：${safe(stageLabel(customer.stage))}">
    <span class="stage-track-title">销售阶段</span>
    <span class="stage-penguin stage-penguin--${safe(customer.stage)}" data-customer="${safe(customer.id)}" data-stage="${safe(customer.stage)}" style="--penguin-left:${motion.left}%;--penguin-top:${motion.top}px" aria-hidden="true">${penguinSVG(stagePenguinPose(customer.stage))}</span>
    <div class="stage-track-steps">${pipelineStages.map((stage, index) => `<button class="stage-step ${reachedIndex >= index ? "done" : ""} ${customer.stage === stage.key ? "current" : ""}" data-action="set-stage" data-customer="${safe(customer.id)}" data-value="${safe(stage.key)}" aria-label="切换到${safe(stage.label)}" aria-pressed="${customer.stage === stage.key}"><i></i><span>${safe(stage.label)}</span></button>`).join("")}</div>
    ${lostStage ? `<button class="stage-step stage-step--lost ${customer.stage === "lost" ? "current" : ""}" data-action="set-stage" data-customer="${safe(customer.id)}" data-value="lost" aria-label="切换到${safe(lostStage.label)}" aria-pressed="${customer.stage === "lost"}"><i></i><span>${safe(lostStage.label)}</span></button>` : ""}
  </div>`;
}

function renderCustomerFacts(customer) {
  const staff = customer.fields.staff?.v?.trim() || "待补充";
  const funding = customer.fields.funding?.v?.trim() || "待补充";
  const website = customer.fields.website?.v?.trim() || "";
  const websiteUrl = normalizeWebsiteUrl(website);
  const websiteValue = website ? website.replace(/^https?:\/\//i, "").replace(/\/$/, "") : "待补充";
  const websiteFact = websiteUrl
    ? `<a href="${safe(websiteUrl)}" target="_blank" rel="noopener noreferrer" title="${safe(website)}">${icon("globe-2")}<span><small>官网</small><b>${safe(websiteValue)}</b></span></a>`
    : `<span>${icon("globe-2")}<span><small>官网</small><b>${safe(websiteValue)}</b></span></span>`;
  return `<div class="customer-facts">
    <span title="${safe(staff)}">${icon("users")}<span><small>团队</small><b>${safe(staff)}</b></span></span>
    <span title="${safe(funding)}">${icon("landmark")}<span><small>融资</small><b>${safe(funding)}</b></span></span>
    ${websiteFact}
  </div>`;
}

function normalizeWebsiteUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
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
  if (state.customerTab === "admittance") return renderAdmittanceWorkspace(customer);
  if (state.customerTab === "intel") return renderIntelligence(customer);
  if (state.customerTab === "timeline") return renderTimeline(customer);
  if (state.customerTab === "relations") return renderRelations(customer);
  if (state.customerTab === "signals") return renderExternalSignals(customer);
  if (state.customerTab === "closing") return renderClosingWorkspace(customer);
  return renderOverview(customer);
}

function renderOverview(customer) {
  const recent = [...customer.notes].sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
  const contacts = customer.orgChain.slice(0, 3);
  const completeness = profileCompleteness(customer);
  return `<div class="overview-grid">
    <section class="panel overview-summary">
      <div class="section-heading"><div><p class="eyebrow">ACCOUNT BRIEF</p><h2>作战摘要</h2></div><span class="health-score">档案完整度 ${completeness}%</span></div>
      <div class="brief-grid">
        <div><small>核心机会</small><p>${safe(customer.painPoints[0]?.v || "尚未明确核心痛点")}</p></div>
        <div><small>关系进展</small><p>${safe(customer.fields.relation?.v || "尚未补充客户关系")}</p></div>
        <div><small>上云现状</small><p>${safe(customer.fields.cloudStatus?.v || "尚未了解上云现状")}</p></div>
        <div><small>推荐切入</small><p>${safe(customer.solution[0]?.product || "待确认客户痛点后匹配方案")}</p></div>
      </div>
      ${customer.raidFile?.plan?.action ? `<div class="strategy-callout"><span>策略</span><p>${safe(customer.raidFile.plan.action)}</p></div>` : ""}
    </section>
    <section class="panel recent-progress-panel">
      <div class="section-heading"><h2>最近推进</h2><button class="text-button" data-action="customer-tab" data-tab="timeline">查看全部 ${icon("arrow-right")}</button></div>
      <div class="mini-timeline">${recent.length ? recent.map(note => renderMiniTimeline(note)).join("") : emptyState("还没有推进记录", "记录第一次沟通。")}</div>
    </section>
    ${renderBusinessBrief(customer)}
    <section class="panel overview-relations-panel">
      <div class="section-heading"><h2>关键关系</h2><button class="text-button" data-action="customer-tab" data-tab="relations">查看关系图 ${icon("arrow-right")}</button></div>
      <div class="contact-stack">${contacts.length ? contacts.map(renderCompactContact).join("") : emptyState("还没有联系人", "先添加一个关键人。")}</div>
      <button class="soft-button full" data-action="add-contact" data-customer="${customer.id}">${icon("user-plus")} 添加联系人</button>
    </section>
    <section class="panel overview-pain-solution-panel">
      <div class="section-heading"><h2>痛点与方案</h2><button class="text-button" data-action="customer-tab" data-tab="intel">编辑 ${icon("arrow-right")}</button></div>
      <div class="tag-list">${customer.painPoints.slice(0,3).map(p => `<span>${safe(p.v)}</span>`).join("") || `<span class="empty-tag">待补充痛点</span>`}</div>
      <div class="solution-preview">${customer.solution.slice(0,2).map(s => `<article><b>${safe(s.product)}</b><small>${safe(s.reason)}</small></article>`).join("") || `<p class="muted">补充痛点后再匹配方案。</p>`}</div>
    </section>
    ${renderMeetingPrepArchive(customer)}
    ${renderPainChain(customer)}
    ${renderJointWorkPlan(customer)}
    ${renderOpportunityDiagnosis(customer)}
  </div>`;
}

function inferOpportunityDiagnosis(customer) {
  const painConfirmed = Boolean(customer.guidedConfirmations["confirm-pain"]);
  const powerConfirmed = Boolean(customer.guidedConfirmations["confirm-power"]);
  const hasPain = customer.painPoints.some(item => typeof item === "string" ? item.trim() : item?.v);
  const decisionMaker = customer.orgChain.find(person => Number(person.level) === 1);
  const hasSolution = customer.solution.some(item => item?.product || item?.name);
  const hasValue = Boolean(customer.raidFile?.dm?.coreDemand || customer.fields.revenue?.v);
  const hasNext = customer.notes.some(note => note.next && !note.taskDone);
  const stageScore = { lead: 1, contact: 3, meeting: 5, proposal: 7, won: 10, lost: 1 }[customer.stage] ?? 0;
  return {
    pain: painConfirmed ? 8 : hasPain ? 4 : 1,
    power: powerConfirmed ? 7 : decisionMaker ? 4 : 1,
    vision: hasSolution ? 5 : 1,
    value: hasValue && hasSolution ? 5 : hasValue ? 3 : 1,
    control: customer.meetingReviews.length ? 7 : customer.meetingPreps.length ? 5 : hasNext ? 3 : 1,
    milestone: stageScore,
  };
}

function getOpportunityDiagnosis(customer) {
  const inferred = inferOpportunityDiagnosis(customer);
  return OPPORTUNITY_DIMENSIONS.reduce((result, dimension) => {
    const stored = Number(customer.opportunityDiagnosis[dimension.key]);
    result[dimension.key] = Number.isFinite(stored) ? Math.max(0, Math.min(10, stored)) : inferred[dimension.key];
    return result;
  }, {});
}

function diagnosisLevel(score) {
  if (score >= 8) return "强";
  if (score >= 5) return "推进中";
  return "待验证";
}

function renderDiagnosisRadar(diagnosis) {
  const center = 90;
  const radius = 58;
  const point = (index, scale) => {
    const angle = (-90 + index * 60) * Math.PI / 180;
    return `${(center + Math.cos(angle) * radius * scale).toFixed(1)},${(center + Math.sin(angle) * radius * scale).toFixed(1)}`;
  };
  const rings = [.25, .5, .75, 1].map(scale => `<polygon points="${OPPORTUNITY_DIMENSIONS.map((_, index) => point(index, scale)).join(" ")}" />`).join("");
  const axes = OPPORTUNITY_DIMENSIONS.map((_, index) => `<line x1="${center}" y1="${center}" x2="${point(index, 1).split(",")[0]}" y2="${point(index, 1).split(",")[1]}" />`).join("");
  const dataPoints = OPPORTUNITY_DIMENSIONS.map((dimension, index) => point(index, diagnosis[dimension.key] / 10));
  const labels = OPPORTUNITY_DIMENSIONS.map((dimension, index) => {
    const [x, y] = point(index, 1.28).split(",").map(Number);
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${safe(dimension.label)}</text>`;
  }).join("");
  return `<svg class="diagnosis-radar" viewBox="0 0 180 180" role="img" aria-label="六维机会诊断雷达图：${safe(OPPORTUNITY_DIMENSIONS.map(dimension => `${dimension.label}${diagnosis[dimension.key]}分`).join("，"))}"><g class="radar-grid">${rings}${axes}</g><polygon class="radar-area" points="${dataPoints.join(" ")}" />${dataPoints.map(item => { const [cx, cy] = item.split(","); return `<circle class="radar-point" cx="${cx}" cy="${cy}" r="3" />`; }).join("")}<g class="radar-labels">${labels}</g></svg>`;
}

function renderOpportunityDiagnosis(customer) {
  const diagnosis = getOpportunityDiagnosis(customer);
  const average = Math.round(OPPORTUNITY_DIMENSIONS.reduce((sum, dimension) => sum + diagnosis[dimension.key], 0) / OPPORTUNITY_DIMENSIONS.length * 10);
  const weakest = [...OPPORTUNITY_DIMENSIONS].sort((a, b) => diagnosis[a.key] - diagnosis[b.key])[0];
  return `<section class="panel opportunity-diagnosis wide-panel">
    <div class="section-heading"><div><p class="eyebrow">OPPORTUNITY CHECK</p><h2>六维机会诊断</h2></div><button class="text-button" data-action="edit-opportunity-diagnosis" data-customer="${safe(customer.id)}">校准诊断 ${icon("sliders-horizontal")}</button></div>
    <div class="diagnosis-visual">
      <div class="diagnosis-chart">${renderDiagnosisRadar(diagnosis)}<strong>${average}<small>/100</small></strong></div>
      <div class="diagnosis-insight"><div class="diagnosis-summary"><b>${average >= 70 ? "机会基础较强" : average >= 45 ? "具备推进基础" : "关键信息仍不足"}</b><p>当前最弱：${safe(weakest.label)} · ${safe(weakest.hint)}</p></div><div class="diagnosis-legend">${OPPORTUNITY_DIMENSIONS.map(dimension => { const score = diagnosis[dimension.key]; return `<article><span>${icon(dimension.icon)}</span><b>${safe(dimension.label)}</b><small>${diagnosisLevel(score)}</small><strong>${score}</strong></article>`; }).join("")}</div></div>
    </div>
    ${customer.opportunityDiagnosis.note ? `<p class="diagnosis-note">${icon("notebook-pen")} ${safe(customer.opportunityDiagnosis.note)}</p>` : ""}
  </section>`;
}

function deriveBusinessBrief(customer) {
  const raid = customer.raidFile || {};
  const competitors = (raid.competitors || []).map(item => item?.name).filter(Boolean).join("、");
  const operating = [customer.fields.revenue?.v, customer.fields.dau?.v].filter(Boolean).join("；");
  return {
    products: customer.businessBrief.products || customer.fields.product?.v || raid.basic?.scope || "",
    revenueLogic: customer.businessBrief.revenueLogic || raid.basic?.model || customer.fields.revenue?.v || "",
    operatingStatus: customer.businessBrief.operatingStatus || operating,
    competitors: customer.businessBrief.competitors || competitors,
    painHypothesis: customer.businessBrief.painHypothesis || customer.painPoints.map(item => typeof item === "string" ? item : item?.v).filter(Boolean).join("；"),
  };
}

function renderBusinessBrief(customer) {
  const brief = deriveBusinessBrief(customer);
  const entries = [
    ["核心产品", brief.products, "boxes"], ["赚钱逻辑", brief.revenueLogic, "badge-dollar-sign"],
    ["经营状况", brief.operatingStatus, "activity"], ["相似竞品", brief.competitors, "git-compare-arrows"],
  ];
  const populated = entries.filter(([, value]) => value).length;
  return `<section class="panel business-brief wide-panel">
    <div class="section-heading"><div><p class="eyebrow">BUSINESS BRIEF</p><h2>产品与商业模式简报</h2></div><button class="text-button" data-action="edit-business-brief" data-customer="${safe(customer.id)}">${populated ? "确认与编辑" : "开始补充"} ${icon("square-pen")}</button></div>
    <div class="business-brief-grid">${entries.map(([label, value, iconName]) => `<article><span>${icon(iconName)}</span><small>${label}</small><p>${safe(value || "待销售确认")}</p></article>`).join("")}</div>
    ${brief.painHypothesis ? `<div class="business-pain-hypothesis"><b>可能的业务切入点</b><p>${safe(brief.painHypothesis)}</p></div>` : ""}
  </section>`;
}

function renderMeetingPrepArchive(customer) {
  const prep = [...customer.meetingPreps].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0];
  if (!prep) return "";
  const focus = Array.isArray(prep.focus) ? prep.focus.filter(Boolean) : [];
  return `<section class="panel meeting-prep-archive wide-panel">
    <div class="section-heading"><div><p class="eyebrow">MEETING BRIEF</p><h2>已保存的会前速记卡</h2></div><button class="text-button" data-action="open-meeting-card" data-customer="${safe(customer.id)}">新建一张 ${icon("plus")}</button></div>
    <article class="meeting-prep-saved ${prep.status === "completed" ? "is-completed" : ""}">
      <span class="meeting-prep-saved-icon">${icon("notebook-tabs")}</span>
      <div class="meeting-prep-saved-copy"><small>${safe(formatDateTime(prep.updatedAt || prep.createdAt))} · ${prep.status === "completed" ? "已完成会后确认" : "待会后确认"}</small><h3>${safe(prep.objective || "未命名会议目标")}</h3>${focus.length ? `<p>${focus.length} 项待确认信息 · ${safe(focus[0])}</p>` : ""}${prep.hook ? `<span>${icon("corner-down-right")} ${safe(prep.hook)}</span>` : ""}</div>
      <div class="meeting-prep-saved-actions"><button class="soft-button" data-action="open-meeting-card" data-customer="${safe(customer.id)}" data-prep="${safe(prep.id)}">${icon("square-pen")} 编辑</button><button class="primary-button" data-action="open-meeting-review" data-customer="${safe(customer.id)}" data-prep="${safe(prep.id)}">${icon(prep.status === "completed" ? "history" : "clipboard-check")} ${prep.status === "completed" ? "查看会后确认" : "会后确认"}</button></div>
    </article>
  </section>`;
}

function renderExternalSignals(customer) {
  const news = [...customer.marketNews].sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  const hiring = [...customer.hiringSignals].sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)));
  return `<div class="external-signals-workspace">
    <section class="external-signals-intro">
      <div><p class="eyebrow">EXTERNAL SIGNALS</p><h2>外部机会信号</h2><p>只记录能改变销售动作的新闻与招聘线索；来源由销售补充并确认。</p></div>
      <span>${icon("radar")} ${news.length + hiring.length} 条已确认线索</span>
    </section>
    <div class="external-signal-grid">
      <section class="panel signal-column">
        <div class="section-heading"><div><p class="eyebrow">GLOBAL NEWS</p><h2>全球新闻</h2></div><button class="soft-button" data-action="add-market-news" data-customer="${safe(customer.id)}">${icon("plus")} 添加新闻</button></div>
        <div class="signal-list">${news.length ? news.map(item => `<article class="signal-card"><div class="signal-card-meta"><span>${safe(item.market || "市场未标注")}</span><time>${safe(formatShortDate(item.publishedAt))}</time></div><h3>${safe(item.title)}</h3>${item.signal ? `<p>${safe(item.signal)}</p>` : ""}${item.impact ? `<div><b>销售判断</b><span>${safe(item.impact)}</span></div>` : ""}${normalizeWebsiteUrl(item.sourceUrl) ? `<a href="${safe(normalizeWebsiteUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">查看来源 ${icon("external-link")}</a>` : ""}</article>`).join("") : emptyState("还没有新闻线索", "把融资、产品发布、海外增长等与机会相关的新闻记在这里。", "newspaper")}</div>
      </section>
      <section class="panel signal-column">
        <div class="section-heading"><div><p class="eyebrow">HIRING SIGNALS</p><h2>招聘动向</h2></div><button class="soft-button" data-action="add-hiring-signal" data-customer="${safe(customer.id)}">${icon("plus")} 添加招聘</button></div>
        <div class="signal-list">${hiring.length ? hiring.map(item => `<article class="signal-card hiring-card"><div class="signal-card-meta"><span>${safe(item.location || "地点未标注")}</span><time>${safe(formatShortDate(item.postedAt))}</time></div><h3>${safe(item.role)}</h3>${item.signal ? `<p>${safe(item.signal)}</p>` : ""}${item.opportunity ? `<div><b>可能切入</b><span>${safe(item.opportunity)}</span></div>` : ""}${normalizeWebsiteUrl(item.sourceUrl) ? `<a href="${safe(normalizeWebsiteUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">查看职位 ${icon("external-link")}</a>` : ""}</article>`).join("") : emptyState("还没有招聘线索", "海外运营、云平台、数据安全等岗位可能暴露新的业务方向。", "briefcase-business")}</div>
      </section>
    </div>
  </div>`;
}

function getPainChain(customer) {
  const stored = customer.painChain || {};
  return {
    signal: stored.signal || customer.marketNews[0]?.signal || customer.hiringSignals[0]?.signal || "",
    pain: stored.pain || customer.painPoints[0]?.v || "",
    impact: stored.impact || customer.businessBrief.operatingStatus || "",
    solution: stored.solution || customer.solution[0]?.product || "",
    question: stored.question || "",
  };
}

function renderPainChain(customer) {
  const chain = getPainChain(customer);
  const steps = [
    ["外部信号", chain.signal, "radar"], ["业务痛点", chain.pain, "heart-crack"],
    ["经营影响", chain.impact, "trending-down"], ["腾讯云切入", chain.solution, "cloud"],
    ["客户确认", chain.question, "message-circle-question"],
  ];
  const populated = steps.filter(([, value]) => value).length;
  return `<section class="panel pain-chain-panel wide-panel">
    <div class="section-heading"><div><p class="eyebrow">PAIN CHAIN</p><h2>机会痛苦链</h2><small class="inference-label">销售假设 · 待客户确认</small></div><button class="text-button" data-action="edit-pain-chain" data-customer="${safe(customer.id)}">${populated ? "确认与编辑" : "开始梳理"} ${icon("square-pen")}</button></div>
    <div class="pain-chain-flow">${steps.map(([label, value, iconName], index) => `<article class="${value ? "has-value" : "is-empty"}"><span>${icon(iconName)}</span><small>${safe(label)}</small><p>${safe(value || "待销售确认")}</p>${index < steps.length - 1 ? `<i>${icon("arrow-right")}</i>` : ""}</article>`).join("")}</div>
  </section>`;
}

function workPlanStatus(status) {
  return { todo: "待开始", doing: "进行中", done: "已完成" }[status] || "待开始";
}

function renderJointWorkPlan(customer) {
  const items = [...customer.jointWorkPlan].sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  return `<section class="panel joint-plan-panel wide-panel">
    <div class="section-heading"><div><p class="eyebrow">MUTUAL ACTION PLAN</p><h2>联合工作计划</h2></div><button class="soft-button" data-action="add-work-plan" data-customer="${safe(customer.id)}">${icon("plus")} 添加里程碑</button></div>
    <div class="joint-plan-list">${items.length ? items.map(item => `<article class="plan-item status-${safe(item.status || "todo")}"><button class="plan-status" data-action="toggle-work-plan" data-customer="${safe(customer.id)}" data-item="${safe(item.id)}" aria-label="切换里程碑状态">${icon(item.status === "done" ? "circle-check-big" : item.status === "doing" ? "loader-circle" : "circle")}</button><div class="plan-main"><div><h3>${safe(item.title)}</h3><span>${safe(workPlanStatus(item.status))}</span></div>${item.deliverable ? `<p>${safe(item.deliverable)}</p>` : ""}<small>我方：${safe(item.ourOwner || "待确认")} · 客户：${safe(item.customerOwner || "待确认")}</small></div><time>${safe(formatShortDate(item.dueDate))}</time><button class="plan-edit" data-action="edit-work-plan" data-customer="${safe(customer.id)}" data-item="${safe(item.id)}" aria-label="编辑${safe(item.title)}">${icon("square-pen")}</button></article>`).join("") : emptyState("还没有联合计划", "把双方承诺变成有负责人、有交付物、有日期的共同里程碑。", "calendar-range")}</div>
  </section>`;
}

function openMarketNews(customerId) {
  const customer = getCustomer(customerId); if (!customer) return;
  showModal(`<div class="modal-head"><div><p class="eyebrow">GLOBAL NEWS</p><h2 id="modalTitle">添加全球新闻线索</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="market-news"><input type="hidden" name="customerId" value="${safe(customer.id)}" /><label>新闻标题<input name="title" required placeholder="例如：海外产品发布或完成融资" /></label><div class="form-row"><label>市场 / 地区<input name="market" placeholder="例如：北美、东南亚" /></label><label>发布日期<input type="date" name="publishedAt" value="${todayStr()}" /></label></div><label>来源链接<input type="url" name="sourceUrl" placeholder="https://" /></label><label>这条新闻说明什么<textarea name="signal" rows="3" placeholder="只记录从新闻中可以确认的业务变化"></textarea></label><label>对本次销售机会的影响<textarea name="impact" rows="3" placeholder="例如：海外扩张加快，需要确认全球网络和合规规划"></textarea></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存线索</button></div></form>`);
}

function submitMarketNews(form) {
  const data = new FormData(form), customer = getCustomer(data.get("customerId")); if (!customer) return;
  const title = String(data.get("title") || "").trim(); if (!title) return toast("请填写新闻标题");
  customer.marketNews.push({ id: uid("news"), title, market: String(data.get("market") || "").trim(), publishedAt: String(data.get("publishedAt") || ""), sourceUrl: String(data.get("sourceUrl") || "").trim(), signal: String(data.get("signal") || "").trim(), impact: String(data.get("impact") || "").trim(), confirmedAt: nowDateTime() });
  persist(); closeModal(); renderApp(); toast("新闻线索已保存");
}

function openHiringSignal(customerId) {
  const customer = getCustomer(customerId); if (!customer) return;
  showModal(`<div class="modal-head"><div><p class="eyebrow">HIRING SIGNAL</p><h2 id="modalTitle">添加招聘线索</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="hiring-signal"><input type="hidden" name="customerId" value="${safe(customer.id)}" /><label>招聘岗位<input name="role" required placeholder="例如：海外社区运营、云平台工程师" /></label><div class="form-row"><label>地点<input name="location" placeholder="例如：深圳、新加坡" /></label><label>发布日期<input type="date" name="postedAt" value="${todayStr()}" /></label></div><label>职位链接<input type="url" name="sourceUrl" placeholder="https://" /></label><label>岗位释放的业务信号<textarea name="signal" rows="3" placeholder="例如：正在建立海外本地运营能力"></textarea></label><label>可能的销售切入点<textarea name="opportunity" rows="3" placeholder="例如：确认海外业务的网络、算力和数据合规需求"></textarea></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存线索</button></div></form>`);
}

function submitHiringSignal(form) {
  const data = new FormData(form), customer = getCustomer(data.get("customerId")); if (!customer) return;
  const role = String(data.get("role") || "").trim(); if (!role) return toast("请填写招聘岗位");
  customer.hiringSignals.push({ id: uid("job"), role, location: String(data.get("location") || "").trim(), postedAt: String(data.get("postedAt") || ""), sourceUrl: String(data.get("sourceUrl") || "").trim(), signal: String(data.get("signal") || "").trim(), opportunity: String(data.get("opportunity") || "").trim(), confirmedAt: nowDateTime() });
  persist(); closeModal(); renderApp(); toast("招聘线索已保存");
}

function openPainChain(customerId) {
  const customer = getCustomer(customerId); if (!customer) return;
  const chain = getPainChain(customer);
  const fields = [["signal","外部或经营信号","例如：海外招聘增加、产品在海外增长"],["pain","可能的业务痛点","需要在拜访中由客户确认的问题"],["impact","造成的经营影响","成本、效率、收入、体验或风险"],["solution","腾讯云切入点","能验证价值的产品或方案"],["question","客户确认问题","下一次沟通可以直接问的问题"]];
  showModal(`<div class="modal-head"><div><p class="eyebrow">PAIN CHAIN</p><h2 id="modalTitle">梳理机会痛苦链</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="pain-chain"><input type="hidden" name="customerId" value="${safe(customer.id)}" /><div class="signal-form-hint">${icon("route")}<p><b>把线索变成可验证的销售路径</b><span>不确定的内容保留为假设，最后一项必须写成可向客户确认的问题。</span></p></div>${fields.map(([key,label,placeholder]) => `<label>${label}<textarea name="${key}" rows="2" placeholder="${placeholder}">${safe(chain[key])}</textarea></label>`).join("")}<div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存痛苦链</button></div></form>`);
}

function submitPainChain(form) {
  const data = new FormData(form), customer = getCustomer(data.get("customerId")); if (!customer) return;
  customer.painChain = { signal: String(data.get("signal") || "").trim(), pain: String(data.get("pain") || "").trim(), impact: String(data.get("impact") || "").trim(), solution: String(data.get("solution") || "").trim(), question: String(data.get("question") || "").trim(), inferred: true, updatedAt: nowDateTime() };
  persist(); closeModal(); renderApp(); toast("机会痛苦链已保存");
}

function openWorkPlanItem(customerId, itemId = "") {
  const customer = getCustomer(customerId); if (!customer) return;
  const item = customer.jointWorkPlan.find(entry => entry.id === itemId) || {};
  showModal(`<div class="modal-head"><div><p class="eyebrow">MUTUAL ACTION PLAN</p><h2 id="modalTitle">${itemId ? "编辑" : "添加"}联合计划里程碑</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="work-plan"><input type="hidden" name="customerId" value="${safe(customer.id)}" /><input type="hidden" name="itemId" value="${safe(itemId)}" /><label>共同里程碑<input name="title" required value="${safe(item.title || "")}" placeholder="例如：完成东南亚三地延迟 PoC" /></label><label>交付物<textarea name="deliverable" rows="2" placeholder="双方完成后能够共同确认的结果">${safe(item.deliverable || "")}</textarea></label><div class="form-row"><label>我方负责人<input name="ourOwner" value="${safe(item.ourOwner || "")}" /></label><label>客户负责人<input name="customerOwner" value="${safe(item.customerOwner || "")}" /></label></div><div class="form-row"><label>计划日期<input type="date" name="dueDate" value="${safe(item.dueDate || "")}" /></label><label>状态<div class="modern-select"><select name="status">${[["todo","待开始"],["doing","进行中"],["done","已完成"]].map(([key,label]) => `<option value="${key}" ${(item.status || "todo") === key ? "selected" : ""}>${label}</option>`).join("")}</select>${icon("chevron-down")}</div></label></div><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存里程碑</button></div></form>`);
}

function submitWorkPlan(form) {
  const data = new FormData(form), customer = getCustomer(data.get("customerId")); if (!customer) return;
  const title = String(data.get("title") || "").trim(); if (!title) return toast("请填写共同里程碑");
  const itemId = String(data.get("itemId") || ""), existing = customer.jointWorkPlan.find(item => item.id === itemId);
  const record = { id: existing?.id || uid("map"), title, deliverable: String(data.get("deliverable") || "").trim(), ourOwner: String(data.get("ourOwner") || "").trim(), customerOwner: String(data.get("customerOwner") || "").trim(), dueDate: String(data.get("dueDate") || ""), status: String(data.get("status") || "todo"), updatedAt: nowDateTime() };
  existing ? Object.assign(existing, record) : customer.jointWorkPlan.push(record);
  persist(); closeModal(); renderApp(); toast(existing ? "联合计划已更新" : "联合计划里程碑已添加");
}

function toggleWorkPlanItem(customerId, itemId) {
  const customer = getCustomer(customerId), item = customer?.jointWorkPlan.find(entry => entry.id === itemId); if (!item) return;
  item.status = item.status === "todo" ? "doing" : item.status === "doing" ? "done" : "todo";
  item.updatedAt = nowDateTime(); persist(); renderApp();
}

function deriveNegotiationBrief(customer) {
  const stored = customer.negotiationBrief || {};
  const nextPlan = customer.jointWorkPlan.find(item => item.status !== "done");
  const latestReview = [...customer.meetingReviews].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0];
  return {
    objective: stored.objective || nextPlan?.title || "",
    customerPosition: stored.customerPosition || customer.raidFile?.dm?.concern || "",
    valueAnchor: stored.valueAnchor || customer.painChain?.impact || customer.raidFile?.dm?.coreDemand || "",
    mustHave: stored.mustHave || "",
    flexible: stored.flexible || "",
    giveGet: stored.giveGet || "",
    redLine: stored.redLine || "",
    objections: stored.objections || customer.raidFile?.dm?.concern || "",
    response: stored.response || customer.raidFile?.solution?.biz || "",
    closeAction: stored.closeAction || latestReview?.next || getNextTask(customer)?.text || "",
  };
}

function renderClosingWorkspace(customer) {
  return `<div class="closing-workspace">
    <section class="closing-intro"><div><p class="eyebrow">CLOSING WORKSPACE</p><h2>成交工具</h2><p>先明确谈判边界，再把已确认信息整理成可以直接使用的销售资产。</p></div><span>${icon("shield-check")} 事实来自客户档案</span></section>
    ${renderNegotiationAssistant(customer)}
    ${renderSalesAssetStudio(customer)}
  </div>`;
}

function renderNegotiationAssistant(customer) {
  const brief = deriveNegotiationBrief(customer);
  const keys = ["objective", "customerPosition", "valueAnchor", "mustHave", "flexible", "giveGet", "redLine", "objections", "response", "closeAction"];
  const readiness = Math.round(keys.filter(key => brief[key]).length / keys.length * 100);
  const lane = (tone, iconName, label, title, value) => `<article class="negotiation-lane ${tone}"><span>${icon(iconName)}</span><small>${safe(label)}</small><h3>${safe(title)}</h3><p>${safe(value || "待销售确认")}</p></article>`;
  return `<section class="panel negotiation-board">
    <div class="section-heading"><div><p class="eyebrow">NEGOTIATION ASSISTANT</p><h2>谈判助手</h2></div><div class="negotiation-heading-actions"><span>准备度 ${readiness}%</span><button class="text-button" data-action="edit-negotiation-brief" data-customer="${safe(customer.id)}">确认与编辑 ${icon("square-pen")}</button></div></div>
    <div class="negotiation-objective"><span>${icon("target")}</span><div><small>目标结果</small><h3>${safe(brief.objective || "待明确本轮谈判希望达成的结果")}</h3></div></div>
    <div class="negotiation-lanes">
      ${lane("protect", "shield", "必须守住", "成交前提", brief.mustHave)}
      ${lane("move", "move-horizontal", "可以交换", "可让步空间", brief.flexible)}
      ${lane("exchange", "repeat-2", "交换条件", "Give / Get", brief.giveGet)}
      ${lane("redline", "octagon-alert", "红线", "不可接受", brief.redLine)}
    </div>
    <div class="negotiation-response-grid"><article><small>客户立场</small><p>${safe(brief.customerPosition || "待确认客户当前诉求和条件")}</p></article><article><small>价值锚点</small><p>${safe(brief.valueAnchor || "待量化客户认可的业务价值")}</p></article><article><small>主要异议</small><p>${safe(brief.objections || "待记录客户明确提出的异议")}</p></article><article><small>回应策略</small><p>${safe(brief.response || "待准备有事实依据的回应")}</p></article></div>
    <div class="negotiation-close"><span>${icon("flag")}</span><div><small>本轮收口动作</small><b>${safe(brief.closeAction || "待明确会议结束前必须确认的下一步")}</b></div></div>
  </section>`;
}

function renderSalesAssetStudio(customer) {
  const assets = [...customer.salesAssets].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return `<section class="panel sales-asset-studio">
    <div class="section-heading"><div><p class="eyebrow">SALES ASSET STUDIO</p><h2>销售资产生成</h2></div><span class="asset-count">已保存 ${assets.length} 份</span></div>
    <div class="sales-asset-grid">${SALES_ASSET_TYPES.map(type => `<article><span>${icon(type.icon)}</span><div><h3>${safe(type.label)}</h3><p>${safe(type.description)}</p></div><button class="soft-button" data-action="generate-sales-asset" data-customer="${safe(customer.id)}" data-type="${safe(type.key)}">${icon("sparkles")} 生成</button></article>`).join("")}</div>
    ${assets.length ? `<div class="saved-assets"><div class="saved-assets-heading"><b>已生成资产</b><small>可打开、复制或下载纯文本</small></div>${assets.map(asset => `<article><button class="saved-asset-main" data-action="open-sales-asset" data-customer="${safe(customer.id)}" data-asset="${safe(asset.id)}"><span>${icon(SALES_ASSET_TYPES.find(type => type.key === asset.type)?.icon || "file-text")}</span><div><b>${safe(asset.title)}</b><small>${safe(formatDateTime(asset.createdAt))}</small></div></button><div class="saved-asset-actions"><button data-action="copy-sales-asset" data-customer="${safe(customer.id)}" data-asset="${safe(asset.id)}" aria-label="复制${safe(asset.title)}">${icon("copy")}</button><button data-action="download-sales-asset" data-customer="${safe(customer.id)}" data-asset="${safe(asset.id)}" aria-label="下载${safe(asset.title)}">${icon("download")}</button><button data-action="remove-sales-asset" data-customer="${safe(customer.id)}" data-asset="${safe(asset.id)}" aria-label="删除${safe(asset.title)}">${icon("trash-2")}</button></div></article>`).join("")}</div>` : `<div class="asset-empty-note">${icon("files")}<span><b>尚未生成销售资产</b><small>选择上方模板，系统只会整理客户档案中已有的事实。</small></span></div>`}
  </section>`;
}

function openNegotiationBrief(customerId) {
  const customer = getCustomer(customerId); if (!customer) return;
  const brief = deriveNegotiationBrief(customer);
  const fields = [
    ["objective", "目标结果", "本轮谈判结束时希望双方明确什么"],
    ["customerPosition", "客户当前立场", "客户提出的条件、价格预期或采购要求"],
    ["valueAnchor", "价值锚点", "客户已认可、可以支撑报价的业务价值"],
    ["mustHave", "必须守住", "成交必须满足的范围、责任或回款条件"],
    ["flexible", "可以交换", "可调整的资源、价格、周期或服务内容"],
    ["giveGet", "交换条件", "每一次让步要换回什么承诺、范围或时间表"],
    ["redLine", "红线", "不能接受的无限责任、无条件折扣或模糊承诺"],
    ["objections", "主要异议", "客户已经明确提出的顾虑"],
    ["response", "回应策略", "基于事实、验证路径和客户价值的回应"],
    ["closeAction", "本轮收口动作", "会议结束前必须确认的下一步"],
  ];
  showModal(`<div class="modal-head"><div><p class="eyebrow">NEGOTIATION BRIEF</p><h2 id="modalTitle">编辑谈判作战卡</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form negotiation-form" data-form="negotiation-brief"><input type="hidden" name="customerId" value="${safe(customer.id)}" /><div class="signal-form-hint">${icon("handshake")}<p><b>先交换，后让步</b><span>系统只预填已有档案内容；价格、边界和红线必须由销售确认。</span></p></div>${fields.map(([key,label,placeholder]) => `<label>${label}<textarea name="${key}" rows="2" placeholder="${placeholder}">${safe(brief[key])}</textarea></label>`).join("")}<div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存谈判卡</button></div></form>`);
}

function submitNegotiationBrief(form) {
  const data = new FormData(form), customer = getCustomer(data.get("customerId")); if (!customer) return;
  customer.negotiationBrief = ["objective", "customerPosition", "valueAnchor", "mustHave", "flexible", "giveGet", "redLine", "objections", "response", "closeAction"].reduce((result, key) => { result[key] = String(data.get(key) || "").trim(); return result; }, { updatedAt: nowDateTime() });
  persist(); closeModal(); renderApp(); toast("谈判作战卡已保存");
}

function assetFact(value) {
  return String(value || "").trim() || "待确认";
}

function buildSalesAssetContent(customer, type) {
  const brief = deriveBusinessBrief(customer);
  const negotiation = deriveNegotiationBrief(customer);
  const pain = customer.painChain?.pain || customer.painPoints[0]?.v;
  const solution = customer.painChain?.solution || customer.solution[0]?.product;
  const next = getNextTask(customer)?.text || negotiation.closeAction;
  const decisionMaker = customer.orgChain.find(person => Number(person.level) === 1);
  const latestReview = [...customer.meetingReviews].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0];
  const plan = customer.jointWorkPlan.filter(item => item.status !== "done").slice(0, 3);
  const common = { name: customer.name, industry: customer.fields.industry?.v, stage: stageLabel(customer.stage), grade: customer.grade, pain, solution, next, decisionMaker: decisionMaker ? `${decisionMaker.name}（${decisionMaker.role || "职位待确认"}）` : "待确认" };
  if (type === "followup-email") return {
    title: "会后跟进邮件",
    content: `主题：${assetFact(customer.name)}｜本次沟通确认与下一步\n\n您好，\n\n感谢今天的交流。根据本次沟通，我们对以下事项形成了共同理解：\n\n1. 当前重点：${assetFact(latestReview?.summary || pain)}\n2. 已确认事实：${assetFact(latestReview?.confirmed)}\n3. 建议验证方向：${assetFact(solution)}\n4. 双方下一步：${assetFact(latestReview?.next || next)}${latestReview?.nextDate ? `（计划于 ${formatShortDate(latestReview.nextDate)} 前完成）` : ""}\n\n${latestReview?.hookResult ? `下次沟通约定：${latestReview.hookResult}\n\n` : ""}如有理解偏差，请直接回复指正。确认后我们将按上述范围准备下一步材料。\n\n谢谢。`,
  };
  if (type === "solution-outline") return {
    title: "方案大纲",
    content: `${assetFact(customer.name)} 方案大纲\n\n一、客户背景\n- 行业：${assetFact(common.industry)}\n- 核心产品：${assetFact(brief.products)}\n- 经营重点：${assetFact(brief.operatingStatus)}\n\n二、已确认问题\n- 业务痛点：${assetFact(pain)}\n- 经营影响：${assetFact(customer.painChain?.impact)}\n- 客户确认问题：${assetFact(customer.painChain?.question)}\n\n三、建议方案\n- 切入方案：${assetFact(solution)}\n- 价值锚点：${assetFact(negotiation.valueAnchor)}\n- 设计原则：先验证关键指标，再根据实测结果扩大范围。\n\n四、验证与交付计划\n${plan.length ? plan.map((item, index) => `${index + 1}. ${item.title}｜交付物：${assetFact(item.deliverable)}｜双方负责人：${assetFact(item.ourOwner)} / ${assetFact(item.customerOwner)}｜日期：${assetFact(formatShortDate(item.dueDate))}`).join("\n") : "1. 待双方确认验证范围、成功标准、负责人和时间表。"}\n\n五、下一步\n${assetFact(next)}`,
  };
  if (type === "negotiation-card") return {
    title: "谈判作战卡",
    content: `${assetFact(customer.name)} 谈判作战卡\n\n目标结果\n${assetFact(negotiation.objective)}\n\n客户当前立场\n${assetFact(negotiation.customerPosition)}\n\n价值锚点\n${assetFact(negotiation.valueAnchor)}\n\n必须守住\n${assetFact(negotiation.mustHave)}\n\n可以交换\n${assetFact(negotiation.flexible)}\n\n交换条件（Give / Get）\n${assetFact(negotiation.giveGet)}\n\n红线\n${assetFact(negotiation.redLine)}\n\n主要异议与回应\n异议：${assetFact(negotiation.objections)}\n回应：${assetFact(negotiation.response)}\n\n本轮收口动作\n${assetFact(negotiation.closeAction)}`,
  };
  return {
    title: "客户一页纸",
    content: `${assetFact(customer.name)} 客户一页纸\n\n客户概况\n- 行业：${assetFact(common.industry)}\n- 阶段：${assetFact(common.stage)}\n- 优先级：${assetFact(common.grade)}\n- 核心产品：${assetFact(brief.products)}\n- 赚钱逻辑：${assetFact(brief.revenueLogic)}\n\n核心机会\n- 客户痛点：${assetFact(pain)}\n- 经营影响：${assetFact(customer.painChain?.impact)}\n- 推荐切入：${assetFact(solution)}\n- 价值锚点：${assetFact(negotiation.valueAnchor)}\n\n关键关系\n- 决策人：${assetFact(common.decisionMaker)}\n- 当前关系：${assetFact(customer.fields.relation?.v)}\n\n主要风险\n${assetFact(customer.raidFile?.dm?.concern || negotiation.objections)}\n\n下一步行动\n${assetFact(next)}`,
  };
}

function generateSalesAsset(customerId, type) {
  const customer = getCustomer(customerId), definition = SALES_ASSET_TYPES.find(item => item.key === type); if (!customer || !definition) return;
  const built = buildSalesAssetContent(customer, type);
  const asset = { id: uid("sa"), type, title: built.title, content: built.content, createdAt: nowDateTime() };
  customer.salesAssets.unshift(asset); persist(); renderApp(); openSalesAsset(customer.id, asset.id); toast(`${definition.label}已生成并保存`);
}

function openSalesAsset(customerId, assetId) {
  const customer = getCustomer(customerId), asset = customer?.salesAssets.find(item => item.id === assetId); if (!asset) return;
  showModal(`<div class="modal-head"><div><p class="eyebrow">SALES ASSET</p><h2 id="modalTitle">${safe(asset.title)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><div class="sales-asset-preview"><pre>${safe(asset.content)}</pre><div class="modal-actions"><button class="secondary-button" data-action="copy-sales-asset" data-customer="${safe(customer.id)}" data-asset="${safe(asset.id)}">${icon("copy")} 复制内容</button><button class="primary-button" data-action="download-sales-asset" data-customer="${safe(customer.id)}" data-asset="${safe(asset.id)}">${icon("download")} 下载文本</button></div></div>`);
}

async function copySalesAsset(customerId, assetId) {
  const asset = getCustomer(customerId)?.salesAssets.find(item => item.id === assetId); if (!asset) return;
  try { await navigator.clipboard.writeText(asset.content); toast("内容已复制"); }
  catch (error) { console.warn("Clipboard unavailable", error); toast("复制失败，请打开资产后手动复制"); }
}

function downloadTextFile(fileName, content) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadSalesAsset(customerId, assetId) {
  const customer = getCustomer(customerId), asset = customer?.salesAssets.find(item => item.id === assetId); if (!customer || !asset) return;
  downloadTextFile(`${customer.name}_${asset.title}_${todayStr()}.txt`, asset.content); toast("销售资产已下载");
}

function removeSalesAsset(customerId, assetId) {
  const customer = getCustomer(customerId); if (!customer) return;
  customer.salesAssets = customer.salesAssets.filter(item => item.id !== assetId); persist(); renderApp(); toast("销售资产已删除");
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
      <div class="section-heading"><div><p class="eyebrow">PROGRESS JOURNEY</p><h2>全流程客户推进记录</h2></div></div>
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

function phoneTypeMeta(type) {
  const [key, label] = PHONE_TYPES.find(([option]) => option === type) || PHONE_TYPES[0];
  return { key, label };
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
  const phoneType = phoneTypeMeta(person.phoneType);
  return `<div class="org-branch"><article class="person-card ${built ? "connected" : ""}"><div class="person-main"><span class="person-avatar large">${safe(person.name?.[0] || "人")}</span><div><b>${safe(person.name)}</b><small>${safe(person.role || "职位未填写")}</small></div><span class="influence-pill">${person.level === 1 ? "决策" : person.level === 2 ? "影响" : "执行"}</span></div><div class="person-contact">${person.phone ? `<span>${icon("phone")} ${safe(person.phone)} <i class="phone-status phone-status--${safe(phoneType.key)}">${safe(phoneType.label)}</i></span>` : ""}${person.wechat ? `<span>${icon("message-circle")} ${safe(person.wechat)}</span>` : ""}${person.email ? `<span>${icon("mail")} ${safe(person.email)}</span>` : ""}</div><p>${safe(person.note || "尚未补充关系备注")}</p><div class="person-actions"><button data-action="edit-contact" data-customer="${customer.id}" data-contact="${person.id}">${icon("pencil")} 编辑</button><button data-action="remove-contact" data-customer="${customer.id}" data-contact="${person.id}">${icon("trash-2")} 删除</button></div></article>${children.length ? `<div class="org-children">${children.map(child => renderOrgBranch(customer, child, nextVisited)).join("")}</div>` : ""}</div>`;
}

function intelSourceLabel(source) { return (INTEL_SOURCES.find(([key]) => key === source) || INTEL_SOURCES[0])[1]; }
function intelConfidenceLabel(confidence) { return (INTEL_CONFIDENCES.find(([key]) => key === confidence) || INTEL_CONFIDENCES[0])[1]; }
function intelFieldRecord(customer, key) {
  const field = customer.fields[key] || {};
  return { v: "", source: "", confidence: "unverified", verifiedAt: "", ...field };
}
function selectOptions(options, selected) { return options.map(([key, label]) => `<option value="${safe(key)}" ${key === selected ? "selected" : ""}>${safe(label)}</option>`).join(""); }
function admittanceStatus(admittance) {
  const isVerified = Boolean(admittance.verifiedAt) && ["clear", "reported", "followed"].includes(admittance.status);
  if (!isVerified) return { key: "unverified", label: "待核", detail: "当前信息尚未完成准入核验，不构成准入结论" };
  const label = (ADMITTANCE_STATUSES.find(([key]) => key === admittance.status) || ADMITTANCE_STATUSES[0])[1];
  return { key: admittance.status, label, detail: `已于 ${admittance.verifiedAt} 核验` };
}
function renderAdmittance(customer) {
  const admittance = customer.admittance;
  const status = admittanceStatus(admittance);
  return `<div class="intel-section admittance-section"><div class="intel-section-title"><span>准入</span><div><b>客户准入与存量</b><small>仅已选状态且填写核验日期后，才形成准入结论</small></div><em class="admittance-status admittance-status--${status.key}" title="${safe(status.detail)}">${safe(status.label)}</em></div><div class="intel-form-grid admittance-grid"><label class="intel-field"><span>核验结论</span><div class="modern-select"><select data-admittance-field="status" data-customer="${safe(customer.id)}">${selectOptions(ADMITTANCE_STATUSES, admittance.status)}</select>${icon("chevron-down")}</div></label><label class="intel-field"><span>主商务 / 报备人</span><input data-admittance-field="reportedBy" data-customer="${safe(customer.id)}" value="${safe(admittance.reportedBy)}" placeholder="录入后仍需核验" /></label><label class="intel-field"><span>归属通路</span><div class="modern-select"><select data-admittance-field="channel" data-customer="${safe(customer.id)}">${selectOptions(ADMITTANCE_CHANNELS, admittance.channel)}</select>${icon("chevron-down")}</div></label><label class="intel-field"><span>腾讯云 UIN</span><input data-admittance-field="uin" data-customer="${safe(customer.id)}" value="${safe(admittance.uin)}" placeholder="有则为存量客户" /></label><label class="intel-field"><span>集团 GID</span><input data-admittance-field="groupGid" data-customer="${safe(customer.id)}" value="${safe(admittance.groupGid)}" placeholder="用于关联集团主体" /></label><label class="intel-field"><span>来源</span><div class="modern-select"><select data-admittance-field="source" data-customer="${safe(customer.id)}">${selectOptions(INTEL_SOURCES, admittance.source)}</select>${icon("chevron-down")}</div></label><label class="intel-field"><span>置信度</span><div class="modern-select"><select data-admittance-field="confidence" data-customer="${safe(customer.id)}">${selectOptions(INTEL_CONFIDENCES, admittance.confidence)}</select>${icon("chevron-down")}</div></label><label class="intel-field"><span>核验日期</span><input type="date" data-admittance-field="verifiedAt" data-customer="${safe(customer.id)}" value="${safe(admittance.verifiedAt)}" /></label></div></div>`;
}
function renderAdmittanceWorkspace(customer) {
  const status = admittanceStatus(customer.admittance);
  return `<div class="admittance-workspace">
    <section class="admittance-intro">
      <div><p class="eyebrow">ADMISSION CHECK</p><h2>客户准入与存量核验</h2><p>先确认归属和存量状态，再核验招投标与资质事实。</p></div>
      <span class="admittance-intro-status admittance-status--${safe(status.key)}">${safe(status.label)}</span>
    </section>
    <section class="panel admittance-panel">${renderAdmittance(customer)}</section>
    <div class="admittance-fact-grid">
      ${renderBidding(customer)}
      ${renderQualifications(customer)}
    </div>
  </div>`;
}

function intelEvidenceMeta(item) {
  const verified = item?.verifiedAt ? `核验 ${item.verifiedAt}` : "待核";
  return [intelSourceLabel(item?.source), intelConfidenceLabel(item?.confidence), verified].join(" · ");
}
function renderBidding(customer) {
  const items = [...customer.bidding].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return `<section class="panel intelligence-records"><div class="section-heading"><div><h2>招投标 / 中标</h2><small>来源和核验齐全后才作为已核实事实</small></div><button class="text-button" data-action="add-bidding" data-customer="${safe(customer.id)}">${icon("plus")} 添加</button></div>${items.length ? `<div class="intel-record-list">${items.map(item => `<article><div><b>${safe(item.project)}</b><small>${safe([item.purchaser, item.role, item.amount, formatShortDate(item.date)].filter(Boolean).join(" · "))}</small><small>${safe(intelEvidenceMeta(item))}</small>${item.signal ? `<p>${safe(item.signal)}</p>` : ""}${normalizeWebsiteUrl(item.sourceUrl) ? `<a href="${safe(normalizeWebsiteUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">查看来源 ${icon("external-link")}</a>` : ""}</div><button data-action="remove-bidding" data-customer="${safe(customer.id)}" data-item="${safe(item.id)}" aria-label="删除招投标记录">${icon("x")}</button></article>`).join("")}</div>` : emptyState("还没有招投标信息", "记录项目、采购方、金额和中标角色。")}</section>`;
}
function renderQualifications(customer) {
  const items = customer.qualifications;
  return `<section class="panel intelligence-records"><div class="section-heading"><div><h2>资质与许可</h2><small>来源和核验齐全后才作为已核实事实</small></div><button class="text-button" data-action="add-qualification" data-customer="${safe(customer.id)}">${icon("plus")} 添加</button></div>${items.length ? `<div class="intel-record-list">${items.map(item => `<article><div><b>${safe(item.name)}</b><small>${safe([item.type, item.authority, item.validTo ? `有效至 ${item.validTo}` : ""].filter(Boolean).join(" · "))}</small><small>${safe(intelEvidenceMeta(item))}</small>${normalizeWebsiteUrl(item.sourceUrl) ? `<a href="${safe(normalizeWebsiteUrl(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">查看来源 ${icon("external-link")}</a>` : ""}</div><button data-action="remove-qualification" data-customer="${safe(customer.id)}" data-item="${safe(item.id)}" aria-label="删除资质记录">${icon("x")}</button></article>`).join("")}</div>` : emptyState("还没有资质信息", "可记录版号、等保、ICP 或行业许可。")}</section>`;
}
function renderIntelligence(customer) {
  const publicFields = FIELD_DEFS.filter(d => d.public);
  const privateFields = FIELD_DEFS.filter(d => !d.public);
  return `<div class="intel-layout">
    <section class="panel intelligence-panel">
      <div class="section-heading"><div><p class="eyebrow">CUSTOMER INTELLIGENCE</p><h2>情报与证据</h2></div><span class="save-hint">修改后自动保存</span></div>
      <div class="intel-section"><div class="intel-section-title"><span>公开</span><div><b>基础信息</b><small>逐条标注来源、置信度与核验时间</small></div></div><div class="intel-form-grid">${publicFields.map(def => intelField(customer, def)).join("")}</div></div>
      <div class="intel-section"><div class="intel-section-title private"><span>私有</span><div><b>一线情报</b><small>来自真实沟通，是推进关键</small></div></div><div class="intel-form-grid single">${privateFields.map(def => intelField(customer, def, true)).join("")}</div></div>
    </section>
    <aside class="intel-side">
      <section class="panel"><div class="section-heading"><h2>核心痛点</h2><button class="text-button" data-action="add-pain" data-customer="${customer.id}">${icon("plus")} 添加</button></div><div class="editable-list">${customer.painPoints.length ? customer.painPoints.map((p,i) => `<article><span>${safe(p.v)}</span><button data-action="remove-pain" data-customer="${customer.id}" data-index="${i}" aria-label="删除痛点">${icon("x")}</button></article>`).join("") : emptyState("尚未记录痛点", "从沟通中持续补充。")}</div></section>
      <section class="panel"><div class="section-heading"><div><h2>匹配方案</h2><small>销售假设，需客户确认</small></div><button class="text-button" data-action="add-solution" data-customer="${customer.id}">${icon("plus")} 添加</button></div><div class="solution-list">${customer.solution.length ? customer.solution.map(s => `<article><b>${safe(s.product)}</b><p>${safe(s.reason)}</p><small class="inference-label">推测供参考 · 非事实</small></article>`).join("") : emptyState("尚未匹配方案", "基于明确痛点再提供方案。")}</div></section>
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
  const field = intelFieldRecord(customer, def.key);
  const valueControl = multiline
    ? `<textarea rows="3" data-intel-field="${def.key}" data-customer="${customer.id}" placeholder="${safe(def.ph)}">${safe(field.v)}</textarea>`
    : `<input data-intel-field="${def.key}" data-customer="${customer.id}" value="${safe(field.v)}" placeholder="${safe(def.ph)}" />`;
  return `<label class="intel-field ${multiline ? "wide" : ""}"><span>${safe(def.label)}</span>${valueControl}</label>`;
}

function renderTasks() {
  const tasks = getTasks().sort(taskPriority);
  const open = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);
  return `<div class="page tasks-page">
    <section class="page-heading"><div><p class="eyebrow">ACTION CENTER</p><h1>待办</h1><p>所有客户的下一步行动集中管理，完成后保留历史。</p></div></section>
    <div class="task-summary"><span><b>${open.filter(t => t.overdue).length}</b> 已逾期</span><span><b>${open.filter(t => t.today).length}</b> 今天</span><span><b>${open.filter(t => !t.overdue && !t.today).length}</b> 即将开始</span></div>
    <section class="td-panel task-worktable"><div class="section-heading"><h2>待处理</h2><span>${open.length}</span></div><div class="task-list">${open.length ? open.map(renderTaskRow).join("") : emptyState("没有待处理任务", "新的下一步行动会自动出现在这里。", "success")}</div></section>
    ${done.length ? `<section class="td-panel task-worktable completed-worktable"><div class="section-heading"><h2>已完成</h2><span>${done.length}</span></div><div class="task-list completed">${done.slice(0,8).map(renderTaskRow).join("")}</div></section>` : ""}
  </div>`;
}

function renderTaskRow(task) {
  const taskAction = task.done ? "restore-task" : "complete-task";
  const taskLabel = task.done ? "取消完成" : "完成待办";
  return `<article class="task-row ${task.done ? "done" : ""}"><button class="task-check ${task.done ? "checked task-check--undo" : ""}" data-action="${taskAction}" data-customer="${task.customer.id}" data-note="${task.note.id}" aria-label="${taskLabel}">${task.done ? `${icon("rotate-ccw")}<span>取消完成</span>` : ""}</button><button class="task-content" data-action="open-customer" data-id="${task.customer.id}"><b>${safe(task.text)}</b><span>${safe(task.customer.name)} · ${safe(task.note.contact || "未指定联系人")}</span></button><b class="grade-dot grade-${task.customer.grade}">${task.customer.grade}</b><time class="${task.overdue && !task.done ? "danger-text" : ""}">${formatShortDate(task.date)}</time></article>`;
}

function getStalledPriorityCustomers(customerList = customers) {
  return customerList
    .map(customer => ({ customer, days: daysSince(lastActivityDate(customer)) }))
    .filter(item => item.days >= 14 && ["S", "A"].includes(item.customer.grade) && !["won", "lost"].includes(item.customer.stage))
    .sort((a, b) => b.days - a.days);
}

const ANALYTICS_PERIODS = [
  { key: "this-week", label: "本周" },
  { key: "last-week", label: "上周" },
  { key: "this-month", label: "本月" },
  { key: "last-month", label: "上月" },
];

function startOfWeek(date) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function addCalendarDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function getAnalyticsPeriod(periodKey = "this-week", baseDate = new Date()) {
  const weekStart = startOfWeek(baseDate);
  const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const definitions = {
    "this-week": { start: weekStart, end: addCalendarDays(weekStart, 7), compareStart: addCalendarDays(weekStart, -7), compareEnd: weekStart },
    "last-week": { start: addCalendarDays(weekStart, -7), end: weekStart, compareStart: addCalendarDays(weekStart, -14), compareEnd: addCalendarDays(weekStart, -7) },
    "this-month": { start: monthStart, end: new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1), compareStart: new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1), compareEnd: monthStart },
    "last-month": { start: new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1), end: monthStart, compareStart: new Date(baseDate.getFullYear(), baseDate.getMonth() - 2, 1), compareEnd: new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1) },
  };
  const selected = definitions[periodKey] || definitions["this-week"];
  return { ...selected, key: periodKey, label: ANALYTICS_PERIODS.find(item => item.key === periodKey)?.label || "本周" };
}

function isDateInRange(value, start, end) {
  const date = parseDate(value);
  return Boolean(date && date >= start && date < end);
}

function collectAnalyticsMetrics(range) {
  const newCustomers = customers.filter(customer => isDateInRange(customer.createdAt, range.start, range.end));
  const followups = customers.flatMap(customer => customer.notes.filter(note => isDateInRange(note.date, range.start, range.end)).map(note => ({ customer, note })));
  const stageChanges = customers.flatMap(customer => (customer.stageHistory || [])
    .filter(item => isDateInRange(item.date, range.start, range.end) && !["当前阶段", "批量导入"].includes(item.note))
    .map(history => ({ customer, history })));
  const completedTasks = customers.flatMap(customer => customer.notes
    .filter(note => note.taskDone && isDateInRange(note.completedAt, range.start, range.end))
    .map(note => ({ customer, note })));
  const today = todayStr();
  const overdueTasks = customers.flatMap(customer => customer.notes
    .filter(note => note.next && note.nextDate && !note.taskDone && note.nextDate < today && isDateInRange(note.nextDate, range.start, range.end))
    .map(note => ({ customer, note })));
  const outcomes = stageChanges.filter(item => ["won", "lost"].includes(item.history.stage));
  const coveredCustomerIds = new Set(followups.map(item => item.customer.id));
  return {
    newCustomers, followups, stageChanges, completedTasks, overdueTasks, outcomes,
    values: {
      newCustomers: newCustomers.length,
      followups: followups.length,
      coveredCustomers: coveredCustomerIds.size,
      stageChanges: stageChanges.length,
      completedTasks: completedTasks.length,
      overdueTasks: overdueTasks.length,
      outcomes: outcomes.length,
    },
  };
}

function analyticsCutoff(period, now = new Date()) {
  return period.end < now ? period.end : now;
}

function customerStageAt(customer, cutoff) {
  const latest = (customer.stageHistory || [])
    .filter(item => { const date = parseDate(item.date); return date && date < cutoff; })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  return latest?.stage || customer.stage;
}

function noteOpenAt(note, cutoff) {
  const createdAt = parseDate(note.date);
  const completedAt = parseDate(note.completedAt);
  return Boolean(note.next && note.nextDate && (!createdAt || createdAt < cutoff) && (!completedAt || completedAt >= cutoff));
}

function getAnalyticsRisks(period) {
  const risks = [];
  const cutoff = analyticsCutoff(period);
  const cutoffDate = dateString(cutoff);
  customers.forEach(customer => {
    const stage = customerStageAt(customer, cutoff);
    customer.notes.filter(note => noteOpenAt(note, cutoff) && note.nextDate < cutoffDate).forEach(note => risks.push({
      id: `overdue-${customer.id}-${note.id}`, customer, level: "high", title: note.next,
      detail: `截至周期末已逾期 · 原计划 ${formatShortDate(note.nextDate)}`,
    }));
    if (["won", "lost"].includes(stage)) return;
    const notesBeforeCutoff = customer.notes
      .filter(note => { const date = parseDate(note.date); return date && date < cutoff; })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const latest = notesBeforeCutoff[0];
    const latestActivity = latest?.date || (customer.stageHistory || []).filter(item => { const date = parseDate(item.date); return date && date < cutoff; }).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]?.date;
    const inactiveDays = latestActivity ? Math.max(0, Math.floor((cutoff - parseDate(latestActivity)) / 86400000)) : 0;
    if (["S", "A"].includes(customer.grade) && inactiveDays >= 14) risks.push({
      id: `stalled-${customer.id}`, customer, level: "medium", title: `${customer.name} 已停滞`,
      detail: `${stageLabel(stage)} · 截至周期末 ${inactiveDays} 天未更新`,
    });
    if (latest && !latest.next) risks.push({ id: `no-next-${customer.id}`, customer, level: "medium", title: `${customer.name} 缺少下一步`, detail: "周期末最近跟进尚未形成明确行动" });
    if (stage === "proposal" && (!customer.painPoints.length || !customer.solution.length || !customer.orgChain.some(person => Number(person.level) === 1))) {
      risks.push({ id: `proposal-gap-${customer.id}`, customer, level: "medium", title: `${customer.name} 提案信息不完整`, detail: "需补齐痛点、方案或决策人" });
    }
  });
  return risks.sort((a, b) => (a.level === "high" ? -1 : 1) - (b.level === "high" ? -1 : 1)).slice(0, 10);
}

function getNextPeriodActions(risks, period) {
  const cutoff = analyticsCutoff(period);
  const actions = [];
  const openTasks = customers.flatMap(customer => customer.notes
    .filter(note => noteOpenAt(note, cutoff))
    .map(note => ({ customer, note, text: note.next, date: note.nextDate, done: false, overdue: note.nextDate < dateString(cutoff) })));
  openTasks.sort(taskPriority).slice(0, 6).forEach(task => actions.push({
    id: `task-${task.customer.id}-${task.note.id}`, customer: task.customer, text: task.text,
    detail: `${task.overdue ? "周期末已逾期 · " : "计划 "}${formatShortDate(task.date)}`,
  }));
  risks.filter(risk => !actions.some(action => action.customer.id === risk.customer.id)).slice(0, 4).forEach(risk => actions.push({
    id: `risk-${risk.id}`, customer: risk.customer, text: risk.title, detail: risk.detail,
  }));
  return actions.slice(0, 8);
}

function buildAnalyticsReview(periodKey = state.analyticsPeriod, baseDate = new Date()) {
  const period = getAnalyticsPeriod(periodKey, baseDate);
  const metrics = collectAnalyticsMetrics(period);
  const previous = collectAnalyticsMetrics({ start: period.compareStart, end: period.compareEnd });
  const progress = [
    ...metrics.stageChanges.map(item => ({ date: item.history.date, customer: item.customer, title: `${item.customer.name} 推进至${stageLabel(item.history.stage)}`, detail: item.history.note || "阶段已更新", tone: item.history.stage === "won" ? "success" : item.history.stage === "lost" ? "danger" : "info" })),
    ...metrics.followups.map(item => ({ date: item.note.date, customer: item.customer, title: `${item.customer.name} 新增跟进`, detail: item.note.content || item.note.next || "已记录客户沟通", tone: "info" })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
  const risks = getAnalyticsRisks(period);
  const actions = getNextPeriodActions(risks, period);
  const review = { period, metrics, previous, progress, risks, actions };
  review.summary = buildPeriodReviewSummary(review);
  return review;
}

function selectedReviewActions(review) {
  return review.actions.filter(action => state.analyticsActionSelections[action.id] !== false);
}

function buildPeriodReviewSummary(review) {
  const { period, metrics, progress, risks } = review;
  const values = metrics.values;
  const actionLines = selectedReviewActions(review).map(item => `- ${item.customer.name}：${item.text}`);
  const progressLines = progress.slice(0, 5).map(item => `- ${item.title}：${item.detail}`);
  const riskLines = risks.slice(0, 5).map(item => `- ${item.title}：${item.detail}`);
  return `${period.label}销售复盘（${dateString(period.start)} 至 ${dateString(addCalendarDays(period.end, -1))}）\n\n一、本周期概览\n- 新增客户 ${values.newCustomers} 个\n- 有效跟进 ${values.followups} 次，覆盖 ${values.coveredCustomers} 个客户\n- 阶段推进 ${values.stageChanges} 次\n- 完成待办 ${values.completedTasks} 项\n- 本周期到期且仍逾期 ${values.overdueTasks} 项\n- 成交/流失 ${values.outcomes} 个\n\n二、关键客户进展\n${progressLines.length ? progressLines.join("\n") : "- 本周期暂无可识别的关键进展"}\n\n三、风险与阻塞\n${riskLines.length ? riskLines.join("\n") : "- 当前未识别到重点风险"}\n\n四、下周期重点行动\n${actionLines.length ? actionLines.join("\n") : "- 暂无待安排的重点行动"}`;
}

function analyticsMetricDefinitions(review) {
  const current = review.metrics.values;
  const previous = review.previous.values;
  return [
    { key: "newCustomers", label: "新增客户", value: current.newCustomers, previous: previous.newCustomers, hint: "仅统计有创建时间的客户", icon: "user-plus" },
    { key: "followups", label: "有效跟进", value: current.followups, previous: previous.followups, hint: `覆盖 ${current.coveredCustomers} 个客户`, icon: "messages-square" },
    { key: "stageChanges", label: "阶段推进", value: current.stageChanges, previous: previous.stageChanges, hint: "排除初始阶段和批量导入", icon: "route" },
    { key: "completedTasks", label: "完成待办", value: current.completedTasks, previous: previous.completedTasks, hint: "按实际完成时间统计", icon: "circle-check" },
    { key: "overdueTasks", label: "逾期待办", value: current.overdueTasks, previous: previous.overdueTasks, hint: "本周期到期且目前未完成", icon: "triangle-alert" },
    { key: "outcomes", label: "成交 / 流失", value: current.outcomes, previous: previous.outcomes, hint: "本周期关单变化", icon: "flag" },
  ];
}

function renderAnalyticsMetric(metric) {
  const delta = metric.value - metric.previous;
  return `<button class="analytics-metric" data-action="open-analytics-metric" data-metric="${metric.key}"><span>${icon(metric.icon)}</span><small>${metric.label}</small><strong>${metric.value}</strong><em class="${delta > 0 ? "up" : delta < 0 ? "down" : "flat"}">${delta > 0 ? "+" : ""}${delta} 较上期</em><p>${safe(metric.hint)}</p></button>`;
}

function renderReviewList(items, emptyTitle, emptyCopy, type) {
  if (!items.length) return emptyState(emptyTitle, emptyCopy, type === "risk" ? "success" : "scratch");
  return `<div class="review-list ${type}">${items.map(item => `<button data-action="open-customer" data-id="${item.customer.id}"><span class="review-list-icon">${icon(type === "risk" ? "triangle-alert" : "arrow-up-right")}</span><span><b>${safe(item.title)}</b><small>${safe(item.detail)}</small></span>${icon("chevron-right")}</button>`).join("")}</div>`;
}

function renderAnalytics() {
  const review = buildAnalyticsReview();
  const metrics = analyticsMetricDefinitions(review);
  const maxStage = Math.max(1, ...CRM_STAGES.map(s => customers.filter(c => c.stage === s.key).length));
  const summary = state.analyticsAiPeriodKey === review.period.key && state.analyticsAiSummary ? state.analyticsAiSummary : review.summary;
  return `<div class="page analytics-page">
    <section class="page-heading analytics-heading"><div><p class="eyebrow">PERFORMANCE REVIEW</p><h1>分析与复盘</h1><p>把客户记录转成周期进展、风险和下一步行动。</p></div><div class="analytics-periods" role="group" aria-label="复盘周期">${ANALYTICS_PERIODS.map(item => `<button class="${state.analyticsPeriod === item.key ? "active" : ""}" data-action="set-analytics-period" data-period="${item.key}" aria-pressed="${state.analyticsPeriod === item.key}">${item.label}</button>`).join("")}</div></section>
    <section class="analytics-period-strip"><span>${icon("calendar-range")} ${dateString(review.period.start)} 至 ${dateString(addCalendarDays(review.period.end, -1))}</span><small>数字与事实由客户记录自动计算</small></section>
    <section class="analytics-metrics">${metrics.map(renderAnalyticsMetric).join("")}</section>
    <section class="td-panel period-summary-panel">
      <div class="section-heading"><div><p class="eyebrow">PERIOD SUMMARY</p><h2>${review.period.label}总结</h2></div><div class="summary-actions"><button class="soft-button" data-action="copy-period-review">${icon("copy")} 复制总结</button><button class="primary-button" data-action="polish-period-review" ${state.analyticsAiLoading ? "disabled" : ""}>${icon("sparkles")} ${state.analyticsAiLoading ? "润色中" : "AI 润色"}</button></div></div>
      <pre id="periodReviewSummary">${safe(summary)}</pre>
      <p class="summary-source">${state.analyticsAiPeriodKey === review.period.key && state.analyticsAiSummary ? "AI 仅润色表达，事实与数字来自规则计算。" : "当前为规则生成总结；未配置 AI 也可正常使用。"}</p>
    </section>
    <div class="period-review-grid">
      <section class="td-panel"><div class="section-heading"><div><p class="eyebrow">KEY PROGRESS</p><h2>关键进展</h2></div><span>${review.progress.length}</span></div>${renderReviewList(review.progress, "暂无关键进展", "本周期还没有跟进或阶段变化。", "progress")}</section>
      <section class="td-panel"><div class="section-heading"><div><p class="eyebrow">RISKS</p><h2>风险与阻塞</h2></div><span>${review.risks.length}</span></div>${renderReviewList(review.risks, "未发现重点风险", "客户节奏和待办状态正常。", "risk")}</section>
    </div>
    <section class="td-panel next-period-panel"><div class="section-heading"><div><p class="eyebrow">NEXT PERIOD</p><h2>下周期重点行动</h2></div><span>勾选后会进入复制总结</span></div>${review.actions.length ? `<div class="next-period-actions">${review.actions.map(action => `<label><input type="checkbox" data-action="toggle-review-action" data-action-id="${safe(action.id)}" ${state.analyticsActionSelections[action.id] === false ? "" : "checked"}><span><b>${safe(action.customer.name)} · ${safe(action.text)}</b><small>${safe(action.detail)}</small></span><button type="button" data-action="open-customer" data-id="${safe(action.customer.id)}" aria-label="打开${safe(action.customer.name)}">${icon("arrow-up-right")}</button></label>`).join("")}</div>` : emptyState("暂无重点行动", "补充下一步或客户风险后会自动生成。", "success")}</section>
    <div class="analytics-workspace analytics-baseline">
      <section class="td-panel"><div class="section-heading"><div><p class="eyebrow">PIPELINE</p><h2>推进阶段分布</h2></div></div><div class="bar-chart">${CRM_STAGES.map(stage => { const count=customers.filter(c=>c.stage===stage.key).length; return `<div><span>${stage.label}</span><i><b style="width:${count/maxStage*100}%;--bar:${stage.color}"></b></i><strong>${count}</strong></div>`; }).join("")}</div></section>
      <section class="td-panel"><div class="section-heading"><div><p class="eyebrow">GRADE STRUCTURE</p><h2>客户等级结构</h2></div></div><div class="grade-chart">${GRADES.map(g => `<article style="--grade:${g.color}"><b>${g.key}</b><strong>${customers.filter(c=>c.grade===g.key).length}</strong><small>${safe(g.label.split("·").at(-1).trim())}</small></article>`).join("")}</div></section>
    </div>
  </div>`;
}

function setAnalyticsPeriod(periodKey) {
  if (!ANALYTICS_PERIODS.some(item => item.key === periodKey)) return;
  state.analyticsPeriod = periodKey;
  state.analyticsAiSummary = "";
  state.analyticsAiPeriodKey = "";
  renderApp();
}

function metricDetailItems(review, metricKey) {
  const metrics = review.metrics;
  if (metricKey === "newCustomers") return metrics.newCustomers.map(customer => ({ customer, title: customer.name, detail: `创建于 ${formatDateTime(customer.createdAt)}` }));
  if (metricKey === "followups") return metrics.followups.map(({ customer, note }) => ({ customer, title: customer.name, detail: note.content || note.next || formatDateTime(note.date) }));
  if (metricKey === "stageChanges") return metrics.stageChanges.map(({ customer, history }) => ({ customer, title: customer.name, detail: `推进至${stageLabel(history.stage)} · ${formatDateTime(history.date)}` }));
  if (metricKey === "completedTasks") return metrics.completedTasks.map(({ customer, note }) => ({ customer, title: customer.name, detail: note.next || "已完成待办" }));
  if (metricKey === "overdueTasks") return metrics.overdueTasks.map(({ customer, note }) => ({ customer, title: customer.name, detail: `${note.next} · ${formatShortDate(note.nextDate)}` }));
  return metrics.outcomes.map(({ customer, history }) => ({ customer, title: customer.name, detail: `${stageLabel(history.stage)} · ${formatDateTime(history.date)}` }));
}

function openAnalyticsMetric(metricKey) {
  const review = buildAnalyticsReview();
  const metric = analyticsMetricDefinitions(review).find(item => item.key === metricKey);
  if (!metric) return;
  const items = metricDetailItems(review, metricKey);
  showModal(`<div class="modal-head"><div><p class="eyebrow">METRIC DETAIL</p><h2 id="modalTitle">${safe(review.period.label)} · ${safe(metric.label)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div>
    <div class="metric-detail-list">${items.length ? items.map(item => `<button data-action="open-analytics-customer" data-id="${safe(item.customer.id)}"><span><b>${safe(item.title)}</b><small>${safe(item.detail)}</small></span>${icon("arrow-right")}</button>`).join("") : emptyState("没有对应记录", "当前周期暂未产生这类数据。")}</div>`);
}

function toggleReviewAction(actionId, checked) {
  if (!actionId) return;
  state.analyticsActionSelections[actionId] = Boolean(checked);
  state.analyticsAiSummary = "";
  state.analyticsAiPeriodKey = "";
  renderApp();
}

async function copyPeriodReview() {
  const review = buildAnalyticsReview();
  const summary = state.analyticsAiPeriodKey === review.period.key && state.analyticsAiSummary ? state.analyticsAiSummary : review.summary;
  try { await navigator.clipboard.writeText(summary); toast("周期总结已复制"); }
  catch (error) { console.warn("Copy period review failed", error); toast("复制失败，请手动选择总结内容"); }
}

async function polishPeriodReview() {
  const review = buildAnalyticsReview();
  if (typeof SalesAPI === "undefined" || !SalesAPI.polishReview) return toast("当前模式暂不支持 AI 润色，规则总结仍可使用");
  const requestedPeriod = review.period.key;
  const requestedSummary = review.summary;
  state.analyticsAiLoading = true;
  renderApp();
  try {
    const polished = await SalesAPI.polishReview(requestedSummary);
    if (state.analyticsPeriod !== requestedPeriod || buildAnalyticsReview().summary !== requestedSummary) return;
    state.analyticsAiSummary = polished;
    state.analyticsAiPeriodKey = requestedPeriod;
    toast("AI 已完成表达润色，数字和事实保持不变");
  } catch (error) {
    console.warn("AI review polish failed", error);
    toast(error?.status === 503 ? "AI 尚未配置，继续使用规则总结" : "AI 润色失败，规则总结已保留");
  } finally {
    state.analyticsAiLoading = false;
    renderApp();
  }
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
    source: "local",
  };
  renderAIDraft();
  $("#aiDraft")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (typeof SalesAPI !== "undefined" && typeof AuthCoordinator !== "undefined" && AuthCoordinator.mode === "api") {
    void enhanceAIDraftWithAPI(raw, baseDate, matched);
  }
}

async function enhanceAIDraftWithAPI(raw, baseDate, localMatch) {
  try {
    setAssistantState("reviewing");
    const ai = await SalesAPI.extractAI(raw, customers.map(customer => customer.name));
    if (!state.aiDraft || state.aiDraft.raw !== raw) return;
    const matched = customers.find(customer => ai.name && (customer.name === ai.name || customer.name.includes(ai.name))) || localMatch;
    const localAction = extractNextAction(raw, baseDate);
    state.aiDraft = {
      ...state.aiDraft,
      customerId: matched?.id || state.aiDraft.customerId,
      found: Object.keys(ai.found || {}).length ? ai.found : state.aiDraft.found,
      method: ai.method || state.aiDraft.method,
      contact: ai.contact || state.aiDraft.contact,
      next: ai.next || localAction.next || state.aiDraft.next,
      nextDate: ai.nextDate || localAction.nextDate || state.aiDraft.nextDate,
      source: "api",
    };
    renderAIDraft();
  } catch (error) {
    console.warn("AI API unavailable, local extraction retained", error);
    if (error?.status === 503 || error?.code === "AI_NOT_CONFIGURED") toast("AI API 尚未配置，已使用本地规则整理");
  }
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
    <div class="review-head"><div><span class="review-kicker">${draft.source === "api" ? "AI API 已整理" : "本地规则已整理"} · 等待确认</span><h3>准备写入客户档案</h3></div><label>关联客户<div class="modern-select"><select id="aiTargetSelect"><option value="">请选择客户</option>${customers.map(c => `<option value="${c.id}" ${draft.customerId === c.id ? "selected" : ""}>${safe(c.name)}</option>`).join("")}</select>${icon("chevron-down")}</div></label></div>
    <div class="review-items">
      <label class="review-item main-review"><input class="draft-check" type="checkbox" data-kind="note" checked /><span class="review-check"></span><div><small>新增推进记录 · ${safe(methodMeta(draft.method).label)}</small><b>${safe(draft.raw)}</b>${draft.contact ? `<p>对接人：${safe(draft.contact)}</p>` : ""}</div></label>
      ${fields.map(([key,value]) => { const def=FIELD_DEFS.find(d=>d.key===key); return `<label class="review-item"><input class="draft-check" type="checkbox" data-kind="field" data-key="${key}" checked /><span class="review-check"></span><div><small>更新情报 · ${safe(def?.label || key)} · AI 提取后待核</small><b>${safe(value)}</b></div></label>`; }).join("")}
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
  fieldKeys.forEach(key => {
    customer.fields[key] = { ...intelFieldRecord(customer, key), v: draft.found[key], source: "", confidence: "unverified", verifiedAt: "" };
  });
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
  showModal(`<div class="modal-head"><div><p class="eyebrow">NEW ACCOUNT</p><h2 id="modalTitle">新建客户</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="new-customer"><label>客户名称<input name="name" required autofocus placeholder="公司或组织名称" /></label><label>所属行业<input name="industry" placeholder="例如：游戏、零售、SaaS" /></label><label>官方网站<input name="website" inputmode="url" autocomplete="url" placeholder="例如：https://example.com" /></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("arrow-right")} 创建并进入档案</button></div></form>`);
}

function submitNewCustomer(form) {
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const rawWebsite = String(data.get("website") || "").trim();
  const website = normalizeWebsiteUrl(rawWebsite);
  if (!name) return;
  if (rawWebsite && !website) return toast("请输入有效的官方网站地址");
  const customer = ensureCustomerShape({ id: uid(), name, createdAt: nowDateTime(), logo: name[0], color: customerColor(customers.length), stage: "lead", grade: "B", fields: {}, notes: [], assets: [], orgChain: [], painPoints: [], solution: [] });
  customer.fields.industry.v = String(data.get("industry") || "").trim();
  customer.fields.website.v = website;
  customers.unshift(customer);
  persist(); closeModal(); openCustomer(customer.id); toast("客户已创建，可手动填写或交给 AI 整理信息");
}

function openCustomerImport() {
  customerImportRows = [];
  customerImportFormat = "rows";
  customerImportFileName = "";
  customerImportSelectedRows = new Set();
  showModal(`<div class="modal-head"><div><p class="eyebrow">BATCH IMPORT</p><h2 id="modalTitle">批量导入客户</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div>
    <form class="modal-form" data-form="customer-import">
      <div class="import-help"><b>支持 CRM 原生 JSON、CSV、TSV、XLSX、XLS</b><br/>JSON 必须使用 crm-customer-list.v1；表格可识别客户名称、行业、阶段、等级、联系人、职位、电话、邮箱、下一步、提醒日期和备注。</div>
      <button type="button" class="secondary-button import-template-button" data-action="download-import-template">${icon("download")} 下载 CSV 模板</button>
      <label class="file-field">${icon("upload")} 选择客户数据文件<input id="customerImportFile" type="file" name="file" accept=".json,.csv,.tsv,.xlsx,.xls,application/json,text/csv,text/tab-separated-values" required /><small>JSON 和 Excel 导入前都会先展示校验结果。</small></label>
      <label>遇到同名客户<div class="modern-select"><select id="customerImportStrategy" name="strategy"><option value="skip">跳过，不覆盖现有数据</option><option value="update">更新现有客户的非空字段</option></select>${icon("chevron-down")}</div></label>
      <div id="customerImportPreview" class="import-preview" aria-live="polite"></div>
      <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button id="customerImportSubmit" class="primary-button" disabled>${icon("upload")} 确认导入</button></div>
    </form>`);
}

async function readCustomerImportFile(file) {
  if (!file) return { format: "rows", data: [] };
  const extension = String(file.name || "").split(".").pop().toLowerCase();
  if (extension === "json") return { format: "json", data: await file.text() };
  if (["xlsx", "xls"].includes(extension)) {
    if (typeof XLSX === "undefined") throw new Error("Excel 解析组件加载失败，请改用 CSV 或刷新后重试");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error("Excel 文件中没有可读取的工作表");
    return { format: "rows", data: XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "", raw: false }) };
  }
  return { format: "rows", data: CustomerImporter.parseCSV(await file.text()) };
}

function hasCustomerImportPayload() {
  return customerImportFormat === "json"
    ? typeof customerImportRows === "string" && customerImportRows.trim() !== ""
    : Array.isArray(customerImportRows) && customerImportRows.length > 0;
}

function runCustomerImport(strategy, selectedRows = customerImportSelectedRows) {
  const options = { strategy, idFactory: () => uid() };
  if (selectedRows) options.selectedRows = Array.from(selectedRows);
  return customerImportFormat === "json"
    ? CustomerImporter.importJSON(customerImportRows, customers, options)
    : CustomerImporter.importRows(customerImportRows, customers, options);
}

function setCustomerImportSelection(selectAll) {
  if (!hasCustomerImportPayload() || typeof CustomerImporter === "undefined") return;
  if (selectAll) {
    const allItems = runCustomerImport($("#customerImportStrategy")?.value || "skip", null).items || [];
    customerImportSelectedRows = new Set(allItems.map(item => Number(item.row)));
  } else customerImportSelectedRows = new Set();
  renderCustomerImportPreview($("#customerImportStrategy")?.value || "skip");
}

async function previewCustomerImport(file) {
  customerImportRows = [];
  customerImportFormat = "rows";
  customerImportFileName = file?.name || "";
  customerImportSelectedRows = new Set();
  const preview = $("#customerImportPreview");
  const submit = $("#customerImportSubmit");
  if (submit) submit.disabled = true;
  if (!file || !preview) return;
  preview.innerHTML = `<span class="muted">正在解析 ${safe(customerImportFileName)}…</span>`;
  try {
    if (typeof CustomerImporter === "undefined") throw new Error("导入组件尚未加载完成，请稍后重试");
    const parsed = await readCustomerImportFile(file);
    customerImportFormat = parsed.format;
    customerImportRows = parsed.data;
    const strategy = $("#customerImportStrategy")?.value || "skip";
    const initial = runCustomerImport(strategy, null);
    customerImportSelectedRows = new Set((initial.items || []).map(item => Number(item.row)));
    renderCustomerImportPreview(strategy);
  } catch (error) {
    preview.innerHTML = `<ul class="import-errors"><li>${safe(error?.message || "文件解析失败")}</li></ul>`;
  }
}

function renderCustomerImportPreview(strategy = "skip") {
  const preview = $("#customerImportPreview");
  const submit = $("#customerImportSubmit");
  if (!preview || !hasCustomerImportPayload() || typeof CustomerImporter === "undefined") return;
  const result = runCustomerImport(strategy);
  const items = result.items || [];
  const selectedCount = items.filter(item => customerImportSelectedRows.has(Number(item.row))).length;
  const valid = result.imported + result.updated + result.skipped;
  const actionLabels = { import: "新增", update: "更新", skip: "跳过", error: "错误" };
  const customerItems = items.map(item => {
    const selected = customerImportSelectedRows.has(Number(item.row));
    const stage = CRM_STAGES.find(option => option.key === item.stage)?.label || item.stage || "阶段未填写";
    const meta = [item.industry || "行业未填写", item.grade ? `${item.grade} 级` : "等级未填写", stage].map(safe).join(" · ");
    const warning = item.errors?.length ? `<small class="import-customer-error">${safe(item.errors[0])}</small>` : "";
    return `<label class="import-customer-item import-action-${safe(item.action)} ${selected ? "is-selected" : ""}">
      <input type="checkbox" data-import-customer-row="${safe(item.row)}" aria-label="选择 ${safe(item.name)}" ${selected ? "checked" : ""}/>
      <span class="import-customer-copy"><b>${safe(item.name)}</b><small>${meta}</small>${warning}</span>
      <span class="import-customer-status">${safe(actionLabels[item.action] || item.action)}</span>
    </label>`;
  }).join("");
  const errorItems = result.errors.slice(0, 20).map(item => `<li>${item.row ? `第 ${safe(item.row)} 条：` : ""}${safe(item.message)}</li>`).join("");
  preview.innerHTML = `<div class="import-preview-summary"><span>${safe(customerImportFileName || "待导入文件")}</span><span class="success">新增 ${result.imported}</span><span>更新 ${result.updated}</span><span>跳过 ${result.skipped}</span><span class="${result.errors.length ? "danger" : ""}">错误 ${result.errors.length}</span></div>
    ${items.length ? `<div class="import-selection-toolbar"><b>已选择 ${selectedCount} / ${items.length} 个客户</b><span><button type="button" data-action="select-all-import-customers">全选</button><button type="button" data-action="clear-import-customers">取消全选</button></span></div><div class="import-customer-list">${customerItems}</div>` : ""}
    ${result.errors.length ? `<ul class="import-errors">${errorItems}${result.errors.length > 20 ? `<li>另有 ${result.errors.length - 20} 条错误未展示</li>` : ""}</ul>` : ""}`;
  if (submit) {
    submit.disabled = selectedCount === 0 || valid === 0 || (result.imported + result.updated === 0 && strategy === "skip");
    submit.innerHTML = `${icon("upload")} 确认导入${selectedCount ? `（${selectedCount}）` : ""}`;
  }
  if (typeof lucide !== "undefined") lucide.createIcons();
}

function submitCustomerImport(form) {
  if (!hasCustomerImportPayload() || typeof CustomerImporter === "undefined") return toast("请先选择并解析客户数据文件");
  const strategy = String(new FormData(form).get("strategy") || "skip");
  const result = runCustomerImport(strategy);
  if (!customerImportSelectedRows.size) return toast("请至少选择一位客户");
  if (!result.imported && !result.updated) return toast(result.errors.length ? "没有可导入的有效客户，请调整选择或修正文件" : "没有新增或需要更新的客户");
  customers = result.customers.map(ensureCustomerShape);
  persist();
  closeModal();
  state.page = "customers";
  state.customerId = null;
  renderApp();
  toast(`导入完成：新增 ${result.imported}，更新 ${result.updated}，跳过 ${result.skipped}，错误 ${result.errors.length}`);
}

function openDeleteSelectedCustomers() {
  pruneCustomerSelection();
  const selected = customers.filter(customer => selectedCustomerIds.has(customer.id));
  if (!selected.length) return toast("请先选择要删除的客户");
  const relatedCount = selected.reduce((total, customer) => total + ["orgChain", "notes", "assets", "marketNews", "hiringSignals", "bidding", "qualifications"].reduce((sum, key) => sum + (Array.isArray(customer[key]) ? customer[key].length : 0), 0), 0);
  const names = selected.slice(0, 4).map(customer => safe(customer.name)).join("、");
  const more = selected.length > 4 ? ` 等 ${selected.length} 家客户` : "";
  showModal(`<div class="modal-head"><div><p class="eyebrow danger-text">BATCH DELETE</p><h2 id="modalTitle">批量删除客户</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div>
    <form class="modal-form" data-form="delete-selected-customers">
      <div class="delete-warning">${icon("triangle-alert")}<div><b>确定删除已选择的 ${selected.length} 家客户吗？</b><p>${names}${more}</p><p>这些客户及其联系人、跟进、情报等 ${relatedCount} 条关联记录会一并删除。此操作无法撤销。</p></div></div>
      <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="danger-button" type="submit">${icon("trash-2")} 确认删除 ${selected.length} 家客户</button></div>
    </form>`);
}

function submitDeleteSelectedCustomers() {
  pruneCustomerSelection();
  const deletingIds = new Set(selectedCustomerIds);
  const deleted = customers.filter(customer => deletingIds.has(customer.id));
  if (!deleted.length) return toast("所选客户已不存在，无需重复删除");
  customers = customers.filter(customer => !deletingIds.has(customer.id));
  if (reportCustomer && deletingIds.has(reportCustomer.id)) reportCustomer = null;
  selectedCustomerIds = new Set();
  persist();
  closeModal();
  state.page = "customers";
  state.customerId = null;
  state.customerTab = "overview";
  renderApp();
  toast(`已删除 ${deleted.length} 家客户`);
}
function openDeleteCustomer(customerId) {
  const customer = getCustomer(customerId);
  if (!customer) return toast("未找到要删除的客户");
  const relatedCount = ["orgChain", "notes", "assets", "marketNews", "hiringSignals", "bidding", "qualifications"].reduce((sum, key) => sum + (Array.isArray(customer[key]) ? customer[key].length : 0), 0);
  showModal(`<div class="modal-head"><div><p class="eyebrow danger-text">DELETE CUSTOMER</p><h2 id="modalTitle">删除客户</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div>
    <form class="modal-form" data-form="delete-customer">
      <input type="hidden" name="customerId" value="${safe(customer.id)}" />
      <div class="delete-warning">${icon("triangle-alert")}<div><b>确定删除“${safe(customer.name)}”吗？</b><p>该客户及其联系人、跟进、情报等 ${relatedCount} 条关联记录会一并删除。此操作无法撤销。</p></div></div>
      <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="danger-button" type="submit">${icon("trash-2")} 确认删除</button></div>
    </form>`);
}

function submitDeleteCustomer(form) {
  const customerId = String(new FormData(form).get("customerId") || "");
  const index = customers.findIndex(customer => customer.id === customerId);
  if (index < 0) return toast("客户已不存在，无需重复删除");
  const [deleted] = customers.splice(index, 1);
  selectedCustomerIds.delete(customerId);
  if (reportCustomer?.id === customerId) reportCustomer = null;
  persist();
  closeModal();
  state.page = "customers";
  state.customerId = null;
  state.customerTab = "overview";
  renderApp();
  toast(`已删除客户：${deleted.name}`);
}
function downloadCustomerImportTemplate() {
  if (typeof CustomerImporter === "undefined") return toast("导入组件尚未加载完成，请稍后重试");
  const blob = new Blob(["\uFEFF" + CustomerImporter.CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "客户批量导入模板.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function meetingPrepSuggestion(customer) {
  const pain = customer.painPoints.find(item => item?.v)?.v || "当前业务最需要解决的问题";
  const cloudStatus = customer.fields.cloudStatus?.v?.trim() || "当前技术与云资源现状";
  const decisionMaker = customer.orgChain.find(person => Number(person.level) === 1);
  const nextTask = getNextTask(customer);
  const objective = nextTask?.text || ({
    lead: "确认客户当前业务重点与是否值得继续推进",
    contact: "确认客户需求并约出一次正式交流",
    meeting: "确认核心痛点、影响范围与决策链",
    proposal: "确认方案范围、成功标准与评审流程",
    won: "确认交付计划与后续扩展机会",
    lost: "复盘流失原因并判断是否保留重新激活机会",
  })[customer.stage] || "明确本次沟通目标";
  const diagnosis = getOpportunityDiagnosis(customer);
  const weakDimensions = [...OPPORTUNITY_DIMENSIONS].sort((a, b) => diagnosis[a.key] - diagnosis[b.key]).slice(0, 2);
  const diagnosticQuestions = {
    pain: `“${pain}”目前对业务造成的具体影响是什么？`,
    power: decisionMaker ? `除${decisionMaker.name}外，预算、技术评估和采购分别由谁参与？` : "谁会参与最终决策，预算、技术和采购流程分别如何进行？",
    vision: "如果问题得到解决，客户认为必须具备哪些能力，哪些结果才算成功？",
    value: "这个问题若继续存在会带来多少成本或损失，改善后希望获得什么可量化收益？",
    control: "接下来客户内部需要经过哪些评审、测试和审批，谁负责推动每一步？",
    milestone: "双方下一项可验证的里程碑是什么，负责人和完成时间分别是什么？",
  };
  const questions = [
    ...weakDimensions.map(dimension => diagnosticQuestions[dimension.key]),
    `“${pain}”目前对业务造成的具体影响是什么？`,
    `${cloudStatus}中，客户最希望优先改善的是成本、体验还是效率？`,
    decisionMaker ? `除${decisionMaker.name}外，预算、技术评估和采购分别由谁参与？` : "谁会参与最终决策，预算、技术和采购流程分别如何进行？",
  ].filter((question, index, list) => list.indexOf(question) === index).slice(0, 3);
  const hook = customer.stage === "proposal"
    ? "建议约定一次方案预审，并共同确认成功标准、责任人和时间表。"
    : "建议根据本次确认的信息，下一次带一份针对性的分析或方案进行专项交流。";
  return { objective, questions, hook, weakDimensions };
}

function openMeetingPrep(customerId, prepId = "") {
  const customer = getCustomer(customerId);
  if (!customer) return toast("请先选择客户");
  const existing = customer.meetingPreps.find(item => item.id === prepId);
  const suggestion = meetingPrepSuggestion(customer);
  const draft = existing ? {
    objective: existing.objective || suggestion.objective,
    questions: Array.isArray(existing.focus) && existing.focus.length ? existing.focus : suggestion.questions,
    hook: existing.hook || suggestion.hook,
    notes: existing.notes || "",
  } : { ...suggestion, notes: "" };
  const fieldValue = input => safe(input || "");
  showModal(`<div class="modal-head"><div><p class="eyebrow">MEETING BRIEF</p><h2 id="modalTitle">${safe(customer.name)} · ${existing ? "编辑会前速记卡" : "会前速记卡"}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div>
    <form class="modal-form meeting-prep-form" data-form="meeting-prep">
      <input type="hidden" name="customerId" value="${safe(customer.id)}" />
      <input type="hidden" name="prepId" value="${safe(prepId)}" />
      <div class="meeting-prep-hint">${penguinSVG("scratch")}<p><b>Sales Buddy 已根据客户档案预填</b><span>你可以直接修改，确认保存后才会进入客户档案。</span></p></div>
      <label>本次会议目标<textarea name="objective" rows="2" required>${fieldValue(draft.objective)}</textarea></label>
      <fieldset class="meeting-question-list"><legend>本次建议确认的信息</legend>${draft.questions.map((question, index) => `<label><input type="checkbox" name="focus" value="${fieldValue(question)}" checked /><span><i>${index + 1}</i>${safe(question)}</span></label>`).join("")}</fieldset>
      <label>下次会议钩子<textarea name="hook" rows="3">${fieldValue(draft.hook)}</textarea></label>
      <label>销售补充<textarea name="notes" rows="3" placeholder="补充参会人、客户背景或你特别想确认的内容">${fieldValue(draft.notes)}</textarea></label>
      <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存速记卡</button></div>
    </form>`);
}

function submitMeetingPrep(form) {
  const data = new FormData(form);
  const customer = getCustomer(data.get("customerId"));
  if (!customer) return toast("客户不存在，请刷新后重试");
  const objective = String(data.get("objective") || "").trim();
  const hook = String(data.get("hook") || "").trim();
  const focus = data.getAll("focus").map(item => String(item).trim()).filter(Boolean);
  if (!objective) return toast("请填写本次会议目标");
  const prepId = String(data.get("prepId") || "");
  const existing = customer.meetingPreps.find(item => item.id === prepId);
  const record = { id: existing?.id || uid("mp"), createdAt: existing?.createdAt || nowDateTime(), updatedAt: nowDateTime(), objective, focus, hook, notes: String(data.get("notes") || "").trim(), status: "ready" };
  existing ? Object.assign(existing, record) : customer.meetingPreps.push(record);
  customer.guidedActions["meeting-prep"] = { status: "resolved", updatedAt: nowDateTime() };
  persist();
  closeModal();
  renderApp();
  toast(existing ? "会前速记卡已更新" : "会前速记卡已保存到客户档案");
}

function openMeetingReview(customerId, prepId) {
  const customer = getCustomer(customerId);
  const prep = customer?.meetingPreps.find(item => item.id === prepId);
  if (!customer || !prep) return toast("找不到对应的会前速记卡");
  const review = customer.meetingReviews.find(item => item.prepId === prepId) || {};
  showModal(`<div class="modal-head"><div><p class="eyebrow">MEETING FOLLOW-UP</p><h2 id="modalTitle">${safe(customer.name)} · 会后确认</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div>
    <form class="modal-form meeting-review-form" data-form="meeting-review">
      <input type="hidden" name="customerId" value="${safe(customer.id)}" />
      <input type="hidden" name="prepId" value="${safe(prep.id)}" />
      <div class="meeting-review-context"><small>本次原定目标</small><b>${safe(prep.objective)}</b><p>${prep.focus?.length ? `原计划确认 ${prep.focus.length} 项信息` : "未设置摸排项"} · 钩子：${safe(prep.hook || "未设置")}</p></div>
      <label>会议结果摘要<textarea name="summary" rows="4" required placeholder="客户说了什么、态度如何、会议达成了什么">${safe(review.summary || "")}</textarea></label>
      <label>本次确认的关键事实<textarea name="confirmed" rows="3" placeholder="痛点、影响、预算、决策人、时间表等已被客户确认的信息">${safe(review.confirmed || "")}</textarea></label>
      <label>钩子结果 / 下次会议约定<textarea name="hookResult" rows="3" placeholder="客户是否接受下一步交流？约定带什么材料、由谁参加？">${safe(review.hookResult || "")}</textarea></label>
      <div class="form-row"><label>下一步行动<input name="next" value="${safe(review.next || "")}" placeholder="例如：发送测试方案" /></label><label>计划日期<input type="date" name="nextDate" value="${safe(review.nextDate || "")}" /></label></div>
      <label>主要对接人<input name="contact" value="${safe(review.contact || "")}" placeholder="姓名或职位" /></label>
      <div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存会后确认</button></div>
    </form>`);
}

function submitMeetingReview(form) {
  const data = new FormData(form);
  const customer = getCustomer(data.get("customerId"));
  const prepId = String(data.get("prepId") || "");
  const prep = customer?.meetingPreps.find(item => item.id === prepId);
  if (!customer || !prep) return toast("找不到对应的会前速记卡");
  const summary = String(data.get("summary") || "").trim();
  if (!summary) return toast("请填写会议结果摘要");
  const existing = customer.meetingReviews.find(item => item.prepId === prepId);
  const noteId = existing?.noteId || uid("n");
  const record = {
    id: existing?.id || uid("mr"), prepId, noteId,
    createdAt: existing?.createdAt || nowDateTime(), updatedAt: nowDateTime(),
    summary,
    confirmed: String(data.get("confirmed") || "").trim(),
    hookResult: String(data.get("hookResult") || "").trim(),
    next: String(data.get("next") || "").trim(),
    nextDate: String(data.get("nextDate") || ""),
    contact: String(data.get("contact") || "").trim(),
  };
  if (existing) Object.assign(existing, record);
  else customer.meetingReviews.push(record);
  const progressNote = { id: noteId, method: "meeting", date: record.updatedAt, contact: record.contact, place: "", content: [record.summary, record.confirmed, record.hookResult].filter(Boolean).join("\n"), next: record.next, nextDate: record.nextDate, source: "meeting-review", attachments: [], taskDone: false };
  const noteIndex = customer.notes.findIndex(note => note.id === noteId);
  if (noteIndex >= 0) customer.notes[noteIndex] = { ...customer.notes[noteIndex], ...progressNote };
  else customer.notes.push(progressNote);
  prep.status = "completed";
  prep.completedAt = nowDateTime();
  persist();
  closeModal();
  renderApp();
  toast(existing ? "会后确认已更新" : "会后确认已保存，并生成推进记录");
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
  showModal(`<div class="modal-head"><div><p class="eyebrow">STAKEHOLDER</p><h2 id="modalTitle">${person ? "编辑关键联系人" : "添加关键联系人"}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="contact"><input type="hidden" name="customerId" value="${customer.id}" /><input type="hidden" name="contactId" value="${value(contactId)}" /><div class="form-row"><label>姓名<input name="name" required value="${value(person?.name)}" /></label><label>职位<input name="role" value="${value(person?.role)}" placeholder="例如：CTO、采购负责人" /></label></div><fieldset class="choice-fieldset"><legend>角色层级</legend><div class="option-cards role-options">${[[1,"crown","决策层"],[2,"users","影响层"],[3,"wrench","执行层"]].map(([level,iconName,label]) => `<label><input type="radio" name="level" value="${level}" ${(person?.level || 2) === level ? "checked" : ""}/><span>${icon(iconName)}</span><b>${label}</b></label>`).join("")}</div></fieldset><label>上级<div class="modern-select"><select name="pid"><option value="">无上级</option>${customer.orgChain.filter(p => p.id !== contactId).map(p => `<option value="${p.id}" ${person?.pid === p.id ? "selected" : ""}>${safe(p.name)} · ${safe(p.role)}</option>`).join("")}</select>${icon("chevron-down")}</div></label><div class="form-row"><label>电话<input name="phone" value="${value(person?.phone)}" /></label><label>电话核验状态<div class="modern-select"><select name="phoneType">${selectOptions(PHONE_TYPES, person?.phoneType || "unverified")}</select>${icon("chevron-down")}</div></label></div><div class="form-row"><label>微信<input name="wechat" value="${value(person?.wechat)}" /></label><label>邮箱<input name="email" type="email" value="${value(person?.email)}" /></label></div><label>关系备注<textarea name="note" rows="3" placeholder="影响力、态度、关注点、建联情况">${value(person?.note)}</textarea></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon(person ? "check" : "user-plus")} ${person ? "保存修改" : "保存联系人"}</button></div></form>`);
}

function submitContact(form) {
  const data = new FormData(form); const customer = getCustomer(data.get("customerId")); if (!customer) return;
  const contactId = String(data.get("contactId") || "");
  upsertContact(customer, { id: contactId || uid("o"), pid: data.get("pid") || null, name: String(data.get("name") || "").trim(), role: String(data.get("role") || "").trim(), level: Number(data.get("level") || 2), phone: String(data.get("phone") || "").trim(), phoneType: String(data.get("phoneType") || "unverified"), wechat: String(data.get("wechat") || "").trim(), email: String(data.get("email") || "").trim(), note: String(data.get("note") || "").trim(), photo: customer.orgChain.find(p => p.id === contactId)?.photo || "" });
  persist(); closeModal(); renderApp(); toast(contactId ? "联系人已更新" : "联系人已加入关系图");
}

function openBiddingForm(customerId) {
  const customer = getCustomer(customerId); if (!customer) return;
  showModal(`<div class="modal-head"><div><p class="eyebrow">BIDDING SIGNAL</p><h2 id="modalTitle">添加招投标 / 中标信息</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="bidding"><input type="hidden" name="customerId" value="${safe(customer.id)}" /><label>项目名称<input name="project" required placeholder="例如：XX 平台云资源采购" /></label><div class="form-row"><label>采购方<input name="purchaser" placeholder="项目采购主体" /></label><label>中标角色<div class="modern-select"><select name="role"><option value="">未标注</option><option value="总包">总包</option><option value="分包">分包</option></select>${icon("chevron-down")}</div></label></div><div class="form-row"><label>中标金额<input name="amount" placeholder="例如：320 万元" /></label><label>公告日期<input type="date" name="date" value="${todayStr()}" /></label></div><label>来源链接<input type="url" name="sourceUrl" placeholder="https://" /></label><div class="form-row"><label>来源<div class="modern-select"><select name="source">${selectOptions(INTEL_SOURCES, "")}</select>${icon("chevron-down")}</div></label><label>置信度<div class="modern-select"><select name="confidence">${selectOptions(INTEL_CONFIDENCES, "unverified")}</select>${icon("chevron-down")}</div></label></div><label>核验日期<input type="date" name="verifiedAt" /></label><label>业务信号<textarea name="signal" rows="3" placeholder="仅记录从项目中可确认的投入方向"></textarea></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存信息</button></div></form>`);
}
function submitBidding(form) {
  const data = new FormData(form), customer = getCustomer(data.get("customerId")); if (!customer) return;
  const project = String(data.get("project") || "").trim(); if (!project) return toast("请填写项目名称");
  customer.bidding.push({ id: uid("bid"), project, purchaser: String(data.get("purchaser") || "").trim(), role: String(data.get("role") || "").trim(), amount: String(data.get("amount") || "").trim(), date: String(data.get("date") || ""), source: String(data.get("source") || ""), sourceUrl: String(data.get("sourceUrl") || "").trim(), confidence: String(data.get("confidence") || "unverified"), verifiedAt: String(data.get("verifiedAt") || ""), signal: String(data.get("signal") || "").trim(), capturedAt: nowDateTime() });
  persist(); closeModal(); renderApp(); toast("招投标信息已保存");
}
function removeBidding(customerId, itemId) {
  const customer = getCustomer(customerId); if (!customer) return;
  customer.bidding = customer.bidding.filter(item => item.id !== itemId); persist(); renderApp(); toast("招投标信息已删除");
}
function openQualificationForm(customerId) {
  const customer = getCustomer(customerId); if (!customer) return;
  showModal(`<div class="modal-head"><div><p class="eyebrow">QUALIFICATION</p><h2 id="modalTitle">添加资质或许可</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭弹窗">${icon("x")}</button></div><form class="modal-form" data-form="qualification"><input type="hidden" name="customerId" value="${safe(customer.id)}" /><label>资质名称<input name="name" required placeholder="例如：增值电信业务经营许可证" /></label><div class="form-row"><label>资质类型<input name="type" placeholder="例如：ICP / 等保 / 版号" /></label><label>颁发机构<input name="authority" placeholder="例如：通信管理局" /></label></div><label>有效期至<input type="date" name="validTo" /></label><label>来源链接<input type="url" name="sourceUrl" placeholder="https://" /></label><div class="form-row"><label>来源<div class="modern-select"><select name="source">${selectOptions(INTEL_SOURCES, "")}</select>${icon("chevron-down")}</div></label><label>置信度<div class="modern-select"><select name="confidence">${selectOptions(INTEL_CONFIDENCES, "unverified")}</select>${icon("chevron-down")}</div></label></div><label>核验日期<input type="date" name="verifiedAt" /></label><div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">取消</button><button class="primary-button">${icon("check")} 保存资质</button></div></form>`);
}
function submitQualification(form) {
  const data = new FormData(form), customer = getCustomer(data.get("customerId")); if (!customer) return;
  const name = String(data.get("name") || "").trim(); if (!name) return toast("请填写资质名称");
  customer.qualifications.push({ id: uid("qual"), name, type: String(data.get("type") || "").trim(), authority: String(data.get("authority") || "").trim(), validTo: String(data.get("validTo") || ""), source: String(data.get("source") || ""), sourceUrl: String(data.get("sourceUrl") || "").trim(), confidence: String(data.get("confidence") || "unverified"), verifiedAt: String(data.get("verifiedAt") || ""), capturedAt: nowDateTime() });
  persist(); closeModal(); renderApp(); toast("资质信息已保存");
}
function removeQualification(customerId, itemId) {
  const customer = getCustomer(customerId); if (!customer) return;
  customer.qualifications = customer.qualifications.filter(item => item.id !== itemId); persist(); renderApp(); toast("资质信息已删除");
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
function submitSolution(form) { const data=new FormData(form), customer=getCustomer(data.get("customerId")); if(!customer)return; customer.solution.push({product:String(data.get("product")||"").trim(),reason:String(data.get("reason")||"").trim(),inferred:true}); persist(); closeModal(); renderApp(); toast("方案已保存"); }

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
  const customer = getCustomer(customerId);
  if (!customer || customer.stage === stage || !CRM_STAGES.some(item => item.key === stage)) return;
  const previousStage = customer.stage;
  const previousHistoryLength = customer.stageHistory.length;
  try {
    customer.stage = stage;
    customer.stageHistory.push({ stage, date: nowDateTime(), note: "点击进度条更新阶段" });
    persist();
    renderApp();
    animateStagePenguin(customerId, previousStage, stage);
    toast(`已进入「${stageLabel(stage)}」阶段`);
  } catch (error) {
    customer.stage = previousStage;
    customer.stageHistory.splice(previousHistoryLength);
    renderApp();
    console.warn("Customer stage update failed", error);
    toast("阶段更新失败，请重试");
  }
}

function animateStagePenguin(customerId, fromStage, toStage) {
  const penguin = $(".stage-penguin");
  if (!penguin || penguin.dataset.customer !== customerId) return;
  const from = stageMotion(fromStage);
  const to = stageMotion(toStage);
  penguin.style.setProperty("--penguin-left", `${from.left}%`);
  penguin.style.setProperty("--penguin-top", `${from.top}px`);
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || (from.left === to.left && from.top === to.top)) {
    penguin.style.setProperty("--penguin-left", `${to.left}%`);
    penguin.style.setProperty("--penguin-top", `${to.top}px`);
    return;
  }
  penguin.classList.add("is-moving");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    penguin.style.setProperty("--penguin-left", `${to.left}%`);
    penguin.style.setProperty("--penguin-top", `${to.top}px`);
  }));
  penguin.addEventListener("transitionend", () => penguin.classList.remove("is-moving"), { once: true });
}
function updateCustomerGrade(customerId, grade) { const customer=getCustomer(customerId); if(!customer)return; customer.grade=grade; persist("客户优先级已更新"); renderApp(); }
function updateIntelField(target) {
  const customer = getCustomer(target.dataset.customer); if (!customer) return;
  const key = target.dataset.intelField;
  customer.fields[key] = { ...intelFieldRecord(customer, key), v: target.value.trim() };
  persist(); toast("情报已保存");
}
function updateIntelMeta(target) {
  const customer = getCustomer(target.dataset.customer); if (!customer) return;
  const key = target.dataset.intelFieldKey;
  const meta = target.dataset.intelMeta;
  if (!key || !meta) return;
  customer.fields[key] = { ...intelFieldRecord(customer, key), [meta]: target.value };
  persist(); toast("情报核验信息已保存");
}
function updateAdmittanceField(target) {
  const customer = getCustomer(target.dataset.customer); if (!customer) return;
  customer.admittance = { ...customer.admittance, [target.dataset.admittanceField]: target.value.trim() };
  persist(); renderApp(); toast("准入信息已保存");
}

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
  const reportSource = {
    ...customer,
    opportunityDiagnosis: { ...getOpportunityDiagnosis(customer), note: customer.opportunityDiagnosis.note || "" },
    businessBrief: deriveBusinessBrief(customer),
  };
  return builder.build(reportSource, {
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
function getLatestCompletedTask(customer) { return getTasks(customer).filter(task => task.done).sort((a, b) => String(b.note.completedAt || b.date).localeCompare(String(a.note.completedAt || a.date)))[0] || null; }
function taskPriority(a,b) { if(a.done!==b.done)return a.done?1:-1; const grade={S:0,A:1,B:2,C:3}; if(a.overdue!==b.overdue)return a.overdue?-1:1; if(a.date!==b.date)return String(a.date).localeCompare(String(b.date)); return grade[a.customer.grade]-grade[b.customer.grade]; }
function applyTaskCompletion(customer, noteId, done, completedAt) {
  const note = customer?.notes.find(item => item.id === noteId);
  if (!note) return null;
  note.taskDone = done;
  if (done) note.completedAt = completedAt || nowDateTime();
  else delete note.completedAt;
  return note;
}
function setTaskCompletion(customerId, noteId, done) {
  const customer = getCustomer(customerId);
  const previous = customer?.notes.find(item => item.id === noteId);
  if (!previous) return;
  const previousDone = Boolean(previous.taskDone);
  const previousCompletedAt = previous.completedAt;
  applyTaskCompletion(customer, noteId, done);
  try {
    persist();
    state.taskFocus = { customerId, noteId };
    renderApp();
    toast(done ? "已完成，历史记录已保留" : "已取消完成，待办已恢复");
  } catch (error) {
    applyTaskCompletion(customer, noteId, previousDone, previousCompletedAt);
    console.warn("Task status update failed", error);
    renderApp();
    toast("待办状态更新失败，请重试");
  }
}
function getNotesThisWeek() { const start=new Date(); const day=(start.getDay()+6)%7; start.setDate(start.getDate()-day); start.setHours(0,0,0,0); return customers.flatMap(c=>c.notes).filter(n=>parseDate(n.date)>=start); }
function lastActivityDate(customer) { return [...customer.notes].map(n=>n.date).filter(Boolean).sort().at(-1) || customer.stageHistory?.at(-1)?.date || todayStr(); }
function profileCompleteness(customer) { const fieldCount=FIELD_DEFS.filter(d=>customer.fields[d.key]?.v?.trim()).length; const total=FIELD_DEFS.length+4; const bonus=[customer.notes.length,customer.orgChain.length,customer.painPoints.length,customer.assets.length].filter(Boolean).length; return Math.round((fieldCount+bonus)/total*100); }
function stageMotion(stage) {
  if (stage === "lost") return { left: 75, top: 58 };
  const pipelineStages = CRM_STAGES.filter(item => item.key !== "lost");
  const index = pipelineStages.findIndex(item => item.key === stage);
  return { left: pipelineStages.length <= 1 || index < 0 ? 50 : (index + .5) / pipelineStages.length * 100, top: 2 };
}
function stagePenguinPose(stage) {
  return ({ lead: "search", contact: "wave", meeting: "stand", proposal: "scratch", won: "success", lost: "lost" })[stage] || "stand";
}
function stageLabel(stage) { return CRM_STAGES.find(s=>s.key===stage)?.label || "未设置"; }
function assetTypeLabel(type) { return ASSET_TYPES.find(t=>t.key===type)?.label || "其他附件"; }
function customerColor(index) { return ["#2864dc","#7357d9","#0f9f78","#dc6754","#d28b21"][index%5]; }
function dateDiff(from,to) { const a=parseDate(from),b=parseDate(to); return Math.round((b-a)/86400000); }
function daysSince(date) { const d=parseDate(date); return d ? Math.max(0,Math.floor((new Date()-d)/86400000)) : 0; }
function parseDate(value) { if(!value)return null; const normalized=String(value).replace(" ","T"); const d=new Date(normalized); return Number.isNaN(d.getTime())?null:d; }
function formatShortDate(value) { const d=parseDate(value); if(!d)return "未排期"; return `${d.getMonth()+1}月${d.getDate()}日`; }
function formatDateTime(value) { const d=parseDate(value); if(!d)return safe(value||""); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
function formatLongDate(date) { return `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日 · 星期${"日一二三四五六"[date.getDay()]}`; }
function formatHomeDate(date) { return `${date.getMonth()+1}月${date.getDate()}日 · 星期${"日一二三四五六"[date.getDay()]}`; }
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
function applyTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = next;

  $$("[data-theme-logo]").forEach(logo => {
    const source = next === "dark" ? logo.dataset.darkSrc : logo.dataset.lightSrc;
    if (source) logo.src = source;
  });

  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#101828" : "#f6f7fb");
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
}
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
// Sales Buddy：使用统一画风的透明 PNG，每个客户阶段对应一个明确姿态。
// assets/penguin/{stand,wave,scratch,search,success,lost}.png
// pose: stand(站姿) / wave(招手) / scratch(思考) / search(搜索) / success(庆祝) / lost(哭泣)
// ===================================================================
const PENGUIN_POSES = ["stand", "wave", "scratch", "search", "success", "lost"];
function penguinSVG(pose = "stand") {
  const p = PENGUIN_POSES.includes(pose) ? pose : "stand";
  return `<img class="pg-img" src="assets/penguin/${p}.png" alt="" draggable="false" aria-hidden="true" />`;
}
