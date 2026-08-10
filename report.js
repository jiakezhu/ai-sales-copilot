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
  const CHANNEL_LABELS = { direct: "官网直客", longtail: "长尾", ka: "KA", region: "区域", partner: "渠道/合作伙伴" };
  const PHONE_TYPE_LABELS = { direct: "直联号码", agent: "代记账/第三方", unverified: "待核验" };
  const SECTION_META = {
    "执行摘要": ["summary", "blue"], "客户基本信息与情报": ["profile", "teal"], "客户准入与存量": ["admittance", "amber"],
    "产品与商业模式简报": ["business", "violet"], "外部市场与招聘信号": ["signals", "cyan"], "近期招投标 / 中标": ["bidding", "amber"],
    "资质与许可": ["qualifications", "teal"], "机会痛苦链": ["opportunity-path", "green"], "销售假设与待确认问题（非事实）": ["hypotheses", "amber"],
    "组织与关键关系": ["relationships", "violet"], "痛点、竞品与匹配方案": ["market", "green"], "会前沟通准备": ["meeting-prep", "blue"],
    "会后确认": ["meeting-review", "teal"], "全流程客户推进记录": ["progress", "blue"], "当前未完成行动": ["pending", "red"],
    "阶段历史、目标与攻坚计划": ["execution", "violet"], "联合工作计划": ["joint-plan", "green"], "谈判与成交策略": ["negotiation", "red"],
    "材料与证据索引": ["evidence", "slate"], "六维机会诊断": ["diagnosis", "violet"],
  };
  const PROFILE_GROUPS = [
    { key: "identity", label: "工商身份", icon: "企", fields: ["creditCode", "legalPerson", "regCapital", "regAddress", "founded", "website"] },
    { key: "scale", label: "规模与资本", icon: "资", fields: ["staff", "funding", "shareholders", "parentSubs"] },
    { key: "business", label: "产品与经营", icon: "营", fields: ["industry", "product", "businessModel", "dau", "revenue", "supplyChain"] },
    { key: "technology", label: "技术与云现状", icon: "云", fields: ["techStack", "cloudStatus", "billNote"] },
    { key: "signals", label: "市场信号与风险", icon: "势", fields: ["recentNews", "hiring", "triggerEvents", "riskNote"] },
    { key: "sales", label: "销售关系与策略", icon: "销", fields: ["relation"] },
  ];

  const escape = value => String(value == null ? "" : value).replace(/[&<>\"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[character]);
  const rawText = value => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const array = value => Array.isArray(value) ? value : [];

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

  function reportToc(specs) {
    const links = specs.filter(spec => spec.body).map(spec => {
      const [id, tone] = sectionMeta(spec.title);
      return `<a class="report-toc-link report-toc-${tone}" href="#report-${id}"><i></i><span>${escape(spec.title)}</span></a>`;
    }).join("");
    return links ? `<aside class="report-toc" aria-label="报告目录"><div class="report-toc-head"><b>目录</b><small>点击快速定位</small></div>${links}</aside>` : "";
  }

  function openingSummary(entries, mascotSrc) {
    const facts = entries.map(([label, value, tone]) => ({ label: clean(label), value: clean(value), tone })).filter(item => item.value).slice(0, 4);
    if (!facts.length) return "";
    const cards = facts.map(item => `<article class="report-summary-card report-summary-${item.tone || "blue"}"><small>${escape(item.label)}</small><p>${escape(item.value)}</p></article>`).join("");
    const mascot = clean(mascotSrc) ? `<img class="report-summary-mascot" src="${escape(mascotSrc)}" alt="Sales Buddy 企鹅助手">` : "";
    return `<section class="report-opening-summary"><div class="report-summary-copy"><span>EXECUTIVE SNAPSHOT</span><h2>一页看懂这家客户</h2><p>先看判断与行动，再下钻事实、机会和证据。</p></div>${mascot}<div class="report-summary-grid">${cards}</div></section>`;
  }

  function fieldGrid(entries, className) {
    const facts = uniqueRecords(entries.map(([label, value]) => [clean(label), clean(value)]), entry => keyOf(entry));
    const body = facts.map(([label, value]) => value
      ? `<div class="report-field"><span>${escape(label)}</span><p>${escape(value)}</p></div>`
      : "").join("");
    return body ? `<div class="${className || "report-field-grid"}">${body}</div>` : "";
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
      const leaves = unique.map(([label, value]) => `<article class="report-tree-leaf"><span>${escape(label)}</span><p>${escape(value)}</p></article>`).join("");
      return `<div class="report-tree-branch report-tree-${group.key}"><div class="report-tree-root"><i>${escape(group.icon)}</i><b>${escape(group.label)}</b><small>${unique.length} 项</small></div><div class="report-tree-leaves">${leaves}</div></div>`;
    }).filter(Boolean);
    const other = array(fieldDefs).filter(definition => definition && !groupedKeys.has(definition.key)).map(definition => {
      const value = fieldWithProvenance(fields[definition.key], formatter);
      return value ? [valueOf(definition.label || definition.key), value] : null;
    }).filter(Boolean);
    if (other.length) {
      const leaves = other.map(([label, value]) => `<article class="report-tree-leaf"><span>${escape(label)}</span><p>${escape(value)}</p></article>`).join("");
      branches.push(`<div class="report-tree-branch report-tree-other"><div class="report-tree-root"><i>补</i><b>补充信息</b><small>${other.length} 项</small></div><div class="report-tree-leaves">${leaves}</div></div>`);
    }
    return branches.length ? `<div class="report-profile-tree">${branches.join("")}</div>` : "";
  }

  function executiveMap(entries) {
    const facts = entries.map(([label, value]) => ({ label: clean(label), value: clean(value) })).filter(item => item.value);
    if (!facts.length) return "";
    const nodes = facts.map((item, index) => `<article class="report-mind-node report-mind-node--${index + 1}"><span>${escape(item.label)}</span><p>${escape(item.value)}</p></article>`).join("");
    const compact = facts.length < 4 ? " report-mindmap--compact" : "";
    return `<div class="report-mindmap${compact}"><div class="report-mindmap-core"><small>领导速览</small><b>客户推进主线</b><span>判断 · 机会 · 风险 · 行动</span></div>${nodes}</div>`;
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
    const cards = dimensions.map(item => item.value == null ? "" : `<li aria-label="${escape(`${item.label}：${item.value}/10`)}"><span>${escape(item.label)}</span><b>${item.value}<small>/10</small></b><i style="--score:${item.value * 10}%"><em></em></i></li>`).join("");
    const note = valueOf(source.note);
    return `<div class="report-diagnosis-visual"><div class="report-radar-wrap">${radar}</div><div class="report-diagnosis-copy"><ul class="report-diagnosis-list">${cards}</ul>${note ? `<p class="report-diagnosis-note">${escape(note)}</p>` : ""}</div></div>`;
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

  function stageJourney(stages, currentStage) {
    const items = array(stages).filter(item => item && item.key);
    if (!items.length) return "";
    const currentIndex = items.findIndex(item => item.key === currentStage);
    const nodes = items.map((item, index) => `<div class="report-stage-node ${index < currentIndex ? "is-done" : ""} ${index === currentIndex ? "is-current" : ""}"><i></i><span>${escape(item.label || item.key)}</span></div>`).join("");
    return `<div class="report-journey"><div class="report-journey-heading"><small>推进导航</small><b>${escape(resolveLabel(items, currentStage) || "阶段待确认")}</b></div><div class="report-stage-track">${nodes}</div></div>`;
  }

  function reportGuide() {
    return `<div class="report-guide"><article><b>01</b><span>管理判断</span><small>先看结论和风险</small></article><article><b>02</b><span>客户事实</span><small>再看业务与组织</small></article><article><b>03</b><span>机会路径</span><small>理解为什么值得推进</small></article><article><b>04</b><span>行动与证据</span><small>最后确认下一步</small></article></div>`;
  }

  function list(items, className) {
    const facts = uniqueRecords(items.map(clean).filter(Boolean), item => item.toLocaleLowerCase());
    const body = facts.map(item => `<li>${escape(item)}</li>`).join("");
    return body ? `<ul class="${className || "report-list"}">${body}</ul>` : "";
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
    const heading = `<header class="report-heading"><p>客户全景报告</p><h1>${escape(name || "客户报告")}</h1>${headingMeta ? `<div>${headingMeta}</div>` : ""}</header>`;

    const nextAction = pendingNotes[0] && valueOf(pendingNotes[0].next)
      || valueOf(raid.plan && raid.plan.action);
    const executive = executiveMap([
      ["当前判断", valueOf(fields.relation) || valueOf(raid.dm && raid.dm.reachLevel)],
      ["核心机会", painPoints[0]],
      ["主要风险", valueOf(raid.dm && raid.dm.concern) || valueOf(raid.plan && raid.plan.support)],
      ["下一步行动", nextAction],
    ]);
    const journey = stageJourney(context.stages, source.stage);
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

    const admittanceSource = source.admittance && typeof source.admittance === "object" ? source.admittance : {};
    const hasAdmittance = ["status", "reportedBy", "channel", "uin", "groupGid", "source", "verifiedAt"].some(key => valueOf(admittanceSource[key]));
    const admittanceVerified = Boolean(admittanceSource.verifiedAt) && ["clear", "reported", "followed"].includes(clean(admittanceSource.status));
    const admittanceStatus = admittanceVerified ? ({ clear: "无主报备", reported: "已报备", followed: "已有人跟" })[clean(admittanceSource.status)] : "待核";
    const admittance = hasAdmittance ? fieldGrid([
      ["准入核验状态", admittanceStatus],
      ["主商务 / 报备人", valueOf(admittanceSource.reportedBy)],
      ["归属通路", CHANNEL_LABELS[clean(admittanceSource.channel)] || "待核"],
      ["腾讯云 UIN", valueOf(admittanceSource.uin)],
      ["集团 GID", valueOf(admittanceSource.groupGid)],
      ["来源", SOURCE_LABELS[clean(admittanceSource.source)] || "来源待补充"],
      ["置信度", CONFIDENCE_LABELS[clean(admittanceSource.confidence)] || "待核"],
      ["核验日期", format(admittanceSource.verifiedAt, context.formatShortDate)],
      ["核验说明", admittanceVerified ? "该状态已完成核验" : "待核验，不构成准入结论"],
    ]) : "";

    const businessBrief = fieldGrid([
      ["核心产品或服务", valueOf(businessBriefSource.products)],
      ["赚钱逻辑", valueOf(businessBriefSource.revenueLogic)],
      ["经营状况", valueOf(businessBriefSource.operatingStatus)],
      ["相似竞品", valueOf(businessBriefSource.competitors)],
      ["可能的业务痛点", valueOf(businessBriefSource.painHypothesis)],
    ]);

    const externalSignalItems = [];
    uniqueRecords(array(source.marketNews).filter(Boolean), item => keyOf([
      valueOf(item.title), item.publishedAt, valueOf(item.market), valueOf(item.sourceUrl), valueOf(item.signal), valueOf(item.impact),
    ])).forEach(item => {
      const detail = describeParts([
        valueOf(item.title), format(item.publishedAt, context.formatShortDate), valueOf(item.market),
        valueOf(item.signal), valueOf(item.impact), valueOf(item.sourceUrl),
      ]);
      if (detail) externalSignalItems.push(`全球新闻：${detail}`);
    });
    uniqueRecords(array(source.hiringSignals).filter(Boolean), item => keyOf([
      valueOf(item.role), item.postedAt, valueOf(item.location), valueOf(item.sourceUrl), valueOf(item.signal), valueOf(item.opportunity),
    ])).forEach(item => {
      const detail = describeParts([
        valueOf(item.role), format(item.postedAt, context.formatShortDate), valueOf(item.location),
        valueOf(item.signal), valueOf(item.opportunity), valueOf(item.sourceUrl),
      ]);
      if (detail) externalSignalItems.push(`招聘动向：${detail}`);
    });
    const externalSignals = list(externalSignalItems, "report-external-signals");

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
    const bidding = list(biddingItems, "report-bidding-list");
    const qualificationItems = uniqueRecords(array(source.qualifications).filter(Boolean), item => keyOf([
      valueOf(item.name), valueOf(item.type), valueOf(item.authority), item.validTo, valueOf(item.sourceUrl),
    ])).map(item => describeParts([
      `${recordStatus(item)}：${valueOf(item.name)}`, valueOf(item.type), valueOf(item.authority), item.validTo ? `有效至 ${format(item.validTo, context.formatShortDate)}` : "", researchEvidence(item),
    ]));
    const qualifications = list(qualificationItems, "report-qualification-list");

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
    const jointWorkPlan = list(jointPlanItems, "report-joint-plan");

    const negotiation = fieldGrid([
      ["目标结果", valueOf(negotiationSource.objective)],
      ["客户当前立场", valueOf(negotiationSource.customerPosition)],
      ["价值锚点", valueOf(negotiationSource.valueAnchor)],
      ["必须守住", valueOf(negotiationSource.mustHave)],
      ["可以交换", valueOf(negotiationSource.flexible)],
      ["交换条件", valueOf(negotiationSource.giveGet)],
      ["红线", valueOf(negotiationSource.redLine)],
      ["主要异议", valueOf(negotiationSource.objections)],
      ["回应策略", valueOf(negotiationSource.response)],
      ["本轮收口动作", valueOf(negotiationSource.closeAction)],
    ], "report-field-grid report-negotiation");

    const people = uniqueRecords(array(source.orgChain).filter(person => person && typeof person === "object"), person => keyOf([
      person.id, person.pid, valueOf(person.name), valueOf(person.role), person.level,
      person.phone, person.phoneType, person.wechat, person.email, valueOf(person.note),
    ]));
    const peopleById = new Map(people.map(person => [clean(person.id), person]).filter(([id]) => id));
    const orgItems = decisionChains(people);
    people.forEach(person => {
      const parentId = clean(person.pid);
      const parent = parentId ? peopleById.get(parentId) : null;
      const contacts = [
        person.phone ? `${clean(person.phone)}（${PHONE_TYPE_LABELS[clean(person.phoneType)] || "待核验"}）` : "",
        person.wechat, person.email,
      ].map(clean).filter(Boolean).join(" · ");
      const detail = describeParts([
        valueOf(person.name), valueOf(person.role), LEVEL_LABELS[Number(person.level)] || "",
        parent ? `上级：${valueOf(parent.name) || valueOf(parent.role)}` : "", contacts, valueOf(person.note),
      ]);
      if (detail) orgItems.push(detail);
    });
    const raidOrg = raid.org && typeof raid.org === "object" ? raid.org : {};
    if (valueOf(raidOrg.orgDesc)) orgItems.push(valueOf(raidOrg.orgDesc));
    const roles = uniqueRecords(array(raid.roles).concat(array(raidOrg.roles)), role => keyOf([
      valueOf(role && role.name), valueOf(role && role.role), valueOf(role && role.position), valueOf(role && role.demand),
    ]));
    roles.forEach(role => {
      const detail = describeParts([valueOf(role.name), valueOf(role.role), valueOf(role.position), valueOf(role.demand)]);
      if (detail) orgItems.push(detail);
    });
    const decisionProcess = valueOf(confirmations["confirm-power"] && confirmations["confirm-power"].note);
    if (decisionProcess) orgItems.push(`决策流程确认：${decisionProcess}`);
    const organization = list(orgItems, "report-relation-list");

    const marketItems = painPoints.map(item => `客户痛点：${item}`);
    const painConfirmation = valueOf(confirmations["confirm-pain"] && confirmations["confirm-pain"].note);
    if (painConfirmation) marketItems.push(`客户确认依据：${painConfirmation}`);
    const competitors = uniqueRecords(array(raid.competitors).filter(Boolean), competitor => keyOf([
      valueOf(competitor.name), valueOf(competitor.coverage), valueOf(competitor.pros), valueOf(competitor.cons),
    ]));
    competitors.forEach(competitor => {
      const detail = [
        valueOf(competitor.name),
        valueOf(competitor.coverage) ? `覆盖 ${valueOf(competitor.coverage)}` : "",
        valueOf(competitor.pros) ? `优势 ${valueOf(competitor.pros)}` : "",
        valueOf(competitor.cons) ? `劣势 ${valueOf(competitor.cons)}` : "",
      ].filter(Boolean).join("；");
      if (detail) marketItems.push(`竞品：${detail}`);
    });
    const solutions = uniqueRecords(array(source.solution), solution => keyOf([
      valueOf(solution && (solution.product || solution.name || solution.title || solution)),
      valueOf(solution && (solution.reason || solution.description || solution.detail)),
    ]));
    const inferredSolutionItems = solutions.filter(solution => solution?.inferred === true).map(solution => describeParts([
      valueOf(solution && (solution.product || solution.name || solution.title || solution)),
      valueOf(solution && (solution.reason || solution.description || solution.detail)),
    ], "：")).filter(Boolean);
    const confirmedSolutionItems = solutions.filter(solution => solution?.inferred !== true).map(solution => describeParts([
      valueOf(solution && (solution.product || solution.name || solution.title || solution)),
      valueOf(solution && (solution.reason || solution.description || solution.detail)),
    ], "：")).filter(Boolean);
    confirmedSolutionItems.forEach(item => marketItems.push(`匹配方案：${item}`));
    const inferredSolutions = list(inferredSolutionItems.map(item => `匹配方案：${item}`), "report-inferred-solutions");
    const inferredSales = [painChain, inferredSolutions ? `<div class="report-inferred"><p>以下匹配方案为销售推测，需以客户确认的真实需求为准。</p>${inferredSolutions}</div>` : ""].filter(Boolean).join("");
    const market = list(marketItems);

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
    const pending = list(pendingItems, "report-action-list");

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
    const execution = list(executionItems, "report-plan-list");

    const allAssets = array(source.assets).concat(notes.flatMap(note => array(note && note.attachments)));
    const assets = uniqueRecords(allAssets.map(asset => normalizedAsset(asset, context)).filter(Boolean), asset => keyOf([
      asset.name, asset.type, asset.caption, asset.created, asset.identifier, asset.size,
    ]));
    const evidence = list(assets.map(asset => describeParts([
      asset.name, asset.type, asset.caption, asset.created, asset.url, asset.size,
    ])), "report-evidence-list");

    const summaryEntries = [
      ["当前判断", valueOf(fields.relation) || valueOf(raid.dm && raid.dm.reachLevel), "blue"],
      ["核心机会", painPoints[0], "green"],
      ["主要风险", valueOf(raid.dm && raid.dm.concern) || valueOf(raid.plan && raid.plan.support), "red"],
      ["下一步行动", nextAction, "amber"],
    ];
    const specs = [
      { title: "执行摘要", body: executive, className: "report-executive" },
      { title: "客户基本信息与情报", body: profile },
      { title: "客户准入与存量", body: admittance },
      { title: "产品与商业模式简报", body: businessBrief },
      { title: "外部市场与招聘信号", body: externalSignals },
      { title: "近期招投标 / 中标", body: bidding },
      { title: "资质与许可", body: qualifications },
      { title: "机会痛苦链", body: confirmedPainChain },
      { title: "销售假设与待确认问题（非事实）", body: inferredSales },
      { title: "组织与关键关系", body: organization },
      { title: "痛点、竞品与匹配方案", body: market },
      { title: "会前沟通准备", body: meetingPreps },
      { title: "会后确认", body: meetingReviews },
      { title: "全流程客户推进记录", body: progress },
      { title: "当前未完成行动", body: pending },
      { title: "阶段历史、目标与攻坚计划", body: execution },
      { title: "联合工作计划", body: jointWorkPlan },
      { title: "谈判与成交策略", body: negotiation },
      { title: "材料与证据索引", body: evidence },
      { title: "六维机会诊断", body: diagnosis, className: "report-diagnosis-section" },
    ];
    const sections = specs.map(spec => section(spec.title, spec.body, spec.className)).join("");
    const toc = reportToc(specs);
    const opening = openingSummary(summaryEntries, context.mascotSrc);
    return heading + opening + reportGuide() + journey + `<div class="report-body-layout">${toc}<div class="report-main">${sections}</div></div>`;
  }

  function wrapWord(html, styles) {
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>${String(styles == null ? "" : styles)}</style></head><body>${String(html == null ? "" : html)}</body></html>`;
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

  return { build, wrapWord, wrapHtml };
});
