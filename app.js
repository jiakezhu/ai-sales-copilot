// ===================================================================
// 腾讯云 · 销售获客工作台 · 主交互
// 核心：跟进记录（结构化）+ 组织架构（树状）+ 手动重点等级 + 多维筛选
// AI 是辅助：抽取信息、参考建议，均可被销售覆盖。
// ===================================================================

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let customers = [];
let current = null;
let filterStage = "all";
let filterGrade = "all";
let searchKw = "";
let ffMethod = "phone";      // 当前跟进表单选的沟通方式
let editingNoteId = null;    // 正在编辑的跟进记录 id
let ffAttachBuf = [];        // 当前跟进表单暂存的附件

// ---------- 初始化 ----------
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  // 先完成 CloudBase 启动（演示模式下瞬间放行；云端模式下会先登录+拉数据）
  try {
    if (typeof CloudAuth !== "undefined" && CloudAuth.boot) {
      await CloudAuth.boot();
    }
  } catch (e) {
    console.warn("[init] CloudAuth.boot failed:", e);
    // boot 失败也不白屏：继续以本地数据渲染
  }
  customers = CRM.load();
  renderGradeFilter();
  renderStageFilter();
  renderList();
  renderTopbarStats();
  renderHero();
  bindGlobal();
});

function bindGlobal() {
  $("#newBtn").addEventListener("click", createCustomer);
  const emptyNew = $("#emptyNewBtn");
  if (emptyNew) emptyNew.addEventListener("click", createCustomer); // 空状态新建按钮已合并到顶栏，存在才绑
  $("#statBtn").addEventListener("click", toggleDashboard);
  $("#themeSwitch").addEventListener("click", toggleTheme);
  $$(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  $("#searchInput").addEventListener("input", e => { searchKw = e.target.value.trim().toLowerCase(); renderList(); });
  bindLightbox();
}

// ---------- 明暗主题 ----------
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "dark";
  document.documentElement.setAttribute("data-theme", saved);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  toast(next === "dark" ? "已切换到深色科技模式" : "已切换到浅色清爽模式");
}

function persist() { CRM.save(customers); renderTopbarStats(); }

// ---------- 全局数据条（顶部）----------
function renderTopbarStats() {
  const el = $("#topbarStats");
  if (!el) return;
  const today = todayStr();
  let todo = 0, overdue = 0;
  customers.forEach(c => (c.notes||[]).forEach(n => { if (n.next && n.nextDate) { todo++; if (n.nextDate < today) overdue++; } }));
  const sCount = customers.filter(c => c.grade === "S").length;
  const active = customers.filter(c => ["contact","meeting","proposal"].includes(c.stage)).length;
  el.innerHTML = `
    <div class="tb-stat"><span class="tb-num">${customers.length}</span><span class="tb-lbl">客户</span></div>
    <div class="tb-stat"><span class="tb-num accent">${active}</span><span class="tb-lbl">跟进中</span></div>
    <div class="tb-stat"><span class="tb-num warn">${todo}</span><span class="tb-lbl">待办</span></div>
    <div class="tb-stat"><span class="tb-num ${overdue?'danger':''}">${overdue}</span><span class="tb-lbl">逾期</span></div>`;
}

// ---------- 空状态：数据概览仪表盘 ----------
function renderHero() {
  const today = todayStr();
  const total = customers.length;
  const won = customers.filter(c => c.stage === "won").length;
  const active = customers.filter(c => ["contact","meeting","proposal"].includes(c.stage)).length;
  let allTodos = [];
  customers.forEach(c => (c.notes||[]).forEach(n => { if (n.next && n.nextDate) allTodos.push({ c, n }); }));
  const overdue = allTodos.filter(t => t.n.nextDate < today).length;

  $("#heroStats").innerHTML = [
    ["客户总数", total, ""],
    ["跟进中", active, "accent"],
    ["待办跟进", allTodos.length, "warn"],
    ["已逾期", overdue, overdue ? "danger" : ""],
    ["已成交", won, "ok"],
  ].map(([lbl, num, cls]) => `
    <div class="hero-stat ${cls}">
      <div class="hs-num">${num}</div>
      <div class="hs-lbl">${lbl}</div>
    </div>`).join("");

  // 待办清单
  allTodos.sort((a, b) => (a.n.nextDate||"").localeCompare(b.n.nextDate||""));
  const near = allTodos.slice(0, 6);
  $("#heroTodoCount").textContent = allTodos.length ? `${allTodos.length} 项` : "";
  $("#heroTodoList").innerHTML = near.length ? near.map(({ c, n }) => {
    const od = n.nextDate < today, td = n.nextDate === today;
    const tag = od ? "逾期" : td ? "今天" : n.nextDate;
    return `<div class="hero-todo-item ${od?'overdue':td?'today':''}" data-id="${c.id}">
      <span class="hti-date">${tag}</span>
      <span class="hti-text">${esc(n.next)}</span>
      <span class="hti-cust">${esc(c.name)}</span>
    </div>`;
  }).join("") : `<div class="hero-empty">暂无待办。进入客户档案记录跟进，填写「下一步 + 提醒日期」，这里会自动汇总。</div>`;
  $$("#heroTodoList .hero-todo-item").forEach(el => el.addEventListener("click", () => selectCustomer(el.dataset.id)));

  // 等级分布
  const maxG = Math.max(1, ...GRADES.map(g => customers.filter(c => c.grade === g.key).length));
  $("#heroGradeDist").innerHTML = GRADES.map(g => {
    const n = customers.filter(c => c.grade === g.key).length;
    return `<div class="hgd-row"><span class="hgd-badge" style="background:${g.color}">${g.key}</span>
      <div class="hgd-bar-wrap"><div class="hgd-bar" style="width:${n/maxG*100}%;background:${g.color}"></div></div>
      <span class="hgd-n">${n}</span></div>`;
  }).join("");

  // 阶段分布
  const maxS = Math.max(1, ...CRM_STAGES.map(s => customers.filter(c => c.stage === s.key).length));
  $("#heroStageDist").innerHTML = CRM_STAGES.map(s => {
    const n = customers.filter(c => c.stage === s.key).length;
    return `<div class="hgd-row"><span class="hgd-slbl">${s.label}</span>
      <div class="hgd-bar-wrap"><div class="hgd-bar" style="width:${n/maxS*100}%;background:${s.color}"></div></div>
      <span class="hgd-n">${n}</span></div>`;
  }).join("");
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 1800);
}

// ===================================================================
// 左侧：多维筛选 + 客户列表
// ===================================================================
function renderGradeFilter() {
  const el = $("#gradeFilter");
  const all = `<button class="gf-btn ${filterGrade==='all'?'active':''}" data-g="all">全部</button>`;
  el.innerHTML = all + GRADES.map(g =>
    `<button class="gf-btn ${filterGrade===g.key?'active':''}" data-g="${g.key}" style="--gc:${g.color}"><b>${g.key}</b></button>`
  ).join("");
  el.querySelectorAll(".gf-btn").forEach(b => b.addEventListener("click", () => {
    filterGrade = b.dataset.g; renderGradeFilter(); renderList();
  }));
}

function renderStageFilter() {
  const el = $("#stageFilter");
  const all = `<button class="sf-btn ${filterStage==='all'?'active':''}" data-s="all">全部</button>`;
  el.innerHTML = all + CRM_STAGES.map(s =>
    `<button class="sf-btn ${filterStage===s.key?'active':''}" data-s="${s.key}" style="--sc:${s.color}">${s.label}</button>`
  ).join("");
  el.querySelectorAll(".sf-btn").forEach(b => b.addEventListener("click", () => {
    filterStage = b.dataset.s; renderStageFilter(); renderList();
  }));
}

function matchFilter(c) {
  if (filterStage !== "all" && c.stage !== filterStage) return false;
  if (filterGrade !== "all" && c.grade !== filterGrade) return false;
  if (searchKw) {
    const hay = (c.name + " " + (c.fields.industry && c.fields.industry.v || "")).toLowerCase();
    if (!hay.includes(searchKw)) return false;
  }
  return true;
}

function renderList() {
  const list = $("#customerList");
  const shown = customers.filter(matchFilter);
  $("#custCount").textContent = shown.length;
  if (!shown.length) {
    list.innerHTML = `<div class="list-empty">没有符合条件的客户</div>`;
    return;
  }
  list.innerHTML = shown.map(c => {
    const st = CRM_STAGES.find(s => s.key === c.stage) || CRM_STAGES[0];
    const gm = gradeMeta(c.grade);
    const nextTodo = getNextTodo(c);
    return `
    <div class="cust-item ${current && current.id===c.id?'active':''}" data-id="${c.id}">
      <div class="ci-avatar" style="background:linear-gradient(135deg, ${c.color}, ${shade(c.color,-18)})">${esc(c.logo || c.name[0])}</div>
      <div class="ci-info">
        <div class="ci-name-row">
          <span class="ci-name">${esc(c.name)}</span>
          <span class="ci-grade" style="background:${gm.color}">${gm.key}</span>
        </div>
        <div class="ci-meta">
          <span class="ci-stage-dot" style="background:${st.color}"></span>${st.label}
          ${c.fields.industry && c.fields.industry.v ? '<span class="ci-sep">·</span>'+esc(c.fields.industry.v) : ""}
        </div>
        ${nextTodo ? `<div class="ci-todo">⏰ ${esc(nextTodo)}</div>` : ""}
      </div>
    </div>`;
  }).join("");
  list.querySelectorAll(".cust-item").forEach(el =>
    el.addEventListener("click", () => selectCustomer(el.dataset.id)));
}

// 颜色加深工具（生成头像渐变）
function shade(hex, pct) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(x=>x+x).join("") : h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.max(0, Math.min(255, r + Math.round(255 * pct / 100)));
  g = Math.max(0, Math.min(255, g + Math.round(255 * pct / 100)));
  b = Math.max(0, Math.min(255, b + Math.round(255 * pct / 100)));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// 取客户最近一条待办（下次跟进）
function getNextTodo(c) {
  const withNext = (c.notes || []).filter(n => n.next && n.nextDate);
  if (!withNext.length) return "";
  withNext.sort((a, b) => (a.nextDate || "").localeCompare(b.nextDate || ""));
  const t = withNext[withNext.length - 1];
  return `${t.nextDate} ${t.next}`;
}

// ===================================================================
// 客户 CRUD
// ===================================================================
const PALETTE = ["#6366f1", "#0ea5a4", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#0052d9", "#14b8a6"];

function createCustomer() {
  const c = {
    id: uid(), name: "新客户", logo: "新",
    color: PALETTE[customers.length % PALETTE.length],
    stage: "lead", grade: "B", aiSuggestScore: 0,
    fields: {}, orgChain: [], painPoints: [], solution: [],
    aiScoreReason: [], funnel: { reached: 0, connected: 0, meeting: 0, proposal: 0, won: 0 },
    notes: [], assets: [],
  };
  FIELD_DEFS.forEach(d => c.fields[d.key] = { v: "" });
  customers.unshift(c);
  persist(); renderList(); selectCustomer(c.id);
  switchTab("profile");
  toast("已新建客户，先设定重点等级并完善情报");
}

function selectCustomer(id) {
  current = customers.find(c => c.id === id);
  if (!current) return;
  renderList();
  $("#emptyState").classList.add("hidden");
  $("#dashboard").classList.add("hidden");
  $("#workspace").classList.remove("hidden");
  editingNoteId = null;
  renderWorkspace();
  switchTab("followup");
}

function deleteCurrent() {
  if (!current) return;
  customers = customers.filter(c => c.id !== current.id);
  persist();
  current = null;
  $("#workspace").classList.add("hidden");
  $("#emptyState").classList.remove("hidden");
  renderList();
  renderHero();
  toast("客户已删除");
}

// ===================================================================
// 工作区渲染
// ===================================================================
function renderWorkspace() {
  const c = current;
  renderAvatar();
  $("#custNameInput").value = c.name;
  $("#custNameInput").oninput = e => {
    c.name = e.target.value || "未命名"; c.logo = c.name[0];
    renderAvatar(); persist(); renderList();
  };
  $("#wsIndustry").textContent = (c.fields.industry && c.fields.industry.v) || "未填行业";
  const st = CRM_STAGES.find(s => s.key === c.stage) || CRM_STAGES[0];
  $("#wsStageMini").innerHTML = `<span class="dot" style="background:${st.color}"></span>${st.label}`;
  renderKeyInfo();
  $("#delBtn").onclick = () => confirmModal(`确定删除「${c.name}」？此操作不可撤销。`, deleteCurrent);
  renderGradeDropdown();
  renderStageBar();
  renderFollowup();
  renderOrgTree();
  renderAssets();
  renderProfile();
  renderScript();
  renderFunnel();
}

function renderAvatar() {
  const c = current;
  const el = $("#custAvatar");
  el.style.background = `linear-gradient(135deg, ${c.color}, ${shade(c.color,-20)})`;
  el.textContent = c.logo || c.name[0];
}

// 名字/头像旁的关键情报 chip：成立时间 / 团队规模 / 融资情况 / 活跃·营收
// 只展示有值的字段；点击任意 chip 跳到「客户情报」Tab 编辑
function renderKeyInfo() {
  const c = current;
  const el = $("#wsKeyInfo");
  if (!el) return;
  const KEY_CHIPS = [
    { key: "founded", icon: "📅", label: "成立" },
    { key: "staff",   icon: "👥", label: "规模" },
    { key: "funding", icon: "💰", label: "融资" },
    { key: "dau",     icon: "📈", label: "活跃" },
    { key: "revenue", icon: "💴", label: "营收" },
  ];
  const chips = KEY_CHIPS
    .map(k => ({ ...k, v: (c.fields[k.key] && c.fields[k.key].v || "").trim() }))
    .filter(k => k.v);
  if (!chips.length) {
    el.innerHTML = `<span class="ws-ki-empty">关键情报未填 · 去「客户情报」补充</span>`;
    el.querySelector(".ws-ki-empty").onclick = () => switchTab("profile");
    return;
  }
  el.innerHTML = chips.map(k =>
    `<span class="ws-ki-chip" data-key="${k.key}" title="${esc(k.label)}：${esc(k.v)}（点击编辑）">
      <span class="ws-ki-ic">${k.icon}</span><span class="ws-ki-v">${esc(k.v)}</span>
    </span>`).join("");
  el.querySelectorAll(".ws-ki-chip").forEach(chip =>
    chip.addEventListener("click", () => switchTab("profile")));
}

// 重点等级下拉（销售手动）
function renderGradeDropdown() {
  const c = current;
  const gm = gradeMeta(c.grade);
  const el = $("#gradeDropdown");
  el.innerHTML = `
    <button class="gd-trigger" id="gdTrigger" style="--gc:${gm.color}">
      <span class="gd-badge" style="background:${gm.color}">${gm.key}</span>
      <span class="gd-text">${esc(gm.label.split("·")[1] ? gm.label.split("·")[1].trim() : gm.label)}</span>
      <span class="gd-arrow">▾</span>
    </button>
    <div class="gd-menu hidden" id="gdMenu">
      ${GRADES.map(g => `<div class="gd-item ${c.grade===g.key?'sel':''}" data-g="${g.key}">
        <span class="gd-badge" style="background:${g.color}">${g.key}</span>
        <div><div class="gd-item-t">${esc(g.label)}</div><div class="gd-item-d">${esc(g.desc)}</div></div>
      </div>`).join("")}
    </div>`;
  const trigger = $("#gdTrigger"), menu = $("#gdMenu");
  trigger.onclick = (e) => { e.stopPropagation(); menu.classList.toggle("hidden"); };
  document.addEventListener("click", () => menu.classList.add("hidden"), { once: true });
  menu.querySelectorAll(".gd-item").forEach(it => it.addEventListener("click", () => {
    c.grade = it.dataset.g; persist(); renderGradeDropdown(); renderList();
    toast(`重点等级已设为 ${gradeMeta(c.grade).label}`);
  }));
}

// 阶段推进条
function renderStageBar() {
  const c = current;
  const el = $("#stageBar");
  const mainStages = CRM_STAGES.filter(s => s.key !== "lost");
  const curIdx = mainStages.findIndex(s => s.key === c.stage);
  el.innerHTML = mainStages.map((s, i) => {
    const done = curIdx >= 0 && i <= curIdx && c.stage !== "lost";
    const isCur = s.key === c.stage;
    return `<button class="sb-step ${done?'done':''} ${isCur?'cur':''}" data-s="${s.key}" style="--sc:${s.color}">
      <span class="sb-dot"></span><span class="sb-lbl">${s.label}</span>
    </button>`;
  }).join("") + `<button class="sb-lost ${c.stage==='lost'?'active':''}" data-s="lost">流失</button>`;
  el.querySelectorAll("[data-s]").forEach(b => b.addEventListener("click", () => {
    c.stage = b.dataset.s; persist(); renderStageBar(); renderList();
    const st = CRM_STAGES.find(s=>s.key===c.stage);
    $("#wsStageMini").innerHTML = `<span class="dot" style="background:${st.color}"></span>${st.label}`;
    toast(`阶段更新为「${st.label}」`);
  }));
}

// ===================================================================
// 模块① 跟进记录（核心）
// ===================================================================
function renderFollowup() {
  const c = current;
  if (!c.notes) c.notes = [];
  renderMethodPicker();
  renderContactOptions();
  bindFollowupForm();
  resetFollowupForm();
  renderTodoBar();
  renderNoteTimeline();
}

// 跟进表单附件缓冲区渲染
function renderFfAttach() {
  const el = $("#ffAttachList");
  if (!el) return;
  el.innerHTML = ffAttachBuf.map((a, i) => a.dataUrl
    ? `<div class="ffa-thumb"><img src="${a.dataUrl}" alt=""><button class="ffa-rm" data-i="${i}">×</button></div>`
    : `<div class="ffa-file"><span>📄 ${esc(a.name)}</span><button class="ffa-rm" data-i="${i}">×</button></div>`
  ).join("");
  el.querySelectorAll(".ffa-rm").forEach(b => b.addEventListener("click", () => {
    ffAttachBuf.splice(+b.dataset.i, 1); renderFfAttach();
  }));
}
function bindFfAttachInput() {
  const inp = $("#ffAttachInput");
  if (!inp || inp._bound) return;
  inp._bound = true;
  inp.addEventListener("change", async e => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const meta = await AssetEngine.readFile(f);
      ffAttachBuf.push({ id: uid("fa"), name: meta.name, dataUrl: meta.dataUrl, isImage: meta.isImage });
    }
    inp.value = "";
    renderFfAttach();
  });
}

function renderMethodPicker() {
  const el = $("#ffMethods");
  el.innerHTML = CONTACT_METHODS.map(m =>
    `<button class="mth-btn ${ffMethod===m.key?'active':''}" data-m="${m.key}" style="--mc:${m.color}">
      <span class="mth-ico">${m.icon}</span>${m.label}
    </button>`).join("");
  el.querySelectorAll(".mth-btn").forEach(b => b.addEventListener("click", () => {
    ffMethod = b.dataset.m; renderMethodPicker(); updatePlaceLabel();
  }));
  updatePlaceLabel();
}

function updatePlaceLabel() {
  const lbl = $("#ffPlaceLabel"), wrap = $("#ffPlaceWrap"), input = $("#ffPlace");
  if (ffMethod === "visit") { lbl.textContent = "拜访地点"; input.placeholder = "如：客户公司 A 座 15 楼会议室"; wrap.classList.remove("hidden"); }
  else if (ffMethod === "meeting") { lbl.textContent = "会议链接 / 房间号"; input.placeholder = "腾讯会议号或链接"; wrap.classList.remove("hidden"); }
  else if (ffMethod === "phone" || ffMethod === "wechat" || ffMethod === "email" || ffMethod === "other") { lbl.textContent = "补充信息（可选）"; input.placeholder = "如：拨打的号码 / 邮件主题"; wrap.classList.remove("hidden"); }
}

function renderContactOptions() {
  const opts = (current.orgChain || []).map(o => `<option value="${esc(o.name)}${o.role?'（'+esc(o.role)+'）':''}">`).join("");
  $("#contactOptions").innerHTML = opts;
}

function bindFollowupForm() {
  $("#saveNoteBtn").onclick = saveNote;
  $("#clearNoteBtn").onclick = resetFollowupForm;
  bindFfAttachInput();
}

function resetFollowupForm() {
  editingNoteId = null;
  ffMethod = "phone";
  ffAttachBuf = [];
  renderMethodPicker();
  $("#ffDate").value = nowDateTimeLocal();
  $("#ffContact").value = "";
  $("#ffPlace").value = "";
  $("#ffContent").value = "";
  $("#ffNext").value = "";
  $("#ffNextDate").value = "";
  $("#ffEditing").classList.add("hidden");
  $("#saveNoteBtn").textContent = "保存跟进";
  renderFfAttach();
}

function nowDateTimeLocal() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function saveNote() {
  const c = current;
  const dateRaw = $("#ffDate").value;
  const content = $("#ffContent").value.trim();
  if (!content) { toast("请填写沟通内容"); $("#ffContent").focus(); return; }
  const date = dateRaw ? dateRaw.replace("T", " ") : nowDateTime();
  const rec = {
    id: editingNoteId || uid("n"),
    method: ffMethod,
    date,
    contact: $("#ffContact").value.trim(),
    place: $("#ffPlace").value.trim(),
    content,
    next: $("#ffNext").value.trim(),
    nextDate: $("#ffNextDate").value || "",
    attachments: ffAttachBuf.slice(),
  };
  if (editingNoteId) {
    const idx = c.notes.findIndex(n => n.id === editingNoteId);
    if (idx >= 0) c.notes[idx] = rec;
    toast("跟进记录已更新");
  } else {
    c.notes.push(rec);
    toast("跟进记录已保存");
  }
  persist();
  resetFollowupForm();
  renderTodoBar();
  renderNoteTimeline();
  renderList();
}

function editNote(id) {
  const n = current.notes.find(x => x.id === id);
  if (!n) return;
  editingNoteId = id;
  ffMethod = n.method || "phone";
  ffAttachBuf = (n.attachments || []).slice();
  renderMethodPicker();
  renderFfAttach();
  $("#ffDate").value = (n.date || "").replace(" ", "T").slice(0, 16) || nowDateTimeLocal();
  $("#ffContact").value = n.contact || "";
  $("#ffPlace").value = n.place || "";
  $("#ffContent").value = n.content || "";
  $("#ffNext").value = n.next || "";
  $("#ffNextDate").value = n.nextDate || "";
  $("#ffEditing").classList.remove("hidden");
  $("#saveNoteBtn").textContent = "更新跟进";
  $(".followup-form-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
  switchTab("followup");
}

function delNote(id) {
  current.notes = current.notes.filter(n => n.id !== id);
  persist(); renderTodoBar(); renderNoteTimeline(); renderList();
  toast("已删除该条跟进");
}

// 待办提醒条：汇总所有"下次跟进"
function renderTodoBar() {
  const c = current;
  const todos = (c.notes || []).filter(n => n.next && n.nextDate)
    .sort((a, b) => (a.nextDate || "").localeCompare(b.nextDate || ""));
  const el = $("#todoBar");
  if (!todos.length) {
    el.innerHTML = `<div class="todo-empty">暂无待办。记录跟进时填写「下一步 + 提醒日期」，这里会汇总你的待办清单。</div>`;
    return;
  }
  const today = todayStr();
  el.innerHTML = `<div class="todo-title">📌 待办跟进</div>` + todos.map(t => {
    const overdue = t.nextDate < today;
    const isToday = t.nextDate === today;
    const cls = overdue ? "overdue" : isToday ? "today" : "";
    const tag = overdue ? "已逾期" : isToday ? "今天" : t.nextDate;
    return `<div class="todo-item ${cls}">
      <span class="todo-date">${tag}</span>
      <span class="todo-text">${esc(t.next)}</span>
      ${t.contact ? `<span class="todo-contact">@${esc(t.contact)}</span>` : ""}
      <button class="todo-done" data-id="${t.id}" title="完成，清除提醒">✓</button>
    </div>`;
  }).join("");
  el.querySelectorAll(".todo-done").forEach(b => b.addEventListener("click", () => {
    const n = c.notes.find(x => x.id === b.dataset.id);
    if (n) { n.next = ""; n.nextDate = ""; persist(); renderTodoBar(); renderNoteTimeline(); renderList(); toast("已标记完成"); }
  }));
}

function renderNoteTimeline() {
  const c = current;
  $("#noteTotal").textContent = c.notes.length ? `共 ${c.notes.length} 次` : "";
  const el = $("#noteTimeline");
  if (!c.notes.length) {
    el.innerHTML = `<div class="tl-empty">还没有跟进记录。<br>每次和客户沟通后记一笔，形成完整的客户档案。</div>`;
    return;
  }
  const sorted = c.notes.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  el.innerHTML = sorted.map(n => {
    const m = methodMeta(n.method);
    return `<div class="ntl-item">
      <div class="ntl-icon" style="background:${m.color}">${m.icon}</div>
      <div class="ntl-body">
        <div class="ntl-top">
          <span class="ntl-method" style="color:${m.color}">${m.label}</span>
          ${n.contact ? `<span class="ntl-contact">${esc(n.contact)}</span>` : ""}
          <span class="ntl-date">${esc(n.date)}</span>
          <span class="ntl-ops">
            <button class="ntl-edit" data-id="${n.id}">编辑</button>
            <button class="ntl-del" data-id="${n.id}">删除</button>
          </span>
        </div>
        ${n.place ? `<div class="ntl-place">📍 ${esc(n.place)}</div>` : ""}
        <div class="ntl-content">${esc(n.content)}</div>
        ${(n.attachments && n.attachments.length) ? `<div class="ntl-attach">${n.attachments.map(a => a.dataUrl
          ? `<img class="ntl-att-img" src="${a.dataUrl}" data-src="${a.dataUrl}" alt="">`
          : `<span class="ntl-att-file">📄 ${esc(a.name)}</span>`).join("")}</div>` : ""}
        ${n.next ? `<div class="ntl-next"><span class="ntl-next-tag">下一步</span>${esc(n.next)}${n.nextDate?`<span class="ntl-next-date">📅 ${esc(n.nextDate)}</span>`:""}</div>` : ""}
      </div>
    </div>`;
  }).join("");
  el.querySelectorAll(".ntl-edit").forEach(b => b.addEventListener("click", () => editNote(b.dataset.id)));
  el.querySelectorAll(".ntl-del").forEach(b => b.addEventListener("click", () => confirmModal("删除这条跟进记录？", () => delNote(b.dataset.id))));
  el.querySelectorAll(".ntl-att-img").forEach(img => img.addEventListener("click", () => openLightbox(img.dataset.src)));
}

// ===================================================================
// 模块② 组织架构树（销售自建 + 联系方式）
// ===================================================================
function renderOrgTree() {
  const c = current;
  if (!c.orgChain) c.orgChain = [];
  const el = $("#orgTree");
  $("#addRootBtn").onclick = () => {
    c.orgChain.push({ id: uid("o"), pid: null, name: "姓名", role: "职位", level: 1, phone: "", wechat: "", email: "", note: "", photo: "" });
    persist(); renderOrgTree(); renderContactOptions();
  };
  if (!c.orgChain.length) {
    el.innerHTML = `<div class="org-empty">还没有组织架构。点上方「添加高层」开始搭建对方的决策关系图，把关键人的联系方式也记下来。</div>`;
    return;
  }
  const roots = c.orgChain.filter(n => !n.pid || !c.orgChain.find(p => p.id === n.pid));
  el.innerHTML = `<div class="org-tree-inner">${roots.map(r => renderOrgNode(r, c.orgChain)).join("")}</div>`;
  bindOrgNodes();
}

function renderOrgNode(node, all) {
  const children = all.filter(n => n.pid === node.id);
  const levelColor = node.level === 1 ? "#e34d59" : node.level === 2 ? "#0052d9" : "#0d9488";
  const contacts = [];
  if (node.phone)  contacts.push(`<span class="oc-item">☎ ${esc(node.phone)}</span>`);
  if (node.wechat) contacts.push(`<span class="oc-item">💬 ${esc(node.wechat)}</span>`);
  if (node.email)  contacts.push(`<span class="oc-item">✉ ${esc(node.email)}</span>`);
  return `<div class="org-branch">
    <div class="org-card" data-id="${node.id}" style="--lc:${levelColor}">
      <div class="org-card-head">
        <div class="org-avatar ${node.photo?'has-photo':''}" data-photo-id="${node.id}" style="background:${levelColor}" title="点击上传/更换照片">
          ${node.photo ? `<img src="${node.photo}" alt="">` : esc((node.name||"?")[0])}
          <span class="org-avatar-cam">📷</span>
        </div>
        <div class="org-card-main">
          <div class="org-name">${esc(node.name||"未命名")}</div>
          <div class="org-role">${esc(node.role||"职位未填")}</div>
        </div>
        <div class="org-card-ops">
          <button class="org-edit" data-id="${node.id}" title="编辑">✎</button>
          <button class="org-del" data-id="${node.id}" title="删除">×</button>
        </div>
      </div>
      ${contacts.length ? `<div class="org-contacts">${contacts.join("")}</div>` : ""}
      ${node.note ? `<div class="org-note">${esc(node.note)}</div>` : ""}
      <button class="org-add-child" data-id="${node.id}">＋ 下属</button>
    </div>
    ${children.length ? `<div class="org-children">${children.map(ch => renderOrgNode(ch, all)).join("")}</div>` : ""}
  </div>`;
}

function bindOrgNodes() {
  const c = current;
  $$("#orgTree .org-add-child").forEach(b => b.addEventListener("click", () => {
    const pid = b.dataset.id;
    const parent = c.orgChain.find(n => n.id === pid);
    const lv = parent ? Math.min(3, (parent.level || 1) + 1) : 2;
    c.orgChain.push({ id: uid("o"), pid, name: "姓名", role: "职位", level: lv, phone: "", wechat: "", email: "", note: "", photo: "" });
    persist(); renderOrgTree(); renderContactOptions();
  }));
  $$("#orgTree .org-del").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.id;
    // 删除节点及其所有下属
    const toDel = new Set([id]);
    let changed = true;
    while (changed) { changed = false; c.orgChain.forEach(n => { if (n.pid && toDel.has(n.pid) && !toDel.has(n.id)) { toDel.add(n.id); changed = true; } }); }
    confirmModal("删除该联系人及其所有下属节点？", () => {
      c.orgChain = c.orgChain.filter(n => !toDel.has(n.id));
      persist(); renderOrgTree(); renderContactOptions(); toast("已删除");
    });
  }));
  $$("#orgTree .org-edit").forEach(b => b.addEventListener("click", () => openOrgEdit(b.dataset.id)));
  // 头像点击上传照片
  $$("#orgTree .org-avatar[data-photo-id]").forEach(av => av.addEventListener("click", () => {
    const id = av.dataset.photoId;
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const meta = await AssetEngine.readFile(f);
      const node = c.orgChain.find(n => n.id === id);
      if (node) {
        node.photo = meta.dataUrl;
        // 同步进资料库，标为人员照片并关联
        if (!c.assets) c.assets = [];
        c.assets.push(AssetEngine.makeAsset("photo", meta, { linkedNodeId: id, caption: `${node.name||""} ${node.role||""}`.trim() }));
        persist(); renderOrgTree(); toast("照片已上传并关联到该联系人");
      }
    };
    inp.click();
  }));
}

function openOrgEdit(id) {
  const c = current;
  const n = c.orgChain.find(x => x.id === id);
  if (!n) return;
  const m = $("#modal");
  m.classList.remove("hidden");
  $("#modalBox").innerHTML = `
    <div class="modal-title">编辑联系人</div>
    <div class="org-form">
      <div class="of-photo-row">
        <div class="of-photo" id="ofPhoto">${n.photo?`<img src="${n.photo}">`:esc((n.name||'?')[0])}</div>
        <label class="of-photo-btn"><input type="file" id="ofPhotoInput" accept="image/*" hidden />上传照片</label>
        ${n.photo?`<button class="of-photo-rm" id="ofPhotoRm">移除</button>`:""}
      </div>
      <div class="of-row">
        <div class="of-field"><label>姓名</label><input id="ofName" value="${esc(n.name)}" /></div>
        <div class="of-field"><label>职位</label><input id="ofRole" value="${esc(n.role)}" /></div>
      </div>
      <div class="of-field"><label>层级</label>
        <select id="ofLevel">${ORG_LEVELS.map(l=>`<option value="${l.level}" ${n.level===l.level?'selected':''}>${l.label}</option>`).join("")}</select>
      </div>
      <div class="of-row">
        <div class="of-field"><label>电话</label><input id="ofPhone" value="${esc(n.phone)}" placeholder="手机 / 座机" /></div>
        <div class="of-field"><label>微信</label><input id="ofWechat" value="${esc(n.wechat)}" placeholder="微信号" /></div>
      </div>
      <div class="of-field"><label>邮箱</label><input id="ofEmail" value="${esc(n.email)}" placeholder="邮箱地址" /></div>
      <div class="of-field"><label>备注（态度/影响力/关注点）</label><textarea id="ofNote">${esc(n.note)}</textarea></div>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" id="ofCancel">取消</button>
      <button class="btn-primary" id="ofSave">保存</button>
    </div>`;
  const close = () => m.classList.add("hidden");
  $("#ofCancel").onclick = close;
  $(".modal-mask").onclick = close;
  let pendingPhoto = n.photo || "";
  $("#ofPhotoInput").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const meta = await AssetEngine.readFile(f);
    pendingPhoto = meta.dataUrl;
    $("#ofPhoto").innerHTML = `<img src="${meta.dataUrl}">`;
    // 存进资料库
    if (!c.assets) c.assets = [];
    c.assets.push(AssetEngine.makeAsset("photo", meta, { linkedNodeId: n.id, caption: `${n.name||""} ${n.role||""}`.trim() }));
  };
  if ($("#ofPhotoRm")) $("#ofPhotoRm").onclick = () => { pendingPhoto = ""; $("#ofPhoto").innerHTML = esc((n.name||"?")[0]); };
  $("#ofSave").onclick = () => {
    n.photo = pendingPhoto;
    n.name = $("#ofName").value.trim() || "未命名";
    n.role = $("#ofRole").value.trim();
    n.level = parseInt($("#ofLevel").value) || 2;
    n.phone = $("#ofPhone").value.trim();
    n.wechat = $("#ofWechat").value.trim();
    n.email = $("#ofEmail").value.trim();
    n.note = $("#ofNote").value.trim();
    persist(); close(); renderOrgTree(); renderContactOptions(); renderScript(); toast("联系人已保存");
  };
}

// ===================================================================
// 模块③ 资料库（名片 / 聊天记录 / 人员照片 / 附件）
// ===================================================================
let assetFilter = "all";

function renderAssets() {
  const c = current;
  if (!c.assets) c.assets = [];
  renderAssetUploaders();
  bindDropzone();
  const mb = $("#addMeetingBtn");
  if (mb) mb.onclick = () => openMeetingModal();
  renderAssetGallery();
}

// 顶部分类上传按钮
function renderAssetUploaders() {
  const el = $("#assetUploaders");
  // 会议纪要走独立录入入口（文本），不在这里出图片上传按钮
  el.innerHTML = ASSET_TYPES.filter(t => t.key !== "meeting").map(t =>
    `<label class="asset-up-btn" title="${t.desc}">
      <input type="file" class="asset-up-input" data-type="${t.key}" accept="image/*" ${t.key==='file'?'':'multiple'} hidden />
      <span class="aub-ico">${t.icon}</span><span class="aub-lbl">上传${t.label}</span>
    </label>`).join("");
  el.querySelectorAll(".asset-up-input").forEach(inp => inp.addEventListener("change", async e => {
    await handleAssetFiles(Array.from(e.target.files || []), inp.dataset.type);
    inp.value = "";
  }));
}

// 拖拽上传
function bindDropzone() {
  const dz = $("#dropzone"), inp = $("#dropInput");
  dz.onclick = () => inp.click();
  inp.onchange = async e => { await handleAssetFiles(Array.from(e.target.files || []), "chat"); inp.value = ""; };
  ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("dragover"); }));
  dz.addEventListener("drop", async e => {
    const files = Array.from(e.dataTransfer.files || []);
    await handleAssetFiles(files, "chat");
  });
}

async function handleAssetFiles(files, type) {
  if (!files.length) return;
  const c = current;
  if (!c.assets) c.assets = [];
  toast(`正在处理 ${files.length} 个文件…`);
  for (const f of files) {
    const meta = await AssetEngine.readFile(f);
    // 智能猜测类型：文件名含"名片/card"归名片
    let t = type;
    if (/名片|card/i.test(f.name)) t = "card";
    c.assets.push(AssetEngine.makeAsset(t, meta));
  }
  persist();
  renderAssetGallery();
  toast(`已添加 ${files.length} 个素材`);
}

// 缩略图墙
function renderAssetGallery() {
  const c = current;
  const el = $("#assetsGallery");
  const list = (c.assets || []).filter(a => assetFilter === "all" || a.type === assetFilter);

  // 分类筛选条
  const counts = {};
  (c.assets||[]).forEach(a => counts[a.type] = (counts[a.type]||0) + 1);
  const filterBar = `<div class="asset-filter">
    <button class="afl-btn ${assetFilter==='all'?'active':''}" data-t="all">全部 <b>${(c.assets||[]).length}</b></button>
    ${ASSET_TYPES.map(t => `<button class="afl-btn ${assetFilter===t.key?'active':''}" data-t="${t.key}">${t.icon} ${t.label} <b>${counts[t.key]||0}</b></button>`).join("")}
  </div>`;

  if (!(c.assets||[]).length) {
    el.innerHTML = filterBar + `<div class="asset-empty glass-card">
      <div class="ae-ico">🗂️</div>
      <div class="ae-t">还没有上传任何资料</div>
      <div class="ae-d">名片、微信/沟通截图、关键联系人照片、合同报价——把真实素材沉淀在这里，让客户档案有据可依。</div>
    </div>`;
    bindAssetFilter();
    return;
  }

  // 会议纪要为文本卡，单独渲染（区别于图片卡）
  const meetingCards = list.filter(a => a.type === "meeting").map(a => {
    const txt = (a.text || "").trim();
    const preview = txt.length > 140 ? esc(txt.slice(0, 140)) + "…" : esc(txt) || '<span class="mn-notext">（未录入纪要正文）</span>';
    return `<div class="meeting-card glass-card" data-id="${a.id}">
      <div class="mn-head">
        <div class="mn-title">📝 ${esc(a.name || "会议纪要")}</div>
        <div class="ac-ops">
          <button class="ac-op mn-extract" data-id="${a.id}" title="AI 提取要点填入情报">AI 提取要点</button>
          <button class="ac-op mn-view" data-id="${a.id}" title="查看/编辑全文">全文</button>
          <button class="ac-op ac-del" data-id="${a.id}" title="删除">×</button>
        </div>
      </div>
      <div class="mn-meta">
        ${a.meetingDate ? `<span class="mn-tag">🗓 ${esc(a.meetingDate)}</span>` : ""}
        ${a.attendees ? `<span class="mn-tag">👥 ${esc(a.attendees)}</span>` : ""}
        <span class="mn-tag mn-time">录于 ${esc(a.createdAt)}</span>
      </div>
      <div class="mn-preview">${preview}</div>
    </div>`;
  }).join("");

  const cards = list.filter(a => a.type !== "meeting").map(a => {
    const t = ASSET_TYPES.find(x => x.key === a.type) || ASSET_TYPES[ASSET_TYPES.length - 1];
    const linked = a.linkedNodeId ? (c.orgChain||[]).find(n => n.id === a.linkedNodeId) : null;
    const thumb = a.dataUrl
      ? `<div class="ac-thumb" data-src="${a.dataUrl}"><img src="${a.dataUrl}" alt=""><span class="ac-zoom">🔍</span></div>`
      : `<div class="ac-thumb ac-file"><span>📄</span><div class="ac-fname">${esc(a.name)}</div></div>`;
    return `<div class="asset-card glass-card" data-id="${a.id}">
      ${thumb}
      <div class="ac-body">
        <div class="ac-top">
          <span class="ac-type">${t.icon} ${t.label}</span>
          <div class="ac-ops">
            ${a.type==='card' ? `<button class="ac-op ac-recog" data-id="${a.id}" title="尝试识别">识别</button>` : ""}
            <button class="ac-op ac-link" data-id="${a.id}" title="关联联系人">关联</button>
            <button class="ac-op ac-del" data-id="${a.id}" title="删除">×</button>
          </div>
        </div>
        <input class="ac-caption" data-id="${a.id}" value="${esc(a.caption)}" placeholder="加一句关键信息标注…" />
        ${linked ? `<div class="ac-linked">👤 关联：${esc(linked.name)}${linked.role?'（'+esc(linked.role)+'）':''}</div>` : ""}
        <div class="ac-time">${esc(a.createdAt)}</div>
      </div>
    </div>`;
  }).join("");
  const meetingBlock = meetingCards ? `<div class="meeting-list">${meetingCards}</div>` : "";
  const imgBlock = cards ? `<div class="gallery-grid">${cards}</div>` : "";
  el.innerHTML = filterBar + meetingBlock + imgBlock;
  bindAssetFilter();
  bindAssetCards();
}

function bindAssetFilter() {
  $$("#assetsGallery .afl-btn").forEach(b => b.addEventListener("click", () => { assetFilter = b.dataset.t; renderAssetGallery(); }));
}

function bindAssetCards() {
  const c = current;
  $$("#assetsGallery .ac-thumb[data-src]").forEach(t => t.addEventListener("click", () => openLightbox(t.dataset.src)));
  $$("#assetsGallery .ac-caption").forEach(inp => inp.addEventListener("blur", () => {
    const a = c.assets.find(x => x.id === inp.dataset.id); if (a) { a.caption = inp.value.trim(); persist(); }
  }));
  $$("#assetsGallery .ac-del").forEach(b => b.addEventListener("click", () => confirmModal("删除这个素材？", () => {
    c.assets = c.assets.filter(a => a.id !== b.dataset.id); persist(); renderAssetGallery(); renderOrgTree(); toast("已删除");
  })));
  $$("#assetsGallery .ac-link").forEach(b => b.addEventListener("click", () => openLinkPicker(b.dataset.id)));
  $$("#assetsGallery .ac-recog").forEach(b => b.addEventListener("click", () => recognizeCard(b.dataset.id)));
  $$("#assetsGallery .mn-view").forEach(b => b.addEventListener("click", () => openMeetingModal(b.dataset.id)));
  $$("#assetsGallery .mn-extract").forEach(b => b.addEventListener("click", () => openMeetingExtract(b.dataset.id)));
}

// 关联联系人
function openLinkPicker(assetId) {
  const c = current;
  const a = c.assets.find(x => x.id === assetId); if (!a) return;
  if (!(c.orgChain||[]).length) { toast("请先在「组织架构」里添加联系人"); return; }
  const m = $("#modal"); m.classList.remove("hidden");
  $("#modalBox").innerHTML = `
    <div class="modal-title">关联到联系人</div>
    <div class="link-list">
      ${c.orgChain.map(n => `<div class="link-item ${a.linkedNodeId===n.id?'sel':''}" data-id="${n.id}">
        <div class="li-av" style="background:${n.level===1?'#e34d59':n.level===2?'#0052d9':'#0d9488'}">${n.photo?`<img src="${n.photo}">`:esc((n.name||'?')[0])}</div>
        <div><div class="li-name">${esc(n.name)}</div><div class="li-role">${esc(n.role||'')}</div></div>
      </div>`).join("")}
    </div>
    <div class="modal-actions"><button class="btn-ghost" id="lkCancel">取消</button><button class="btn-ghost sm" id="lkClear">清除关联</button></div>`;
  const close = () => m.classList.add("hidden");
  $("#lkCancel").onclick = close; $(".modal-mask").onclick = close;
  $("#lkClear").onclick = () => { a.linkedNodeId = ""; persist(); close(); renderAssetGallery(); };
  $$("#modalBox .link-item").forEach(it => it.addEventListener("click", () => {
    a.linkedNodeId = it.dataset.id;
    // 若是人员照片，顺便设为该联系人头像
    if (a.type === "photo" && a.dataUrl) { const n = c.orgChain.find(x => x.id === it.dataset.id); if (n) n.photo = a.dataUrl; }
    persist(); close(); renderAssetGallery(); renderOrgTree(); toast("已关联");
  }));
}

// ========== 会议纪要：录入 / 编辑 ==========
function openMeetingModal(assetId) {
  const c = current;
  const a = assetId ? c.assets.find(x => x.id === assetId) : null;
  const isEdit = !!a;
  const m = $("#modal"); m.classList.remove("hidden");
  $("#modalBox").innerHTML = `
    <div class="modal-title">${isEdit ? "查看 / 编辑会议纪要" : "添加会议纪要"}</div>
    <div class="mn-form">
      <div class="mn-form-row">
        <div class="of-field"><label>纪要标题</label><input id="mnName" value="${esc((a&&a.name)||'')}" placeholder="如：与星澜互娱 CTO 技术选型会" /></div>
      </div>
      <div class="mn-form-row two">
        <div class="of-field"><label>会议日期</label><input type="date" id="mnDate" value="${esc((a&&a.meetingDate)||'')}" /></div>
        <div class="of-field"><label>参会人（可选）</label><input id="mnAttendees" value="${esc((a&&a.attendees)||'')}" placeholder="如：我方2人；对方 李阔(CTO)、王工" /></div>
      </div>
      <div class="of-field">
        <label>纪要正文</label>
        <textarea id="mnText" class="mn-textarea" placeholder="把这次会议聊了什么写清楚：客户关注点、异议、达成的决策、下一步计划……写得越具体，AI 越能帮你提取要点填进情报。">${esc((a&&a.text)||'')}</textarea>
      </div>
      <div class="mn-upload">
        <label class="mn-upload-btn">
          <input type="file" id="mnFileInput" accept="image/*,application/pdf,.doc,.docx,.txt" hidden />
          📎 上传纪要文件（Word/PDF/图片/截图）
        </label>
        <span class="mn-upload-hint" id="mnFileHint">纯前端演示环境无法自动解析文件文字，请把正文粘贴到上方文本框</span>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" id="mnCancel">取消</button>
      ${isEdit ? `<button class="btn-primary sm" id="mnExtractNow">保存并 AI 提取要点</button>` : ""}
      <button class="btn-primary" id="mnSave">${isEdit ? "保存修改" : "保存纪要"}</button>
    </div>`;
  const close = () => m.classList.add("hidden");
  $("#mnCancel").onclick = close; $(".modal-mask").onclick = close;

  // 文件上传：诚实兜底（无法解析正文，提示手动粘贴；图片则作为附图存进纪要预览）
  $("#mnFileInput").onchange = async e => {
    const f = (e.target.files || [])[0]; if (!f) return;
    const hint = $("#mnFileHint");
    if (/^image\//.test(f.type)) {
      hint.innerHTML = `已选择图片「${esc(f.name)}」。<b>纯前端演示无法 OCR 识别图片文字</b>，请对照图片把关键内容手动填入上方正文。`;
    } else {
      hint.innerHTML = `已选择「${esc(f.name)}」。<b>纯前端演示无法解析 ${/pdf/i.test(f.type)?'PDF':'该文件'}文字</b>，请把正文粘贴到上方文本框（这是诚实原则：解析不了就不假装能）。`;
    }
    if (!$("#mnName").value.trim()) $("#mnName").value = f.name.replace(/\.[^.]+$/, "");
  };

  const collect = () => ({
    name: $("#mnName").value.trim() || "会议纪要",
    meetingDate: $("#mnDate").value,
    attendees: $("#mnAttendees").value.trim(),
    text: $("#mnText").value.trim(),
  });
  const doSave = () => {
    const data = collect();
    if (!data.text && !isEdit) { toast("请先填写纪要正文"); return null; }
    if (isEdit) {
      Object.assign(a, data);
    } else {
      c.assets = c.assets || [];
      c.assets.push(AssetEngine.makeAsset("meeting", { name: data.name },
        { text: data.text, meetingDate: data.meetingDate, attendees: data.attendees }));
    }
    persist(); renderAssetGallery();
    return isEdit ? a : c.assets[c.assets.length - 1];
  };

  $("#mnSave").onclick = () => { if (doSave()) { close(); toast(isEdit ? "已保存" : "纪要已保存"); } };
  const extractNow = $("#mnExtractNow");
  if (extractNow) extractNow.onclick = () => { const saved = doSave(); if (saved) { close(); openMeetingExtract(saved.id); } };
}

// ========== 会议纪要：AI 提取要点 → 逐条采纳填入情报（复用 extract 诚实范式）==========
function openMeetingExtract(assetId) {
  const c = current;
  const a = c.assets.find(x => x.id === assetId); if (!a) return;
  const m = $("#modal"); m.classList.remove("hidden");
  $("#modalBox").innerHTML = `
    <div class="modal-title">AI 提取会议纪要要点</div>
    <div class="mn-src">📝 ${esc(a.name || "会议纪要")}${a.meetingDate?`　🗓 ${esc(a.meetingDate)}`:""}</div>
    <div class="mn-extract-box" id="mnExtractBox">
      <div class="ai-thinking"><span class="mini-spin"></span>AI 正在从纪要中提取可填入情报的字段与要点…</div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" id="mnExClose">关闭</button></div>`;
  const close = () => m.classList.add("hidden");
  $("#mnExClose").onclick = close; $(".modal-mask").onclick = close;

  const txt = (a.text || "").trim();
  setTimeout(() => {
    const box = $("#mnExtractBox");
    if (!txt) {
      box.innerHTML = `<div class="ai-honest"><div class="honest-icon">!</div><div><div class="honest-t">这条纪要没有正文</div><div class="honest-c">先点「全文」补上会议内容，AI 才能提取要点。</div></div></div>`;
      return;
    }
    const { found, points } = AIEngine.extractMeeting(txt);
    const fieldKeys = Object.keys(found);
    const pointGroups = [
      { key: "nextSteps", label: "下一步 / 待办", icon: "✅" },
      { key: "decisions", label: "关键决策", icon: "📌" },
      { key: "concerns",  label: "客户关注 / 异议", icon: "⚠️" },
      { key: "relation",  label: "关系进展", icon: "🤝" },
    ].filter(g => (points[g.key] || []).length);

    if (!fieldKeys.length && !pointGroups.length) {
      box.innerHTML = `<div class="ai-honest">
        <div class="honest-icon">!</div>
        <div>
          <div class="honest-t">AI 诚实反馈：未能可靠提取到结构化要点</div>
          <div class="honest-c">纪要里没有出现明确的融资/规模/上云/下一步/决策等关键词。建议把内容写得更具体，或直接在「客户情报」表格里手动补充。</div>
          <div class="honest-tip"><b>绝不编造</b>：AI 只提取纪要里真实写到的内容，抽不到就如实说，不脑补。</div>
        </div>
      </div>`;
      return;
    }

    const fieldBlock = fieldKeys.length ? `
      <div class="mn-ex-sec">
        <div class="mn-ex-sec-t">🗂 可填入情报字段（${fieldKeys.length}）</div>
        <div class="extract-list">
          ${fieldKeys.map(k => {
            const def = FIELD_DEFS.find(d => d.key === k) || { label: k };
            return `<div class="ex-item" data-k="${k}">
              <div class="ex-field">${def.label}</div>
              <div class="ex-val" contenteditable="true">${esc(found[k])}</div>
              <button class="ex-adopt" data-k="${k}">采纳</button>
            </div>`;
          }).join("")}
        </div>
      </div>` : "";

    const pointsBlock = pointGroups.length ? `
      <div class="mn-ex-sec">
        <div class="mn-ex-sec-t">📋 会议要点（仅供参考，不自动填表）</div>
        ${pointGroups.map(g => `
          <div class="mn-pt-group">
            <div class="mn-pt-t">${g.icon} ${g.label}</div>
            <ul class="mn-pt-list">${(points[g.key]||[]).map(s => `<li>${esc(s)}</li>`).join("")}</ul>
          </div>`).join("")}
      </div>` : "";

    box.innerHTML = `
      <div class="mn-ex-lead">AI 从纪要中提取到以下内容，情报字段可逐条确认后填入（要点仅供参考）：</div>
      ${fieldBlock}
      ${pointsBlock}
      ${fieldKeys.length ? `<div class="extract-foot"><button class="btn-primary sm" id="mnAdoptAll">全部采纳字段</button><span class="extract-note">采纳后填入「客户情报」表，仍可编辑</span></div>` : ""}`;

    box.querySelectorAll(".ex-adopt").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.k;
      const v = box.querySelector(`.ex-item[data-k="${k}"] .ex-val`).textContent.trim();
      adoptField(k, v); b.textContent = "已采纳 ✓"; b.disabled = true;
    }));
    const adoptAll = $("#mnAdoptAll");
    if (adoptAll) adoptAll.addEventListener("click", () => {
      box.querySelectorAll(".ex-item").forEach(it => adoptField(it.dataset.k, it.querySelector(".ex-val").textContent.trim()));
      toast("已填入客户情报表");
    });
  }, 900);
}

// 名片识别（诚实兜底）
function recognizeCard(assetId) {
  const c = current;
  const a = c.assets.find(x => x.id === assetId); if (!a) return;
  const m = $("#modal"); m.classList.remove("hidden");
  $("#modalBox").innerHTML = `
    <div class="modal-title">名片识别</div>
    <div class="recog-thumb">${a.dataUrl?`<img src="${a.dataUrl}">`:'📄'}</div>
    <div class="recog-status"><span class="mini-spin"></span>正在尝试识别名片信息…</div>`;
  CRM.recognizeCard ? null : 0;
  AIEngine.recognizeCard(a).then(res => {
    if (res.ok && Object.keys(res.fields).length) {
      // 真识别到（当前环境不会走到）
      renderRecogForm(a, res.fields);
    } else {
      // 诚实兜底：给一个空表单让销售手填
      renderRecogForm(a, {}, res.message);
    }
  });
}

function renderRecogForm(asset, fields, honestMsg) {
  const box = $("#modalBox");
  box.innerHTML = `
    <div class="modal-title">名片信息确认</div>
    <div class="recog-row">
      <div class="recog-thumb sm">${asset.dataUrl?`<img src="${asset.dataUrl}">`:'📄'}</div>
      <div class="recog-hint">
        ${honestMsg ? `<div class="ai-honest inline"><div class="honest-icon">!</div><div><div class="honest-t">AI 诚实反馈</div><div class="honest-c">${esc(honestMsg)}</div></div></div>` : `<div class="recog-ok">已识别，请核对：</div>`}
      </div>
    </div>
    <div class="org-form">
      <div class="of-row">
        <div class="of-field"><label>姓名</label><input id="rgName" value="${esc(fields.name||'')}" placeholder="对照名片填写" /></div>
        <div class="of-field"><label>职位</label><input id="rgRole" value="${esc(fields.role||'')}" placeholder="如：CTO" /></div>
      </div>
      <div class="of-row">
        <div class="of-field"><label>电话</label><input id="rgPhone" value="${esc(fields.phone||'')}" /></div>
        <div class="of-field"><label>微信</label><input id="rgWechat" value="${esc(fields.wechat||'')}" /></div>
      </div>
      <div class="of-field"><label>邮箱</label><input id="rgEmail" value="${esc(fields.email||'')}" /></div>
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" id="rgCancel">取消</button>
      <button class="btn-primary" id="rgCreate">建立为联系人</button>
    </div>`;
  const m = $("#modal");
  const close = () => m.classList.add("hidden");
  $("#rgCancel").onclick = close; $(".modal-mask").onclick = close;
  $("#rgCreate").onclick = () => {
    const c = current;
    const name = $("#rgName").value.trim();
    if (!name) { toast("请至少填写姓名"); return; }
    const node = { id: uid("o"), pid: null, name, role: $("#rgRole").value.trim(), level: 2,
      phone: $("#rgPhone").value.trim(), wechat: $("#rgWechat").value.trim(), email: $("#rgEmail").value.trim(), note: "由名片建立", photo: "" };
    c.orgChain.push(node);
    asset.linkedNodeId = node.id;
    persist(); close(); renderOrgTree(); renderAssetGallery(); renderContactOptions();
    toast("已根据名片建立联系人");
    switchTab("org");
  };
}

// ---------- 大图预览 ----------
function bindLightbox() {
  $("#lbClose").onclick = closeLightbox;
  $(".lb-mask").onclick = closeLightbox;
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeLightbox(); });
}
function openLightbox(src) { $("#lbImg").src = src; $("#lightbox").classList.remove("hidden"); }
function closeLightbox() { $("#lightbox").classList.add("hidden"); $("#lbImg").src = ""; }

// ===================================================================
// 模块④ 客户情报（可编辑）+ AI 辅助（折叠）
// ===================================================================
function renderProfile() {
  const c = current;
  const cellHTML = def => {
    const f = c.fields[def.key] || { v: "" };
    const empty = !f.v || !f.v.trim();
    return `
      <div class="intel-cell ${empty?'is-empty':''}" data-k="${def.key}">
        <div class="ic-label">${def.label}</div>
        <div class="ic-value" contenteditable="true" data-k="${def.key}" data-ph="${def.ph}">${esc(f.v)}</div>
      </div>`;
  };
  const publicFields = FIELD_DEFS.filter(d => d.public);
  const privateFields = FIELD_DEFS.filter(d => !d.public);
  $("#intelGrid").innerHTML = `
    <div class="intel-section">
      <div class="intel-sec-head">
        <span class="intel-sec-ico" style="background:#e8f1ff;color:#2c6ef2">🌐</span>
        <div class="intel-sec-meta">
          <div class="intel-sec-title">网上可获取信息</div>
          <div class="intel-sec-sub">公开渠道可查，建联前先补齐</div>
        </div>
      </div>
      <div class="intel-cells">${publicFields.map(cellHTML).join("")}</div>
    </div>
    <div class="intel-section">
      <div class="intel-sec-head">
        <span class="intel-sec-ico" style="background:#fff1e8;color:#ed7b2f">🔍</span>
        <div class="intel-sec-meta">
          <div class="intel-sec-title">需要挖出的信息</div>
          <div class="intel-sec-sub">靠沟通/关系才能拿到，是签单关键</div>
        </div>
      </div>
      <div class="intel-cells">${privateFields.map(cellHTML).join("")}</div>
    </div>`;
  $("#intelGrid").querySelectorAll(".ic-value").forEach(el => {
    el.addEventListener("blur", () => {
      const k = el.dataset.k;
      if (!current.fields[k]) current.fields[k] = { v: "" };
      current.fields[k].v = el.textContent.trim();
      persist(); renderList();
      el.parentElement.classList.toggle("is-empty", !current.fields[k].v);
      if (k === "industry") $("#wsIndustry").textContent = current.fields[k].v || "未填行业";
    });
  });

  renderPain();
  bindAIAssist();
}

function renderPain() {
  const c = current;
  if (!c.painPoints) c.painPoints = [];
  $("#painList").innerHTML = c.painPoints.length ? c.painPoints.map((p, i) =>
    `<li data-i="${i}"><span contenteditable="true" class="pain-v" data-i="${i}">${esc(p.v)}</span><button class="pain-del" data-i="${i}">×</button></li>`
  ).join("") : `<li class="pain-empty">还没有痛点。手动添加，或用下方 AI 辅助给建议。</li>`;
  $("#painList").querySelectorAll(".pain-v").forEach(el => el.addEventListener("blur", () => { c.painPoints[el.dataset.i].v = el.textContent.trim(); persist(); }));
  $("#painList").querySelectorAll(".pain-del").forEach(el => el.addEventListener("click", () => { c.painPoints.splice(el.dataset.i, 1); persist(); renderPain(); }));
  $("#addPainBtn").onclick = () => { c.painPoints.push({ v: "新痛点（点击编辑）" }); persist(); renderPain(); };

  const sol = c.solution && c.solution.length ? c.solution : [];
  $("#solutionList").innerHTML = sol.length ? sol.map(s =>
    `<div class="sol-item"><div class="sol-prod">${esc(s.product)}</div><div class="sol-reason">${esc(s.reason)}</div></div>`
  ).join("") : `<div class="sol-empty">补充痛点后可参考产品匹配建议。</div>`;
}

function bindAIAssist() {
  $("#aiToggle").onclick = () => {
    const body = $("#aiAssistBody");
    const hidden = body.classList.toggle("hidden");
    $("#aiToggle").textContent = hidden ? "展开 ▾" : "收起 ▴";
  };
  $("#intakeText").value = current._lastIntake || "";
  $("#intakeText").oninput = e => current._lastIntake = e.target.value;
  $("#aiExtractBtn").onclick = runExtract;
  $("#webSearchBtn").onclick = runWebSearch;
  $("#aiSuggestBtn").onclick = runSuggest;
  $("#extractResult").classList.add("hidden");
}

function runExtract() {
  const raw = $("#intakeText").value.trim();
  if (!raw) { toast("请先粘贴你了解的信息"); return; }
  const btn = $("#aiExtractBtn");
  btn.disabled = true; btn.textContent = "抽取中…";
  const box = $("#extractResult");
  box.classList.remove("hidden");
  box.innerHTML = `<div class="ai-thinking"><span class="mini-spin"></span>AI 正在从文本中抽取结构化字段…</div>`;
  setTimeout(() => {
    const { name, found } = AIEngine.extract(raw);
    if (name && (current.name === "新客户" || !current.name)) {
      current.name = name; current.logo = name[0];
      $("#custNameInput").value = name; renderAvatar();
    }
    const keys = Object.keys(found);
    if (!keys.length) {
      box.innerHTML = `<div class="ai-empty">未能可靠抽取到结构化字段。建议把关键信息写得更明确（融资/规模/DAU/上云情况），或直接在上方情报表格手动填写。</div>`;
      btn.disabled = false; btn.textContent = "AI 结构化抽取";
      return;
    }
    box.innerHTML = `
      <div class="extract-head">AI 抽取到 ${keys.length} 项，逐条确认是否采纳：</div>
      <div class="extract-list">
        ${keys.map(k => {
          const def = FIELD_DEFS.find(d => d.key === k) || { label: k };
          return `<div class="ex-item" data-k="${k}">
            <div class="ex-field">${def.label}</div>
            <div class="ex-val" contenteditable="true">${esc(found[k])}</div>
            <button class="ex-adopt" data-k="${k}">采纳</button>
          </div>`;
        }).join("")}
      </div>
      <div class="extract-foot">
        <button class="btn-primary sm" id="adoptAllBtn">全部采纳</button>
        <span class="extract-note">采纳后填入上方情报表，仍可编辑</span>
      </div>`;
    box.querySelectorAll(".ex-adopt").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.k;
      const v = box.querySelector(`.ex-item[data-k="${k}"] .ex-val`).textContent.trim();
      adoptField(k, v); b.textContent = "已采纳 ✓"; b.disabled = true;
    }));
    $("#adoptAllBtn").addEventListener("click", () => {
      box.querySelectorAll(".ex-item").forEach(it => adoptField(it.dataset.k, it.querySelector(".ex-val").textContent.trim()));
      toast("已填入情报表");
    });
    btn.disabled = false; btn.textContent = "AI 结构化抽取";
  }, 1000);
}

function adoptField(key, val) {
  if (!current.fields[key]) current.fields[key] = { v: "" };
  current.fields[key].v = val;
  persist(); renderProfile(); renderList();
}

function runWebSearch() {
  const btn = $("#webSearchBtn");
  btn.disabled = true; btn.textContent = "检索中…";
  const box = $("#extractResult");
  box.classList.remove("hidden");
  box.innerHTML = `<div class="ai-thinking"><span class="mini-spin"></span>正在尝试检索「${esc(current.name)}」的公开信息…</div>`;
  AIEngine.webSearch(current.name).then(res => {
    btn.disabled = false; btn.textContent = "尝试联网检索";
    box.innerHTML = `<div class="ai-honest">
      <div class="honest-icon">!</div>
      <div>
        <div class="honest-t">AI 诚实反馈：未接入授权数据源</div>
        <div class="honest-c">${esc(res.message)}</div>
        <div class="honest-tip">设计原则：<b>AI 查不到就说查不到，绝不编造情报</b>。账单结构、决策链、客户关系这些最关键的信息，本来也只有你掌握。</div>
      </div>
    </div>`;
  });
}

function runSuggest() {
  const s = AIEngine.suggest(current);
  const box = $("#extractResult");
  box.classList.remove("hidden");
  const gm = gradeMeta(s.suggestGrade);
  box.innerHTML = `<div class="ai-suggest">
    <div class="asug-head">
      <div class="asug-score">${s.score}<small>/100</small></div>
      <div class="asug-meta">
        <div class="asug-t">AI 价值参考分</div>
        <div class="asug-grade">建议等级：<span class="asug-badge" style="background:${gm.color}">${gm.key}</span>（最终由你判断）</div>
      </div>
      <button class="btn-ghost sm" id="applySuggestGrade">采纳建议等级</button>
    </div>
    <ul class="asug-reasons">${s.reasons.map(r=>`<li>${esc(r)}</li>`).join("")}</ul>
    ${s.painGuess.length?`<div class="asug-pain"><div class="asug-pain-t">AI 建议关注的痛点（可采纳）：</div>${s.painGuess.map(p=>`<button class="asug-pain-btn" data-p="${esc(p)}">＋ ${esc(p)}</button>`).join("")}</div>`:""}
  </div>`;
  $("#applySuggestGrade").onclick = () => { current.grade = s.suggestGrade; persist(); renderGradeDropdown(); renderList(); toast(`已采纳建议等级 ${s.suggestGrade}`); };
  box.querySelectorAll(".asug-pain-btn").forEach(b => b.addEventListener("click", () => {
    current.painPoints.push({ v: b.dataset.p }); persist(); renderPain(); b.disabled = true; b.textContent = "已添加 ✓";
  }));
}

// ===================================================================
// 模块④ 话术辅助
// ===================================================================
function buildScripts(c) {
  const painArr = (c.painPoints || []).map(p => p.v).filter(Boolean);
  const topPain = painArr[0] || "当前业务的降本/提效";
  const sol = c.solution && c.solution[0];
  const topSol = sol ? sol.product : "腾讯云整体方案";
  const topSolReason = sol ? sol.reason : "针对性优化成本与体验";
  const cto = (c.orgChain || []).find(n => (n.role||"").includes("CTO")) || (c.orgChain||[])[0] || { name: "负责人" };
  const ind = (c.fields.industry && c.fields.industry.v) || "该行业";
  const org3 = (c.orgChain||[]).find(n=>n.level===3) || (c.orgChain||[])[2] || cto;
  const highGrade = c.grade === "S" || c.grade === "A";
  return {
    first: [
      { head: "开场（30 秒价值锚点）", text: `${cto.name}您好，我是腾讯云的销售顾问。我们服务过多家${ind}客户，注意到贵司在「${topPain}」上可能有优化空间。想用 2 分钟同步一个我们为同行落地的思路，您方便吗？` },
      { head: "价值钩子", text: `针对${ind}，我们有一套方案，比如「${topSol}」可以${topSolReason}。不是单纯卖产品，而是针对贵司痛点做设计。` },
    ],
    meeting: [
      { head: "约见面（不可拒绝的理由）", text: `${cto.name}，我这两天正好在贵司附近。想占用您 20 分钟，当面汇报腾讯云针对${ind}的整体能力和初步方案，顺便请您喝杯咖啡。您周三上午还是周四下午方便？` },
    ],
    rejected: [
      { head: "被拒后 2-3 天再触达", text: `${cto.name}，上次没多打扰您。我整理了一份${ind}同行的降本/提效案例，也许对贵司「${topPain}」有启发，方便加个微信我发您？` },
      { head: "多点建联提示", text: `（内部提示：若本人持续无响应，切换到「${org3.name}」等其他联系人，一家客户不押注单点。）` },
    ],
    objection: [
      { head: "异议：已在用友商云", text: `理解，迁移要慎重。很多${ind}客户先用腾讯云承接新增业务或高痛点场景（如${topSolReason}），跑通再逐步迁移。可先做小范围 POC，用数据说话。` },
      { head: "异议：价格敏感", text: highGrade
        ? `以贵司体量，可走定制商务方案，用「按量转包月+利旧+Serverless 削峰」把整体 TCO 降下来，先做一版成本测算。`
        : `理解控成本诉求。我们有轻量服务器和云开发等高性价比方案，起步低，随业务平滑升级。` },
    ],
  };
}

function renderScript() {
  const el = $("#scriptScenes");
  if (!el) return; // 话术辅助 Tab 已下线，无渲染目标时直接跳过
  const scripts = buildScripts(current);
  el.innerHTML = SCRIPT_SCENES.map((s, i) => `<button class="scene-btn ${i===0?'active':''}" data-key="${s.key}">${s.label}</button>`).join("");
  el.querySelectorAll(".scene-btn").forEach(btn => btn.addEventListener("click", () => {
    el.querySelectorAll(".scene-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active"); showScript(scripts, btn.dataset.key);
  }));
  showScript(scripts, "first");
}

function showScript(scripts, key) {
  const blocks = scripts[key] || [];
  $("#scriptOutput").innerHTML = blocks.map(b => `
    <div class="script-block">
      <div class="script-head">${esc(b.head)}</div>
      <div class="script-text">${esc(b.text)}<button class="copy-btn" onclick="copyText(this)">复制</button></div>
    </div>`).join("");
}

function copyText(btn) {
  const text = btn.parentElement.childNodes[0].textContent;
  navigator.clipboard?.writeText(text).then(() => { btn.textContent = "已复制 ✓"; setTimeout(() => btn.textContent = "复制", 1500); }).catch(() => { btn.textContent = "已复制 ✓"; });
}

// ===================================================================
// 模块⑤ 复盘
// ===================================================================
function renderFunnel() {
  const c = current;
  const f = c.funnel || { reached: 0, connected: 0, meeting: 0, proposal: 0, won: 0 };
  const stages = [["触达", f.reached, "#0052d9"], ["接通", f.connected, "#366ef4"], ["见面", f.meeting, "#5b8ff9"], ["方案", f.proposal, "#7ba9fb"], ["成交", f.won, "#00a870"]];
  const max = f.reached || 100;
  let prev = null;
  $("#funnelChart").innerHTML = stages.map(([label, val, color]) => {
    const drop = prev !== null && prev > 0 ? `-${Math.round((1 - val / prev) * 100)}%` : "";
    prev = val;
    return `<div class="fn-row"><div class="fn-label">${label}</div><div class="fn-bar-wrap"><div class="fn-bar" data-w="${(val/max*100)}" style="width:0;background:${color}">${val}</div></div><div class="fn-drop">${drop}</div></div>`;
  }).join("");
  setTimeout(() => $$("#funnelChart .fn-bar").forEach(bar => bar.style.width = bar.dataset.w + "%"), 100);

  if (!f.reached) {
    $("#funnelDiagnosis").innerHTML = `<div class="diag-block tip"><div class="diag-c">该客户暂无跟进漏斗数据。随着跟进推进，这里会诊断最大流失环节并给出 winback 建议。</div></div>`;
    return;
  }
  const arr = [["接通", f.connected/f.reached], ["见面", f.meeting/(f.connected||1)], ["方案", f.proposal/(f.meeting||1)], ["成交", f.won/(f.proposal||1)]];
  let worst = arr[0]; arr.forEach(a => { if (a[1] < worst[1]) worst = a; });
  const worstMap = {
    "接通": "触达→接通流失最大，触达渠道或时段不佳。建议：优化拨打时段、脉脉/邮件预热，多点建联（7-10 人）。",
    "见面": "接通→见面转化偏低，愿聊但约不出来。建议：强化「不可拒绝的见面理由」，用「20 分钟咖啡+汇报腾讯整体能力」降门槛。",
    "方案": "见面→方案转化不足。建议：见面后 24h 内发定制方案摘要，锁定 POC 承诺。",
    "成交": "方案→成交是瓶颈。建议：核对决策链是否漏掉「一票否决」经办人，补齐商务与 TCO 测算。",
  };
  const winback = (c.grade === "S" || c.grade === "A")
    ? `${c.name} 价值较高、云支出体量大。winback 抓手：以「降本增效」切入，用「按量转包月+利旧+Serverless 削峰」做 TCO 测算，量化节省直接触达 CTO/财务。`
    : `${c.name} 为培育型，暂以轻量方案维系。低频持续触达，等其融资/业务上台阶后升级为重点。`;
  $("#funnelDiagnosis").innerHTML = `
    <div class="diag-block warn"><div class="diag-t">◆ 最大流失环节：${worst[0]}（转化率 ${Math.round(worst[1]*100)}%）</div><div class="diag-c">${worstMap[worst[0]]}</div></div>
    <div class="diag-block tip"><div class="diag-t">◆ 整体转化率</div><div class="diag-c">从触达到成交整体 ${f.won}%。行业健康线约 3-8%，${f.won>=3?'处于合理区间，补齐上述环节即可放大结果。':'偏低，先聚焦最大流失环节做专项优化。'}</div></div>
    <div class="diag-block win"><div class="diag-t">◆ Winback / 二次销售</div><div class="diag-c">${winback}</div></div>`;
}

// ===================================================================
// 数据看板
// ===================================================================
function toggleDashboard() {
  const d = $("#dashboard");
  if (!d.classList.contains("hidden")) { d.classList.add("hidden"); if (current) $("#workspace").classList.remove("hidden"); else $("#emptyState").classList.remove("hidden"); return; }
  $("#workspace").classList.add("hidden"); $("#emptyState").classList.add("hidden");
  d.classList.remove("hidden");
  renderDashboard();
}

function renderDashboard() {
  const total = customers.length;
  const byStage = CRM_STAGES.map(s => ({ ...s, n: customers.filter(c => c.stage === s.key).length }));
  const byGrade = GRADES.map(g => ({ ...g, n: customers.filter(c => c.grade === g.key).length }));
  const won = customers.filter(c => c.stage === "won").length;
  const active = customers.filter(c => ["contact","meeting","proposal"].includes(c.stage)).length;
  const maxStage = Math.max(1, ...byStage.map(s => s.n));
  // 待办统计
  const today = todayStr();
  let todoCount = 0, overdueCount = 0;
  customers.forEach(c => (c.notes||[]).forEach(n => { if (n.next && n.nextDate) { todoCount++; if (n.nextDate < today) overdueCount++; } }));

  // ===== 工作推进节奏：基于全部客户的跟进记录（note.date）做时间维度统计 =====
  const pace = computePace();

  $("#dashboard").innerHTML = `
    <div class="dash-head">销售数据看板<button class="btn-ghost sm" id="closeDash">返回</button></div>
    <div class="dash-cards">
      <div class="dash-card"><div class="dc-num">${total}</div><div class="dc-lbl">客户总数</div></div>
      <div class="dash-card"><div class="dc-num">${active}</div><div class="dc-lbl">跟进中</div></div>
      <div class="dash-card"><div class="dc-num">${todoCount}</div><div class="dc-lbl">待办跟进</div></div>
      <div class="dash-card ${overdueCount?'warn':''}"><div class="dc-num">${overdueCount}</div><div class="dc-lbl">已逾期</div></div>
    </div>

    <!-- 工作推进节奏 · 时间维度汇总卡 -->
    <div class="dash-section-title">📈 我的工作推进节奏<span class="dss-sub">基于全部客户的跟进记录汇总</span></div>
    <div class="dash-cards pace-cards">
      <div class="dash-card pace-card">
        <div class="dc-num">${pace.thisWeek}<span class="pc-unit">次</span></div>
        <div class="dc-lbl">本周跟进${paceDelta(pace.thisWeek, pace.lastWeek)}</div>
      </div>
      <div class="dash-card pace-card">
        <div class="dc-num">${pace.thisMonth}<span class="pc-unit">次</span></div>
        <div class="dc-lbl">本月跟进${paceDelta(pace.thisMonth, pace.lastMonth)}</div>
      </div>
      <div class="dash-card pace-card">
        <div class="dc-num">${pace.touchedThisWeek}<span class="pc-unit">家</span></div>
        <div class="dc-lbl">本周触达客户</div>
      </div>
      <div class="dash-card pace-card">
        <div class="dc-num">${pace.weekAvg}<span class="pc-unit">次</span></div>
        <div class="dc-lbl">近8周周均</div>
      </div>
    </div>

    <div class="grid-2">
      <!-- 近 8 周跟进量趋势 -->
      <div class="card"><div class="card-title">近 8 周跟进量趋势<span class="card-tag-soft">看节奏起伏</span></div>
        <div class="trend-chart">
          ${pace.weeks.map(w => `
            <div class="tc-col" title="${w.label}：${w.n} 次跟进">
              <div class="tc-bar-wrap">
                <div class="tc-bar ${w.isCurrent?'cur':''}" style="height:${w.n/pace.weekMax*100}%"></div>
              </div>
              <div class="tc-n">${w.n||''}</div>
              <div class="tc-lbl">${w.short}</div>
            </div>`).join("")}
        </div>
        <div class="dash-tip">${pace.trendTip}</div>
      </div>

      <!-- 沟通方式分布 -->
      <div class="card"><div class="card-title">沟通方式分布<span class="card-tag-soft">你的触达结构</span></div>
        ${pace.methodTotal ? `<div class="method-dist">
          ${pace.methods.map(m => `<div class="md-row">
            <div class="md-lbl"><span class="md-ic" style="color:${m.color}">${m.icon}</span>${esc(m.label)}</div>
            <div class="md-bar-wrap"><div class="md-bar" style="width:${m.n/pace.methodMax*100}%;background:${m.color}"></div></div>
            <div class="md-n">${m.n}<span class="md-pct">${Math.round(m.n/pace.methodTotal*100)}%</span></div>
          </div>`).join("")}
        </div>` : `<div class="dash-empty">暂无跟进记录，去客户页添加第一条跟进吧。</div>`}
      </div>
    </div>

    <!-- 待办日历热力（未来 14 天） -->
    <div class="card"><div class="card-title">待办日历热力<span class="card-tag-soft">未来 14 天 · 提前看忙闲</span></div>
      <div class="todo-heat">
        ${pace.todoDays.map(d => `<div class="th-cell l${d.level} ${d.isToday?'today':''} ${d.overdue?'overdue':''}" title="${d.label}：${d.n} 项待办">
          <div class="th-date">${d.dd}</div>
          <div class="th-dot">${d.n||''}</div>
          <div class="th-wd">${d.wd}</div>
        </div>`).join("")}
      </div>
      <div class="dash-tip">${pace.todoTip}</div>
    </div>

    <div class="dash-section-title">👥 客户结构</div>
    <div class="grid-2">
      <div class="card"><div class="card-title">推进阶段分布</div>
        <div class="dash-bars">${byStage.map(s => `<div class="db-row"><div class="db-lbl">${s.label}</div><div class="db-bar-wrap"><div class="db-bar" style="width:${s.n/maxStage*100}%;background:${s.color}"></div></div><div class="db-n">${s.n}</div></div>`).join("")}</div>
      </div>
      <div class="card"><div class="card-title">重点等级分布</div>
        <div class="dash-grades">${byGrade.map(x => `<div class="dg-item" style="--gc:${x.color}"><div class="dg-g" style="color:${x.color}">${x.key}</div><div class="dg-n">${x.n}</div><div class="dg-l">${esc(x.label.split("·")[1]?x.label.split("·")[1].trim():x.label)}</div></div>`).join("")}</div>
        <div class="dash-tip">把资源优先压在 S / A 级客户上，B / C 级保持低频触达。抓高价值、不平均用力。</div>
      </div>
    </div>`;
  $("#closeDash").onclick = toggleDashboard;
}

// 环比小标签（次数对比上一周期）
function paceDelta(cur, prev) {
  if (prev === 0 && cur === 0) return '';
  if (prev === 0) return ` <span class="pc-delta up">新增</span>`;
  const diff = cur - prev;
  if (diff === 0) return ` <span class="pc-delta flat">持平</span>`;
  const pct = Math.round(Math.abs(diff) / prev * 100);
  return diff > 0
    ? ` <span class="pc-delta up">↑${pct}%</span>`
    : ` <span class="pc-delta down">↓${pct}%</span>`;
}

// ---- 时间维度统计核心：把所有客户的 notes 按时间聚合 ----
function computePace() {
  // 收集全部跟进记录（含所属客户），date 形如 "2026-06-20 14:30"
  const allNotes = [];
  customers.forEach(c => (c.notes || []).forEach(n => {
    if (n.date) allNotes.push({ ...n, _cust: c.id });
  }));

  const now = new Date();
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // 周一为一周起点
  const weekStart = (d) => {
    const x = startOfDay(d);
    const wd = (x.getDay() + 6) % 7; // 周一=0
    x.setDate(x.getDate() - wd);
    return x;
  };
  const parseDate = s => {
    const p = String(s).slice(0, 10).split("-");
    return p.length === 3 ? new Date(+p[0], +p[1]-1, +p[2]) : null;
  };

  const curWeekStart = weekStart(now);
  const lastWeekStart = new Date(curWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const curMonth = now.getMonth(), curYear = now.getFullYear();
  const lastMonthDate = new Date(curYear, curMonth - 1, 1);

  let thisWeek = 0, lastWeek = 0, thisMonth = 0, lastMonth = 0;
  const touchedSet = new Set();
  allNotes.forEach(n => {
    const d = parseDate(n.date); if (!d) return;
    if (d >= curWeekStart) { thisWeek++; touchedSet.add(n._cust); }
    else if (d >= lastWeekStart && d < curWeekStart) lastWeek++;
    if (d.getFullYear() === curYear && d.getMonth() === curMonth) thisMonth++;
    else if (d.getFullYear() === lastMonthDate.getFullYear() && d.getMonth() === lastMonthDate.getMonth()) lastMonth++;
  });

  // 近 8 周柱状
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const ws = new Date(curWeekStart); ws.setDate(ws.getDate() - i * 7);
    const we = new Date(ws); we.setDate(we.getDate() + 7);
    const n = allNotes.filter(x => { const d = parseDate(x.date); return d && d >= ws && d < we; }).length;
    weeks.push({
      n,
      isCurrent: i === 0,
      label: `${ws.getMonth()+1}/${ws.getDate()} 当周`,
      short: i === 0 ? "本周" : `${ws.getMonth()+1}/${ws.getDate()}`,
    });
  }
  const weekMax = Math.max(1, ...weeks.map(w => w.n));
  const week8Total = weeks.reduce((s, w) => s + w.n, 0);
  const weekAvg = Math.round(week8Total / 8 * 10) / 10;

  // 趋势提示
  let trendTip;
  if (week8Total === 0) trendTip = "近 8 周还没有跟进记录，先动起来 —— 保持稳定的触达节奏是转化的前提。";
  else if (thisWeek === 0) trendTip = "本周还没有跟进动作，别让节奏断档，安排一两次触达把势头接上。";
  else if (thisWeek >= weekAvg) trendTip = `本周 ${thisWeek} 次，达到或高于周均 ${weekAvg} 次，节奏保持得不错，继续。`;
  else trendTip = `本周 ${thisWeek} 次，低于周均 ${weekAvg} 次，留意别让跟进强度掉下来。`;

  // 沟通方式分布
  const methodCount = {};
  allNotes.forEach(n => { methodCount[n.method] = (methodCount[n.method] || 0) + 1; });
  const methods = CONTACT_METHODS
    .map(m => ({ ...m, n: methodCount[m.key] || 0 }))
    .filter(m => m.n > 0)
    .sort((a, b) => b.n - a.n);
  const methodTotal = methods.reduce((s, m) => s + m.n, 0);
  const methodMax = Math.max(1, ...methods.map(m => m.n));

  // 待办日历热力：未来 14 天，按 nextDate 聚合
  const todoByDate = {};
  customers.forEach(c => (c.notes || []).forEach(n => {
    if (n.next && n.nextDate) todoByDate[n.nextDate] = (todoByDate[n.nextDate] || 0) + 1;
  }));
  const WD = ["日","一","二","三","四","五","六"];
  const todoDays = [];
  const today0 = startOfDay(now);
  for (let i = 0; i < 14; i++) {
    const d = new Date(today0); d.setDate(d.getDate() + i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const n = todoByDate[key] || 0;
    const level = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : 3;
    todoDays.push({
      n, level, dd: d.getDate(), wd: WD[d.getDay()],
      isToday: i === 0,
      overdue: false,
      label: `${d.getMonth()+1}/${d.getDate()}`,
    });
  }
  const next14Total = todoDays.reduce((s, d) => s + d.n, 0);
  const busiest = todoDays.reduce((a, b) => b.n > a.n ? b : a, todoDays[0]);
  let todoTip;
  if (next14Total === 0) todoTip = "未来两周暂无已排期的待办，记得在跟进记录里设置「下一步 + 提醒日期」，别靠脑子记。";
  else todoTip = `未来两周共 ${next14Total} 项待办，最忙是 ${busiest.label}（${busiest.n} 项），提前把重点客户的准备工作排上。`;

  return {
    thisWeek, lastWeek, thisMonth, lastMonth,
    touchedThisWeek: touchedSet.size,
    weeks, weekMax, weekAvg, trendTip,
    methods, methodTotal, methodMax,
    todoDays, todoTip,
  };
}

// ===================================================================
// Tab / 弹窗
// ===================================================================
function switchTab(tab) {
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  $$(".tab-pane").forEach(p => p.classList.toggle("active", p.dataset.pane === tab));
}

function confirmModal(text, onOk) {
  const m = $("#modal");
  m.classList.remove("hidden");
  $("#modalBox").innerHTML = `
    <div class="modal-title">请确认</div>
    <div class="modal-text">${esc(text)}</div>
    <div class="modal-actions">
      <button class="btn-ghost" id="mCancel">取消</button>
      <button class="btn-danger" id="mOk">确定</button>
    </div>`;
  $("#mCancel").onclick = () => m.classList.add("hidden");
  $(".modal-mask").onclick = () => m.classList.add("hidden");
  $("#mOk").onclick = () => { m.classList.add("hidden"); onOk && onOk(); };
}
