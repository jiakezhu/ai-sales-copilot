(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReportBuilder = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PLACEHOLDERS = new Set([
    "未填写", "尚未填写", "暂无", "暂无内容", "暂无数据", "暂无信息", "暂无记录",
    "暂无材料", "暂无附件", "待补充", "待填写", "待完善", "无",
  ]);
  const ATTITUDE_LABELS = { positive: "积极", neutral: "观望", negative: "抵触" };
  const LEVEL_LABELS = { 1: "决策层", 2: "影响层", 3: "执行层" };
  const SOURCE_LABELS = { customer: "客户自报", website: "官网", qcc: "企查查", tyc: "天眼查", qxb: "企信慧眼", web: "全网检索", panshi: "磐石" };
  const CONFIDENCE_LABELS = { unverified: "待核", high: "高置信", medium: "中置信", low: "低置信" };
  const PHONE_TYPE_LABELS = { direct: "直联号码", agent: "代记账/第三方", unverified: "待核验" };
  const SECTION_META = {
    "客户画像": ["profile", "blue"], "机会判断": ["opportunity", "amber"],
    "关系与决策": ["relationships", "violet"], "推进与行动": ["progress", "green"], "客户基本信息与情报": ["profile-detail", "teal"],
    "产品与商业模式简报": ["business", "violet"], "外部市场与招聘信号": ["signals", "cyan"], "近期招投标 / 中标": ["bidding", "amber"],
    "资质与许可": ["qualifications", "teal"], "机会痛苦链": ["opportunity-path", "green"], "销售假设与待确认问题（非事实）": ["hypotheses", "amber"],
    "组织与关键关系": ["relationships", "violet"], "痛点、竞品与匹配方案": ["market", "green"], "会前沟通准备": ["meeting-prep", "blue"],
    "会后确认": ["meeting-review", "teal"], "全流程客户推进记录": ["progress", "blue"], "当前未完成行动": ["pending", "red"],
    "阶段历史、目标与攻坚计划": ["execution", "violet"], "联合工作计划": ["joint-plan", "green"], "谈判与成交策略": ["negotiation", "red"],
    "材料与证据索引": ["evidence", "slate"], "六维机会诊断": ["diagnosis", "violet"], "客户推进阶段": ["journey", "green"],
  };
  const SECTION_ICONS = {
    "客户基本信息与情报": "🏢", "产品与商业模式简报": "☁️", "外部市场与招聘信号": "📡", "招投标 / 中标": "🏆", "资质与许可": "✅",
    "六维机会诊断": "🧭", "机会痛苦链": "🔗", "销售假设与待确认问题（非事实）": "💭", "痛点、竞品与匹配方案": "🧩", "谈判与成交策略": "🤝",
    "组织与关键关系": "🧑‍🤝‍🧑", "会前沟通准备": "🗓️", "会后确认": "📝", "客户推进阶段": "🚀", "全流程客户推进记录": "🛤️",
    "当前未完成行动": "📌", "阶段历史、目标与攻坚计划": "📈", "联合工作计划": "🤝", "材料与证据索引": "📎",
  };
  const PROFILE_GROUPS = [
    { key: "identity", label: "工商身份", icon: "🏢", fields: ["creditCode", "legalPerson", "regCapital", "regAddress", "founded", "website"] },
    { key: "scale", label: "规模与资本", icon: "📊", fields: ["staff", "funding", "shareholders", "parentSubs"] },
    { key: "business", label: "产品与经营", icon: "☁️", fields: ["industry", "product", "businessModel", "dau", "revenue", "supplyChain"] },
    { key: "technology", label: "技术与云现状", icon: "🛠️", fields: ["techStack", "cloudStatus", "billNote"] },
    { key: "signals", label: "市场信号与风险", icon: "📡", fields: ["recentNews", "hiring", "triggerEvents", "riskNote"] },
    { key: "sales", label: "销售关系与策略", icon: "🤝", fields: ["relation"] },
  ];

  const escape = value => String(value == null ? "" : value).replace(/[&<>\"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[character]);
  const rawText = value => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const array = value => Array.isArray(value) ? value : [];

  function linkHref(value) {
    const source = clean(value);
    if (/^https?:\/\/[^\s<>"']+$/i.test(source)) return source;
    if (/^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s<>"']*)?$/i.test(source)) return `https://${source.replace(/^www\./i, "www.")}`;
    return "";
  }

  function linked(value) {
    const source = String(value == null ? "" : value);
    const pattern = /https?:\/\/[^\s<>"']+/gi;
    let cursor = 0;
    let output = "";
    for (const match of source.matchAll(pattern)) {
      output += escape(source.slice(cursor, match.index));
      const rawUrl = match[0];
      const url = rawUrl.replace(/[),.;!?，。；！？，、]+$/g, "");
      const suffix = rawUrl.slice(url.length);
      output += `<a class="report-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(url)}</a>${escape(suffix)}`;
      cursor = Number(match.index) + rawUrl.length;
    }
    return output + escape(source.slice(cursor));
  }

  function clean(value) {
    const result = rawText(value);
    if (!result) return "";
    const comparable = result.replace(/[。.!！?？;；:：]+$/g, "").trim();
    return PLACEHOLDERS.has(comparable) ? "" : result;
  }

  function valueOf(value) {
    if (value == null) return "";
    if (typeof value !== "object") return clean(value);
    for (const key of ["v", "value", "text", "content", "name", "label"]) {
      const candidate = clean(value[key]);
      if (candidate) return candidate;
    }
    return "";
  }

  function fieldWithProvenance(value, formatter) {
    const fact = valueOf(value);
    if (!fact) return "";
    if (!value || typeof value !== "object") return fact;
    const source = SOURCE_LABELS[clean(value.source)] || "来源待补充";
    const confidence = CONFIDENCE_LABELS[clean(value.confidence)] || "待核";
    const verifiedAt = format(value.verifiedAt, formatter);
    return describeParts([fact, `来源：${source}`, confidence, verifiedAt ? `核验：${verifiedAt}` : ""]);
  }

  function resolveLabel(items, key) {
    const match = array(items).find(item => item && item.key === key);
    return clean(match && match.label) || clean(key);
  }

  function format(value, formatter) {
    const source = clean(value);
    if (!source) return "";
    if (typeof formatter !== "function") return source;
    try { return clean(formatter(value)) || source; } catch (_) { return source; }
  }

  function keyOf(parts) {
    return parts.map(value => clean(value).toLocaleLowerCase()).join("\u241f");
  }

  function uniqueRecords(records, makeKey) {
    const seen = new Set();
    return records.filter(record => {
      const key = makeKey(record);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function describeParts(parts, separator) {
    return parts.map(clean).filter(Boolean).join(separator || " · ");
  }

  function sectionMeta(title) {
    return SECTION_META[title] || [rawText(title).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "section", "slate"];
  }

  function section(title, body, className) {
    if (!body) return "";
    const [id, tone] = sectionMeta(title);
    const classes = ["report-section", `report-tone-${tone}`, className].filter(Boolean).join(" ");
    return `<section class="${classes}" id="report-${id}" data-report-title="${escape(title)}"><div class="report-section-title"><h2>${escape(title)}</h2></div>${body}</section>`;
  }

  function subsection(title, body, kind, collapsed, id) {
    if (!body) return "";
    const heading = `<i aria-hidden="true">${escape(SECTION_ICONS[title] || "✦")}</i><h3>${escape(title)}</h3>`;
    const anchor = id ? ` id="report-sub-${escape(id)}"` : "";
    return `<article class="report-subsection report-subsection--${escape(kind || "default")}"${anchor}><header>${heading}</header><div class="report-subsection-body">${body}</div></article>`;
  }

  function categoryBody(items) {
    const blocks = items.filter(item => item.body).map(item => subsection(item.title, item.body, item.kind, item.collapsed, sectionMeta(item.title)[0])).join("");
    if (!blocks) return "";
    return `<div class="report-category-content">${blocks}</div>`;
  }

  function panorama(name, groups) {
    const branches = groups.map((group, index) => {
      const nodes = group.items.filter(item => item.body).map(item => `<span>${escape(item.title)}</span>`).join("");
      if (!nodes) return "";
      return `<article class="report-panorama-branch report-panorama-${escape(group.tone)}"><div class="report-panorama-group"><small>0${index + 1}</small><span class="report-panorama-group-icon" aria-hidden="true">${escape(group.icon || "✦")}</span><b>${escape(group.title)}</b></div><div class="report-panorama-leaves">${nodes}</div></article>`;
    }).filter(Boolean).join("");
    if (!branches) return "";
    return `<section class="report-panorama"><div class="report-panorama-heading"><span>CUSTOMER 360 MAP</span><h2>客户全景树</h2></div><div class="report-panorama-tree"><div class="report-panorama-core"><small>🧭 客户中心</small><b>${escape(name || "客户")}</b></div><div class="report-panorama-branches">${branches}</div></div></section>`;
  }

  function reportToc(specs) {
    const links = specs.filter(spec => spec.body).map((spec, index) => {
      const [id, tone] = sectionMeta(spec.title);
      const children = array(spec.children).map(child => `<a class="report-toc-sub" href="#report-sub-${escape(child.id)}"><span class="report-toc-sub-emoji" aria-hidden="true">${escape(child.icon || SECTION_ICONS[child.title] || "✦")}</span><span>${escape(child.title)}</span></a>`).join("");
      return `<div class="report-toc-group"><a class="report-toc-link report-toc-${tone}" href="#report-${id}"><strong>0${index + 1}</strong><span class="report-toc-main-emoji" aria-hidden="true">${escape(spec.icon || "✦")}</span><span>${escape(spec.title)}</span></a>${children ? `<div class="report-toc-subs">${children}</div>` : ""}</div>`;
    }).join("");
    return links ? `<nav class="report-toc" aria-label="报告目录"><div class="report-toc-head"><b>📑 报告导航</b><small>REPORT CONTENTS</small></div>${links}</nav>` : "";
  }

  function openingSummary(entries, mascotSrc) {
    const facts = entries.map(([label, value, tone, icon]) => ({ label: clean(label), value: clean(value), tone, icon })).filter(item => item.value).slice(0, 4);
    if (!facts.length) return "";
    const cards = facts.map(item => `<article class="report-summary-card report-summary-${item.tone || "blue"}"><small><span aria-hidden="true">${escape(item.icon || "✦")}</span>${escape(item.label)}</small><p>${escape(item.value)}</p></article>`).join("");
    const mascot = clean(mascotSrc) ? `<img class="report-summary-mascot" src="${escape(mascotSrc)}" alt="Sales Buddy 企鹅助手">` : "";
    return `<section class="report-opening-summary"><div class="report-summary-copy"><span>KEY TAKEAWAYS</span><h2>关键信息</h2></div>${mascot}<div class="report-summary-grid">${cards}</div></section>`;
  }

  function fieldGrid(entries, className) {
    const facts = uniqueRecords(entries.map(([label, value]) => [clean(label), clean(value)]), entry => keyOf(entry));
    const body = facts.map(([label, value]) => value
      ? `<div class="report-field"><span>${escape(label)}</span><p>${linked(value)}</p></div>`
      : "").join("");
    return body ? `<div class="${className || "report-field-grid"}">${body}</div>` : "";
  }

  function businessModelMap(source) {
    const flow = [
      ["01", "产品供给", "WHAT", valueOf(source.products)],
      ["02", "商业变现", "HOW", valueOf(source.revenueLogic)],
      ["03", "经营表现", "RESULT", valueOf(source.operatingStatus)],
    ].filter(entry => entry[3]);
    const context = [
      ["竞争参照", "MARKET", valueOf(source.competitors), "amber"],
      ["业务阻力", "FRICTION", valueOf(source.painHypothesis), "red"],
    ].filter(entry => entry[2]);
    if (!flow.length && !context.length) return "";
    const flowHtml = flow.map(entry => `<article><span>${entry[0]}</span><small>${entry[2]}</small><b>${entry[1]}</b><p>${linked(entry[3])}</p></article>`).join("");
    const contextHtml = context.map(entry => `<article class="report-business-${entry[3]}"><small>${entry[1]}</small><b>${entry[0]}</b><p>${linked(entry[2])}</p></article>`).join("");
    return `<div class="report-business-model"><div class="report-business-flow" style="--business-count:${flow.length}">${flowHtml}</div>${contextHtml ? `<div class="report-business-context">${contextHtml}</div>` : ""}</div>`;
  }

  function negotiationMap(source) {
    const path = [
      ["01", "目标结果", valueOf(source.objective), "blue"],
      ["02", "价值锚点", valueOf(source.valueAnchor), "violet"],
      ["03", "交换条件", valueOf(source.giveGet), "amber"],
      ["04", "谈判红线", valueOf(source.redLine), "red"],
      ["05", "收口动作", valueOf(source.closeAction), "green"],
    ].filter(entry => entry[2]);
    const rails = [
      ["客户立场", valueOf(source.customerPosition), "必须守住", valueOf(source.mustHave)],
      ["可交换项", valueOf(source.flexible), "主要异议", valueOf(source.objections)],
      ["回应策略", valueOf(source.response), "", ""],
    ].filter(entry => entry[1] || entry[3]);
    if (!path.length && !rails.length) return "";
    const pathHtml = path.map((entry, index) => `<article class="report-negotiation-${entry[3]}"><small>${entry[0]}</small><b>${escape(entry[1])}</b><p>${linked(entry[2])}</p>${index < path.length - 1 ? `<i aria-hidden="true">→</i>` : ""}</article>`).join("");
    const railHtml = rails.map(entry => `<article>${entry[1] ? `<div><small>${escape(entry[0])}</small><p>${linked(entry[1])}</p></div>` : ""}${entry[3] ? `<div><small>${escape(entry[2])}</small><p>${linked(entry[3])}</p></div>` : ""}</article>`).join("");
    return `<div class="report-negotiation-map">${pathHtml ? `<div class="report-negotiation-path" style="--negotiation-count:${path.length}">${pathHtml}</div>` : ""}${railHtml ? `<div class="report-negotiation-rails">${railHtml}</div>` : ""}</div>`;
  }

  function profileTree(fieldDefs, fields, extras, formatter) {
    const definitions = new Map(array(fieldDefs).map(definition => [definition && definition.key, definition]));
    const groupedKeys = new Set(PROFILE_GROUPS.flatMap(group => group.fields));
    const extraEntries = array(extras).map(entry => [clean(entry[0]), clean(entry[1]), clean(entry[2])]).filter(([, value]) => value);
    const branches = PROFILE_GROUPS.map(group => {
      const items = group.fields.map(key => {
        const definition = definitions.get(key);
        const label = valueOf(definition && (definition.label || definition.key)) || key;
        const value = fieldWithProvenance(fields[key], formatter);
        return value ? [label, value] : null;
      }).filter(Boolean);
      if (group.key === "business") extraEntries.filter(([, , target]) => target === "business").forEach(([label, value]) => items.push([label, value]));
      if (group.key === "sales") extraEntries.filter(([, , target]) => target === "sales").forEach(([label, value]) => items.push([label, value]));
      const unique = uniqueRecords(items, entry => keyOf(entry));
      if (!unique.length) return "";
      const leaves = unique.map(([label, value]) => `<article class="report-tree-leaf"><span>${escape(label)}</span><p>${linked(value)}</p></article>`).join("");
      return `<div class="report-tree-branch report-tree-${group.key}"><div class="report-tree-root"><i>${escape(group.icon)}</i><b>${escape(group.label)}</b><small>${unique.length} 项</small></div><div class="report-tree-leaves">${leaves}</div></div>`;
    }).filter(Boolean);
    const other = array(fieldDefs).filter(definition => definition && !groupedKeys.has(definition.key)).map(definition => {
      const value = fieldWithProvenance(fields[definition.key], formatter);
      return value ? [valueOf(definition.label || definition.key), value] : null;
    }).filter(Boolean);
    if (other.length) {
      const leaves = other.map(([label, value]) => `<article class="report-tree-leaf"><span>${escape(label)}</span><p>${linked(value)}</p></article>`).join("");
      branches.push(`<div class="report-tree-branch report-tree-other"><div class="report-tree-root"><i>🧩</i><b>补充信息</b><small>${other.length} 项</small></div><div class="report-tree-leaves">${leaves}</div></div>`);
    }
    return branches.length ? `<div class="report-profile-tree">${branches.join("")}</div>` : "";
  }

  function diagnosisVisual(source) {
    const dimensions = [
      ["pain", "痛苦"], ["power", "权力"], ["vision", "构想"],
      ["value", "价值"], ["control", "控制"], ["milestone", "里程碑"],
    ].map(([key, label]) => {
      const raw = clean(source[key]);
      const numeric = raw === "" ? Number.NaN : Number(raw);
      return { key, label, value: Number.isFinite(numeric) ? Math.max(0, Math.min(10, numeric)) : null };
    });
    const available = dimensions.filter(item => item.value != null);
    if (!available.length && !valueOf(source.note)) return "";
    const center = 110;
    const radius = 76;
    const point = (index, scale) => {
      const angle = (-90 + index * 60) * Math.PI / 180;
      return `${(center + Math.cos(angle) * radius * scale).toFixed(1)},${(center + Math.sin(angle) * radius * scale).toFixed(1)}`;
    };
    const complete = available.length === dimensions.length;
    const rings = [.25, .5, .75, 1].map(scale => `<polygon points="${dimensions.map((_, index) => point(index, scale)).join(" ")}" />`).join("");
    const axes = dimensions.map((_, index) => { const [x, y] = point(index, 1).split(","); return `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" />`; }).join("");
    const area = complete ? `<polygon class="report-radar-area" points="${dimensions.map((item, index) => point(index, item.value / 10)).join(" ")}" />` : "";
    const dots = complete ? dimensions.map((item, index) => { const [cx, cy] = point(index, item.value / 10).split(","); return `<circle cx="${cx}" cy="${cy}" r="4" />`; }).join("") : "";
    const labels = dimensions.map((item, index) => { const [x, y] = point(index, 1.26).split(","); return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${escape(item.label)}</text>`; }).join("");
    const radar = complete ? `<svg class="report-radar" viewBox="0 0 220 220" role="img" aria-label="六维机会诊断雷达图"><g class="report-radar-grid">${rings}${axes}</g>${area}<g class="report-radar-points">${dots}</g><g class="report-radar-labels">${labels}</g></svg>` : `<div class="report-radar-empty">部分维度待确认</div>`;
    const cards = dimensions.map(item => item.value == null ? "" : `<article aria-label="${escape(`${item.label}：${item.value}/10`)}"><span>${escape(item.label)}</span><b>${item.value}<small>/10</small></b><i style="--score:${item.value * 10}%"><em></em></i></article>`).join("");
    const note = valueOf(source.note);
    return `<div class="report-diagnosis-visual"><div class="report-radar-wrap">${radar}</div><div class="report-diagnosis-copy"><div class="report-diagnosis-list">${cards}</div>${note ? `<p class="report-diagnosis-note">${escape(note)}</p>` : ""}</div></div>`;
  }

  function opportunityPath(source) {
    const entries = [
      ["01", "外部信号", valueOf(source.signal)],
      ["02", "业务痛点", valueOf(source.pain)],
      ["03", "经营影响", valueOf(source.impact)],
      ["04", "腾讯云切入", valueOf(source.solution)],
      ["05", "客户确认问题", valueOf(source.question)],
    ].filter(([, , value]) => value);
    if (!entries.length) return "";
    const nodes = entries.map(([step, label, value], index) => `<article class="report-path-node"><small>${step}</small><b>${escape(label)}</b><p>${escape(value)}</p>${index < entries.length - 1 ? `<i aria-hidden="true">→</i>` : ""}</article>`).join("");
    return `<div class="report-opportunity-path" style="--path-count:${entries.length}">${nodes}</div>`;
  }

  function stageJourney(stages, currentStage, mascotSrc) {
    const items = array(stages).filter(item => item && item.key);
    if (!items.length) return "";
    const currentIndex = items.findIndex(item => item.key === currentStage);
    const mascot = clean(mascotSrc);
    const nodes = items.map((item, index) => `<div class="report-stage-node ${index < currentIndex ? "is-done" : ""} ${index === currentIndex ? "is-current" : ""}"><i></i>${index === currentIndex && mascot ? `<img class="report-stage-penguin" src="${escape(mascot)}" alt="Sales Buddy 企鹅位于当前阶段">` : ""}<span>${escape(item.label || item.key)}</span></div>`).join("");
    return `<div class="report-journey"><div class="report-journey-heading"><b>${escape(resolveLabel(items, currentStage) || "阶段待确认")}</b></div><div class="report-stage-track">${nodes}</div></div>`;
  }

  function reportGuide() {
    return `<div class="report-guide"><article><b>01</b><span>管理判断</span><small>先看结论和风险</small></article><article><b>02</b><span>客户事实</span><small>再看业务与组织</small></article><article><b>03</b><span>机会路径</span><small>理解为什么值得推进</small></article><article><b>04</b><span>行动与证据</span><small>最后确认下一步</small></article></div>`;
  }

  function recordCards(items, className, label) {
    const facts = uniqueRecords(items.map(clean).filter(Boolean), item => item.toLocaleLowerCase());
    const body = facts.map((item, index) => `<article><span>${String(index + 1).padStart(2, "0")}</span><div>${label ? `<small>${escape(label)}</small>` : ""}<p>${linked(item)}</p></div></article>`).join("");
    return body ? `<div class="report-record-cards ${className || ""}">${body}</div>` : "";
  }

  function branchTree(rootName, eyebrow, hint, branches, className) {
    const visible = branches.map(branch => ({
      ...branch,
      items: uniqueRecords(array(branch.items).filter(item => item && clean(item.value)), item => keyOf([item.label, item.value])),
    })).filter(branch => branch.items.length);
    if (!visible.length) return "";
    const branchHtml = visible.map((branch, index) => `<article class="report-market-branch report-market-${escape(branch.tone)}"><div class="report-market-group"><span>0${index + 1}</span><b>${escape(branch.title)}</b><small>${escape(branch.caption)}</small></div><div class="report-market-nodes">${branch.items.map(item => `<div class="report-market-node"><b>${escape(item.label)}</b><p>${linked(item.value)}</p></div>`).join("")}</div></article>`).join("");
    return `<div class="report-market-tree ${escape(className || "")}"><div class="report-market-core"><small>${escape(eyebrow)}</small><b>${escape(rootName || "客户")}</b><span>${escape(hint)}</span></div><div class="report-market-branches">${branchHtml}</div></div>`;
  }

  function marketTree(customerName, branches) {
    return branchTree(customerName || "客户机会", "OPPORTUNITY MAP", "问题 → 竞争 → 方案", branches, "report-opportunity-tree");
  }

  function organizationTree(people, paths, insights) {
    const entries = people.filter(person => [person.name, person.role, person.phone, person.wechat, person.email, person.note].some(value => clean(value))).map((person, index) => ({ person, key: clean(person.id) || `person-${index}`, parent: clean(person.pid) }));
    const byKey = new Map(entries.map(entry => [entry.key, entry]));
    const byParent = new Map();
    entries.forEach(entry => {
      if (!entry.parent || !byKey.has(entry.parent)) return;
      if (!byParent.has(entry.parent)) byParent.set(entry.parent, []);
      byParent.get(entry.parent).push(entry);
    });
    const roots = entries.filter(entry => !entry.parent || !byKey.has(entry.parent));
    const renderNode = (entry, visited = new Set()) => {
      if (!entry || visited.has(entry.key)) return "";
      const nextVisited = new Set(visited).add(entry.key);
      const person = entry.person;
      const name = valueOf(person.name) || valueOf(person.role) || "关键角色";
      const contacts = [
        person.phone ? `${clean(person.phone)}（${PHONE_TYPE_LABELS[clean(person.phoneType)] || "待核验"}）` : "",
        clean(person.wechat), clean(person.email),
      ].filter(Boolean).join(" · ");
      const parentEntry = byKey.get(entry.parent);
      const parentName = parentEntry ? valueOf(parentEntry.person.name) || valueOf(parentEntry.person.role) : "";
      const children = (byParent.get(entry.key) || []).map(child => renderNode(child, nextVisited)).join("");
      return `<div class="report-org-node"><article class="report-org-person"><span>${escape(name.slice(0, 1))}</span><div><small>${escape(LEVEL_LABELS[Number(person.level)] || "关键角色")}</small><b>${escape(name)}</b>${valueOf(person.role) && valueOf(person.role) !== name ? `<em>${escape(valueOf(person.role))}</em>` : ""}${parentName ? `<p class="report-org-parent">上级：${escape(parentName)}</p>` : ""}${contacts ? `<p>${escape(contacts)}</p>` : ""}${valueOf(person.note) ? `<p>${linked(valueOf(person.note))}</p>` : ""}</div></article>${children ? `<div class="report-org-children">${children}</div>` : ""}</div>`;
    };
    const nodes = (roots.length ? roots : entries).map(entry => renderNode(entry)).join("");
    const pathHtml = uniqueRecords(array(paths).map(clean).filter(Boolean), item => item.toLocaleLowerCase()).map(path => `<span>${escape(path)}</span>`).join("");
    const insightHtml = uniqueRecords(array(insights).map(clean).filter(Boolean), item => item.toLocaleLowerCase()).map(item => `<article>${linked(item)}</article>`).join("");
    if (!nodes && !pathHtml && !insightHtml) return "";
    return `<div class="report-org-tree">${pathHtml ? `<div class="report-org-paths">${pathHtml}</div>` : ""}${nodes ? `<div class="report-org-roots">${nodes}</div>` : ""}${insightHtml ? `<div class="report-org-insights">${insightHtml}</div>` : ""}</div>`;
  }

  function normalizedAsset(asset, context) {
    if (asset == null) return null;
    if (typeof asset !== "object") {
      const name = valueOf(asset);
      return name ? { name, type: "", caption: "", created: "", url: "", identifier: "", size: "" } : null;
    }
    const name = valueOf(asset.name || asset.fileName || asset.title);
    const type = resolveLabel(context.assetTypes, asset.type);
    const caption = valueOf(asset.caption || asset.description || asset.note);
    const created = format(asset.createdAt || asset.date || asset.created, context.formatDateTime);
    const locator = valueOf(asset.url || asset.fileUrl || asset.cloudPath);
    const identifier = locator || valueOf(asset.dataUrl || asset.fileID);
    if (!name && !caption && !identifier) return null;
    const url = locator || (!name && !caption ? identifier : "");
    const size = valueOf(asset.size);
    return { name, type, caption, created, url, identifier, size };
  }

  function decisionChains(people) {
    const byParent = new Map();
    const ids = new Set(people.map(person => clean(person.id)).filter(Boolean));
    people.forEach(person => {
      const parent = clean(person.pid);
      const bucket = byParent.get(parent) || [];
      bucket.push(person);
      byParent.set(parent, bucket);
    });
    const roots = people.filter(person => !clean(person.pid) || !ids.has(clean(person.pid)));
    const paths = [];
    function walk(person, path, visited) {
      const id = clean(person.id);
      if (id && visited.has(id)) return;
      const nextVisited = new Set(visited);
      if (id) nextVisited.add(id);
      const name = valueOf(person.name) || valueOf(person.role);
      const nextPath = name ? path.concat(name) : path;
      const children = id ? (byParent.get(id) || []) : [];
      if (!children.length && nextPath.length > 1) paths.push(nextPath);
      else children.forEach(child => walk(child, nextPath, nextVisited));
    }
    roots.forEach(root => walk(root, [], new Set()));
    return uniqueRecords(paths, path => keyOf(path)).map(path => `决策链：${path.join(" → ")}`);
  }

  function build(customer, options) {
    const source = customer && typeof customer === "object" ? customer : {};
    const context = options && typeof options === "object" ? options : {};
    const fields = source.fields && typeof source.fields === "object" ? source.fields : {};
    const raid = source.raidFile && typeof source.raidFile === "object" ? source.raidFile : {};
    const notes = array(source.notes).slice().sort((left, right) => rawText(right && right.date).localeCompare(rawText(left && left.date)));
    const pendingNotes = notes.filter(note => note && valueOf(note.next) && !note.taskDone);
    const painPoints = uniqueRecords(array(source.painPoints).map(valueOf).filter(Boolean), item => item.toLocaleLowerCase());
    const confirmations = source.guidedConfirmations && typeof source.guidedConfirmations === "object" ? source.guidedConfirmations : {};
    const diagnosisSource = source.opportunityDiagnosis && typeof source.opportunityDiagnosis === "object" ? source.opportunityDiagnosis : {};
    const businessBriefSource = source.businessBrief && typeof source.businessBrief === "object" ? source.businessBrief : {};
    const painChainSource = source.painChain && typeof source.painChain === "object" ? source.painChain : {};
    const negotiationSource = source.negotiationBrief && typeof source.negotiationBrief === "object" ? source.negotiationBrief : {};
    const fieldDefs = array(context.fieldDefs);

    const name = valueOf(source.name);
    const headingMeta = [
      resolveLabel(context.stages, source.stage),
      clean(source.grade) ? `${clean(source.grade)} 级客户` : "",
      clean(context.reportDate),
    ].filter(Boolean).map(item => `<span>${escape(item)}</span>`).join("");
    const website = valueOf(fields.website);
    const websiteHref = linkHref(website);
    const headingFacts = [
      ["行业", valueOf(fields.industry)],
      ["团队", valueOf(fields.staff)],
      ["融资", valueOf(fields.funding)],
      ["官网", websiteHref ? `<a href="${escape(websiteHref)}" target="_blank" rel="noopener noreferrer">${escape(website.replace(/^https?:\/\//i, ""))}</a>` : escape(website)],
    ].filter(([, value]) => value).map(([label, value]) => `<article><small>${escape(label)}</small><b>${value}</b></article>`).join("");
    const logoSrc = clean(context.logoSrc) || "assets/sales-buddy-logo-option-1.png";
    const heading = `<header class="report-heading"><div class="report-heading-brand"><span class="report-heading-logo"><img src="${escape(logoSrc)}" alt="Sales Buddy"></span><div class="report-heading-title"><small>CUSTOMER 360</small><b>客户全景报告</b></div></div><div class="report-heading-layout"><div class="report-heading-identity"><h1>${escape(name || "客户报告")}</h1>${headingMeta ? `<div class="report-heading-meta">${headingMeta}</div>` : ""}</div>${headingFacts ? `<div class="report-heading-facts">${headingFacts}</div>` : ""}</div></header>`;

    const nextAction = pendingNotes[0] && valueOf(pendingNotes[0].next)
      || valueOf(raid.plan && raid.plan.action);
    const journey = stageJourney(context.stages, source.stage, context.mascotSrc);
    const diagnosis = diagnosisVisual(diagnosisSource);

    const raidBasic = raid.basic && typeof raid.basic === "object" ? raid.basic : {};
    const raidDm = raid.dm && typeof raid.dm === "object" ? raid.dm : {};
    const profileExtras = [
      ["经营范围", valueOf(raidBasic.scope), "business"],
      ["商业模式", valueOf(raidBasic.model), "business"],
      ["市场分布", valueOf(raidBasic.market), "business"],
      ["当前触达", valueOf(raidDm.reachLevel), "sales"],
      ["合作态度", ATTITUDE_LABELS[valueOf(raidDm.attitude)] || valueOf(raidDm.attitude), "sales"],
      ["核心诉求", valueOf(raidDm.coreDemand), "sales"],
      ["主要顾虑", valueOf(raidDm.concern), "sales"],
      ["内部协同", valueOf(raid.competitor && raid.competitor.internal), "sales"],
      ["商务策略", valueOf(raid.solution && raid.solution.biz), "sales"],
      ["技术策略", valueOf(raid.solution && raid.solution.tech), "sales"],
    ];
    uniqueRecords(array(raid.scenes), scene => keyOf([
      valueOf(scene && scene.title), valueOf(scene && (scene.scene || scene.description)), valueOf(scene && scene.link),
    ])).forEach((scene, index) => {
      const sceneValue = describeParts([valueOf(scene.title), valueOf(scene.scene || scene.description), valueOf(scene.link)]);
      if (sceneValue) profileExtras.push([`业务场景 ${index + 1}`, sceneValue, "business"]);
    });
    const profile = profileTree(fieldDefs, fields, profileExtras, context.formatShortDate);

    const businessBrief = businessModelMap(businessBriefSource);

    const newsSignalNodes = [];
    uniqueRecords(array(source.marketNews).filter(Boolean), item => keyOf([
      valueOf(item.title), item.publishedAt, valueOf(item.market), valueOf(item.sourceUrl), valueOf(item.signal), valueOf(item.impact),
    ])).forEach(item => {
      const detail = describeParts([
        format(item.publishedAt, context.formatShortDate), valueOf(item.market),
        valueOf(item.signal), valueOf(item.impact), valueOf(item.sourceUrl),
      ]);
      if (detail) newsSignalNodes.push({ label: valueOf(item.title) || "市场新闻", value: detail });
    });
    const hiringSignalNodes = [];
    uniqueRecords(array(source.hiringSignals).filter(Boolean), item => keyOf([
      valueOf(item.role), item.postedAt, valueOf(item.location), valueOf(item.sourceUrl), valueOf(item.signal), valueOf(item.opportunity),
    ])).forEach(item => {
      const detail = describeParts([
        format(item.postedAt, context.formatShortDate), valueOf(item.location),
        valueOf(item.signal), valueOf(item.opportunity), valueOf(item.sourceUrl),
      ]);
      if (detail) hiringSignalNodes.push({ label: valueOf(item.role) || "招聘动向", value: detail });
    });
    const externalSignals = branchTree(name, "SIGNAL MAP", "市场变化 → 人才投入 → 销售机会", [
      { title: "全球新闻", caption: "MARKET", tone: "blue", items: newsSignalNodes },
      { title: "招聘动向", caption: "HIRING", tone: "cyan", items: hiringSignalNodes },
    ], "report-signal-tree");

    const researchEvidence = item => describeParts([
      SOURCE_LABELS[clean(item.source)] || "来源待补充",
      CONFIDENCE_LABELS[clean(item.confidence)] || "待核",
      item.verifiedAt ? `核验：${format(item.verifiedAt, context.formatShortDate)}` : "待核验",
      valueOf(item.sourceUrl),
    ]);
    const recordStatus = item => item?.verifiedAt && clean(item.confidence) !== "unverified" ? "已核实事实" : "待核线索";
    const biddingItems = uniqueRecords(array(source.bidding).filter(Boolean), item => keyOf([
      valueOf(item.project), valueOf(item.purchaser), valueOf(item.role), valueOf(item.amount), item.date, valueOf(item.sourceUrl), valueOf(item.signal),
    ])).map(item => describeParts([
      `${recordStatus(item)}：${valueOf(item.project)}`, valueOf(item.purchaser) ? `采购方：${valueOf(item.purchaser)}` : "",
      valueOf(item.role) ? `角色：${valueOf(item.role)}` : "", valueOf(item.amount) ? `金额：${valueOf(item.amount)}` : "",
      format(item.date, context.formatShortDate), valueOf(item.signal), researchEvidence(item),
    ]));
    const bidding = recordCards(biddingItems, "report-bidding-list", "招投标记录");
    const qualificationItems = uniqueRecords(array(source.qualifications).filter(Boolean), item => keyOf([
      valueOf(item.name), valueOf(item.type), valueOf(item.authority), item.validTo, valueOf(item.sourceUrl),
    ])).map(item => describeParts([
      `${recordStatus(item)}：${valueOf(item.name)}`, valueOf(item.type), valueOf(item.authority), item.validTo ? `有效至 ${format(item.validTo, context.formatShortDate)}` : "", researchEvidence(item),
    ]));
    const qualifications = recordCards(qualificationItems, "report-qualification-list", "资质文件");

    const painChainFacts = opportunityPath(painChainSource);
    const painChain = painChainFacts && painChainSource.inferred === true ? `<div class="report-inferred"><p>以下为销售假设与待确认问题，非已核实客户事实。</p>${painChainFacts}</div>` : "";
    const confirmedPainChain = painChainFacts && painChainSource.inferred !== true ? painChainFacts : "";

    const jointPlanItems = uniqueRecords(array(source.jointWorkPlan).filter(Boolean), item => keyOf([
      item.id, valueOf(item.title), valueOf(item.deliverable), valueOf(item.ourOwner), valueOf(item.customerOwner), item.dueDate, item.status,
    ])).sort((left, right) => rawText(left.dueDate).localeCompare(rawText(right.dueDate))).map(item => describeParts([
      format(item.dueDate, context.formatShortDate), valueOf(item.title), valueOf(item.deliverable),
      valueOf(item.ourOwner) ? `我方：${valueOf(item.ourOwner)}` : "",
      valueOf(item.customerOwner) ? `客户：${valueOf(item.customerOwner)}` : "",
      ({ todo: "待开始", doing: "进行中", done: "已完成" })[clean(item.status)] || "",
    ]));
    const jointWorkPlan = recordCards(jointPlanItems, "report-joint-plan", "双方协同节点");

    const negotiation = negotiationMap(negotiationSource);

    const people = uniqueRecords(array(source.orgChain).filter(person => person && typeof person === "object"), person => keyOf([
      person.id, person.pid, valueOf(person.name), valueOf(person.role), person.level,
      person.phone, person.phoneType, person.wechat, person.email, valueOf(person.note),
    ]));
    const orgInsights = [];
    const raidOrg = raid.org && typeof raid.org === "object" ? raid.org : {};
    if (valueOf(raidOrg.orgDesc)) orgInsights.push(valueOf(raidOrg.orgDesc));
    const roles = uniqueRecords(array(raid.roles).concat(array(raidOrg.roles)), role => keyOf([
      valueOf(role && role.name), valueOf(role && role.role), valueOf(role && role.position), valueOf(role && role.demand),
    ]));
    roles.forEach(role => {
      const detail = describeParts([valueOf(role.name), valueOf(role.role), valueOf(role.position), valueOf(role.demand)]);
      if (detail) orgInsights.push(detail);
    });
    const decisionProcess = valueOf(confirmations["confirm-power"] && confirmations["confirm-power"].note);
    if (decisionProcess) orgInsights.push(`决策流程确认：${decisionProcess}`);
    const organization = organizationTree(people, decisionChains(people), orgInsights);

    const painConfirmation = valueOf(confirmations["confirm-pain"] && confirmations["confirm-pain"].note);
    const competitors = uniqueRecords(array(raid.competitors).filter(Boolean), competitor => keyOf([
      valueOf(competitor.name), valueOf(competitor.coverage), valueOf(competitor.pros), valueOf(competitor.cons),
    ]));
    const competitorNodes = competitors.map((competitor, index) => ({
      label: valueOf(competitor.name) || `竞品 ${index + 1}`,
      value: [
        valueOf(competitor.coverage) ? `覆盖 ${valueOf(competitor.coverage)}` : "",
        valueOf(competitor.pros) ? `优势 ${valueOf(competitor.pros)}` : "",
        valueOf(competitor.cons) ? `劣势 ${valueOf(competitor.cons)}` : "",
      ].filter(Boolean).join("；") || "竞品信息待进一步核实",
    }));
    const solutions = uniqueRecords(array(source.solution), solution => keyOf([
      valueOf(solution && (solution.product || solution.name || solution.title || solution)),
      valueOf(solution && (solution.reason || solution.description || solution.detail)),
    ]));
    const inferredSolutionItems = solutions.filter(solution => solution?.inferred === true).map(solution => describeParts([
      valueOf(solution && (solution.product || solution.name || solution.title || solution)),
      valueOf(solution && (solution.reason || solution.description || solution.detail)),
    ], "：")).filter(Boolean);
    const confirmedSolutionNodes = solutions.filter(solution => solution?.inferred !== true).map((solution, index) => ({
      label: valueOf(solution && (solution.product || solution.name || solution.title || solution)) || `方案 ${index + 1}`,
      value: valueOf(solution && (solution.reason || solution.description || solution.detail)) || "已纳入客户匹配方案",
    }));
    const inferredSolutions = recordCards(inferredSolutionItems.map(item => `匹配方案：${item}`), "report-inferred-solutions", "待客户确认");
    const inferredSales = [painChain, inferredSolutions ? `<div class="report-inferred"><p>以下匹配方案为销售推测，需以客户确认的真实需求为准。</p>${inferredSolutions}</div>` : ""].filter(Boolean).join("");
    const painNodes = painPoints.map((item, index) => ({ label: `痛点 ${index + 1}`, value: item }));
    if (painConfirmation) painNodes.push({ label: "客户确认依据", value: painConfirmation });
    const market = marketTree(name, [
      { title: "客户痛点", caption: "WHY CHANGE", tone: "red", items: painNodes },
      { title: "竞品与替代", caption: "STATUS QUO", tone: "amber", items: competitorNodes },
      { title: "匹配方案", caption: "WHY US", tone: "green", items: confirmedSolutionNodes },
    ]);

    const progressItems = uniqueRecords(notes.filter(note => note && typeof note === "object"), note => keyOf([
      note.date, note.method, valueOf(note.contact), valueOf(note.place),
      valueOf(note.content || note.text || note.summary), valueOf(note.next), note.nextDate,
      Boolean(note.taskDone), ...array(note.attachments).map(attachment => keyOf([
        valueOf(attachment && (attachment.name || attachment.fileName || attachment.title || attachment)),
        valueOf(attachment && (attachment.caption || attachment.description)),
      ])),
    ])).map(note => {
      const when = format(note.date, context.formatDateTime);
      const method = resolveLabel(context.methods, note.method);
      const who = valueOf(note.contact);
      const place = valueOf(note.place);
      const content = valueOf(note.content || note.text || note.summary);
      const next = valueOf(note.next);
      const nextDate = format(note.nextDate, context.formatShortDate);
      const attachmentCount = array(note.attachments).map(item => normalizedAsset(item, context)).filter(Boolean).length;
      const hasFact = Boolean(who || place || content || next || attachmentCount);
      if (!hasFact) return "";
      const contextLine = describeParts([method, who, place]);
      const action = next ? `${note.taskDone ? "已完成" : "未完成"} · 下一步：${next}${nextDate ? ` · ${nextDate}` : ""}` : "";
      return `<article>${when ? `<time>${escape(when)}</time>` : ""}<div>${contextLine ? `<b>${escape(contextLine)}</b>` : ""}${content ? `<p>${escape(content)}</p>` : ""}${action ? `<small>${escape(action)}</small>` : ""}${attachmentCount ? `<p>相关材料：${attachmentCount} 件</p>` : ""}</div></article>`;
    }).filter(Boolean).join("");
    const progress = progressItems ? `<div class="report-progress">${progressItems}</div>` : "";

    const pendingItems = uniqueRecords(pendingNotes, note => keyOf([
      valueOf(note.next), note.nextDate, valueOf(note.contact),
    ])).map(note => describeParts([
      format(note.nextDate, context.formatShortDate), valueOf(note.next), valueOf(note.contact),
    ]));
    const pending = recordCards(pendingItems, "report-action-list", "待执行动作");

    const meetingPrepItems = uniqueRecords(array(source.meetingPreps).filter(Boolean), prep => keyOf([
      prep.id, prep.createdAt, prep.updatedAt, valueOf(prep.objective),
      ...array(prep.focus).map(valueOf), valueOf(prep.hook), valueOf(prep.notes),
    ])).sort((left, right) => rawText(right.updatedAt || right.createdAt).localeCompare(rawText(left.updatedAt || left.createdAt))).map(prep => {
      const when = format(prep.updatedAt || prep.createdAt, context.formatDateTime);
      const objective = valueOf(prep.objective);
      const focus = uniqueRecords(array(prep.focus).map(valueOf).filter(Boolean), item => item.toLocaleLowerCase());
      const hook = valueOf(prep.hook);
      const notesValue = valueOf(prep.notes);
      if (!objective && !focus.length && !hook && !notesValue) return "";
      return `<article>${when ? `<time>${escape(when)}</time>` : ""}<div>${objective ? `<b>${escape(objective)}</b>` : ""}${focus.length ? `<p>待确认信息：${escape(focus.join("；"))}</p>` : ""}${hook ? `<small>下次会议钩子：${escape(hook)}</small>` : ""}${notesValue ? `<p>销售补充：${escape(notesValue)}</p>` : ""}</div></article>`;
    }).filter(Boolean).join("");
    const meetingPreps = meetingPrepItems ? `<div class="report-progress report-meeting-preps">${meetingPrepItems}</div>` : "";

    const meetingReviewItems = uniqueRecords(array(source.meetingReviews).filter(Boolean), review => keyOf([
      review.id, review.prepId, review.createdAt, review.updatedAt, valueOf(review.summary),
      valueOf(review.confirmed), valueOf(review.hookResult), valueOf(review.next), review.nextDate,
    ])).sort((left, right) => rawText(right.updatedAt || right.createdAt).localeCompare(rawText(left.updatedAt || left.createdAt))).map(review => {
      const when = format(review.updatedAt || review.createdAt, context.formatDateTime);
      const summary = valueOf(review.summary);
      const confirmed = valueOf(review.confirmed);
      const hookResult = valueOf(review.hookResult);
      const next = valueOf(review.next);
      if (!summary && !confirmed && !hookResult && !next) return "";
      return `<article>${when ? `<time>${escape(when)}</time>` : ""}<div>${summary ? `<b>${escape(summary)}</b>` : ""}${confirmed ? `<p>确认事实：${escape(confirmed)}</p>` : ""}${hookResult ? `<p>钩子结果：${escape(hookResult)}</p>` : ""}${next ? `<small>下一步：${escape(next)}${review.nextDate ? ` · ${escape(format(review.nextDate, context.formatShortDate))}` : ""}</small>` : ""}</div></article>`;
    }).filter(Boolean).join("");
    const meetingReviews = meetingReviewItems ? `<div class="report-progress report-meeting-reviews">${meetingReviewItems}</div>` : "";

    const executionItems = uniqueRecords(array(source.stageHistory).filter(Boolean), history => keyOf([
      history.date, history.stage, valueOf(history.note),
    ])).map(history => {
      const detail = describeParts([
        format(history.date, context.formatDateTime), resolveLabel(context.stages, history.stage), valueOf(history.note),
      ]);
      return detail ? `阶段历史：${detail}` : "";
    });
    const goals = raid.goals && typeof raid.goals === "object" ? raid.goals : {};
    [
      ["3 个月目标", goals.g1], ["6 个月目标", goals.g2], ["长期目标", goals.g3],
      ["攻坚动作", raid.plan && raid.plan.action], ["支持事项", raid.plan && raid.plan.support],
    ].forEach(([label, value]) => {
      const fact = valueOf(value);
      if (fact) executionItems.push(`${label}：${fact}`);
    });
    const execution = recordCards(executionItems, "report-plan-list", "推进节点");

    const allAssets = array(source.assets).concat(notes.flatMap(note => array(note && note.attachments)));
    const assets = uniqueRecords(allAssets.map(asset => normalizedAsset(asset, context)).filter(Boolean), asset => keyOf([
      asset.name, asset.type, asset.caption, asset.created, asset.identifier, asset.size,
    ]));
    const evidence = recordCards(assets.map(asset => describeParts([
      asset.name, asset.type, asset.caption, asset.created, asset.url, asset.size,
    ])), "report-evidence-list", "证据材料");

    const summaryEntries = [
      ["当前判断", valueOf(fields.relation) || valueOf(raid.dm && raid.dm.reachLevel), "blue", "🧭"],
      ["核心机会", painPoints[0], "green", "✨"],
      ["主要风险", valueOf(raid.dm && raid.dm.concern) || valueOf(raid.plan && raid.plan.support), "red", "⚠️"],
      ["下一步行动", nextAction, "amber", "🚀"],
    ];
    const groups = [
      {
        title: "客户画像", icon: "👤", tone: "blue",
        items: [
          { title: "客户基本信息与情报", body: profile, kind: "tree", collapsed: true },
          { title: "产品与商业模式简报", body: businessBrief, kind: "cards" },
          { title: "外部市场与招聘信号", body: externalSignals, kind: "signals", collapsed: true },
          { title: "招投标 / 中标", body: bidding, kind: "records", collapsed: true },
          { title: "资质与许可", body: qualifications, kind: "records", collapsed: true },
        ],
      },
      {
        title: "机会判断", icon: "✨", tone: "amber",
        items: [
          { title: "六维机会诊断", body: diagnosis, kind: "diagnosis" },
          { title: "机会痛苦链", body: confirmedPainChain, kind: "path" },
          { title: "销售假设与待确认问题（非事实）", body: inferredSales, kind: "hypothesis", collapsed: true },
          { title: "痛点、竞品与匹配方案", body: market, kind: "market", collapsed: true },
          { title: "谈判与成交策略", body: negotiation, kind: "negotiation", collapsed: true },
        ],
      },
      {
        title: "关系与决策", icon: "🧑‍🤝‍🧑", tone: "violet",
        items: [
          { title: "组织与关键关系", body: organization, kind: "relationships" },
          { title: "会前沟通准备", body: meetingPreps, kind: "meeting", collapsed: true },
          { title: "会后确认", body: meetingReviews, kind: "meeting", collapsed: true },
        ],
      },
      {
        title: "推进与行动", icon: "🚀", tone: "green",
        items: [
          { title: "客户推进阶段", body: journey, kind: "journey" },
          { title: "全流程客户推进记录", body: progress, kind: "timeline", collapsed: true },
          { title: "当前未完成行动", body: pending, kind: "actions" },
          { title: "阶段历史、目标与攻坚计划", body: execution, kind: "plan", collapsed: true },
          { title: "联合工作计划", body: jointWorkPlan, kind: "plan", collapsed: true },
          { title: "材料与证据索引", body: evidence, kind: "evidence", collapsed: true },
        ],
      },
    ];
    const specs = groups.map(group => ({
      title: group.title,
      icon: group.icon,
      body: categoryBody(group.items),
      className: `report-category report-category--${group.tone}`,
      children: group.items.filter(item => item.body).map(item => ({ title: item.title, icon: SECTION_ICONS[item.title] || "✦", id: sectionMeta(item.title)[0] })),
    }));
    const sections = specs.map(spec => section(spec.title, spec.body, spec.className)).join("");
    const toc = reportToc(specs);
    const opening = openingSummary(summaryEntries);
    return heading + `<div class="report-body-layout">${toc}<div class="report-content">${opening}${panorama(name, groups)}<div class="report-main">${sections}</div></div></div>`;
  }

  function wrapHtml(html, options) {
    const config = options && typeof options === "object" ? options : {};
    const title = clean(config.title) || "客户全景报告";
    const description = clean(config.description) || title;
    const generatedAt = clean(config.generatedAt);
    const styles = String(config.styles == null ? "" : config.styles);
    const body = String(html == null ? "" : html);
    const footer = generatedAt
      ? `<footer class="report-export-footer">报告生成于 ${escape(generatedAt)} · 请结合最新客户沟通核验</footer>`
      : `<footer class="report-export-footer">请结合最新客户沟通核验</footer>`;
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; base-uri 'none'; form-action 'none'"><meta name="description" content="${escape(description)}"><title>${escape(title)}</title><style>${styles}</style></head><body class="report-export-page"><main class="report-document">${body}</main>${footer}</body></html>`;
  }

  return { build, wrapHtml };
});
