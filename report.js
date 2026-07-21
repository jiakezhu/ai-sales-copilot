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
  const SOURCE_LABELS = { customer: "客户自报", website: "官网", qcc: "企查查", tyc: "天眼查", web: "全网检索", panshi: "磐石" };
  const CONFIDENCE_LABELS = { unverified: "待核", high: "高置信", medium: "中置信", low: "低置信" };
  const CHANNEL_LABELS = { direct: "官网直客", longtail: "长尾", ka: "KA", region: "区域", partner: "渠道/合作伙伴" };
  const PHONE_TYPE_LABELS = { direct: "直联号码", agent: "代记账/第三方", unverified: "待核验" };

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

  function section(title, body, className) {
    if (!body) return "";
    const classes = ["report-section", className].filter(Boolean).join(" ");
    return `<section class="${classes}"><div class="report-section-title"><h2>${escape(title)}</h2></div>${body}</section>`;
  }

  function fieldGrid(entries, className) {
    const facts = uniqueRecords(entries.map(([label, value]) => [clean(label), clean(value)]), entry => keyOf(entry));
    const body = facts.map(([label, value]) => value
      ? `<div class="report-field"><span>${escape(label)}</span><p>${escape(value)}</p></div>`
      : "").join("");
    return body ? `<div class="${className || "report-field-grid"}">${body}</div>` : "";
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
    const executive = fieldGrid([
      ["当前判断", valueOf(fields.relation) || valueOf(raid.dm && raid.dm.reachLevel)],
      ["核心机会", painPoints[0]],
      ["主要风险", valueOf(raid.dm && raid.dm.concern) || valueOf(raid.plan && raid.plan.support)],
      ["下一步行动", nextAction],
    ], "report-field-grid report-field-grid--summary");

    const diagnosisLabels = { pain: "痛苦", power: "权力", vision: "构想", value: "价值", control: "控制", milestone: "里程碑" };
    const diagnosisItems = Object.entries(diagnosisLabels).map(([key, label]) => {
      const numeric = Number(diagnosisSource[key]);
      return Number.isFinite(numeric) ? `${label}：${Math.max(0, Math.min(10, numeric))}/10` : "";
    });
    if (valueOf(diagnosisSource.note)) diagnosisItems.push(`诊断备注：${valueOf(diagnosisSource.note)}`);
    const diagnosis = list(diagnosisItems, "report-diagnosis-list");

    const profileEntries = fieldDefs.map(definition => [
      valueOf(definition && (definition.label || definition.key)),
      fieldWithProvenance(fields[definition && definition.key], context.formatShortDate),
    ]);
    const raidBasic = raid.basic && typeof raid.basic === "object" ? raid.basic : {};
    const raidDm = raid.dm && typeof raid.dm === "object" ? raid.dm : {};
    profileEntries.push(
      ["经营范围", valueOf(raidBasic.scope)],
      ["商业模式", valueOf(raidBasic.model)],
      ["市场分布", valueOf(raidBasic.market)],
      ["当前触达", valueOf(raidDm.reachLevel)],
      ["合作态度", ATTITUDE_LABELS[valueOf(raidDm.attitude)] || valueOf(raidDm.attitude)],
      ["核心诉求", valueOf(raidDm.coreDemand)],
      ["主要顾虑", valueOf(raidDm.concern)],
      ["内部协同", valueOf(raid.competitor && raid.competitor.internal)],
      ["商务策略", valueOf(raid.solution && raid.solution.biz)],
      ["技术策略", valueOf(raid.solution && raid.solution.tech)],
    );
    uniqueRecords(array(raid.scenes), scene => keyOf([
      valueOf(scene && scene.title), valueOf(scene && (scene.scene || scene.description)), valueOf(scene && scene.link),
    ])).forEach((scene, index) => {
      const sceneValue = describeParts([valueOf(scene.title), valueOf(scene.scene || scene.description), valueOf(scene.link)]);
      if (sceneValue) profileEntries.push([`业务场景 ${index + 1}`, sceneValue]);
    });
    const profile = fieldGrid(profileEntries);

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

    const painChainFacts = fieldGrid([
      ["外部或经营信号", valueOf(painChainSource.signal)],
      ["业务痛点", valueOf(painChainSource.pain)],
      ["经营影响", valueOf(painChainSource.impact)],
      ["腾讯云切入点", valueOf(painChainSource.solution)],
      ["客户确认问题", valueOf(painChainSource.question)],
    ], "report-field-grid report-pain-chain");
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

    return heading
      + section("执行摘要", executive, "report-executive")
      + section("六维机会诊断", diagnosis)
      + section("客户基本信息与情报", profile)
      + section("客户准入与存量", admittance)
      + section("产品与商业模式简报", businessBrief)
      + section("外部市场与招聘信号", externalSignals)
      + section("近期招投标 / 中标", bidding)
      + section("资质与许可", qualifications)
      + section("机会痛苦链", confirmedPainChain)
      + section("销售假设与待确认问题（非事实）", inferredSales)
      + section("组织与关键关系", organization)
      + section("痛点、竞品与匹配方案", market)
      + section("会前沟通准备", meetingPreps)
      + section("会后确认", meetingReviews)
      + section("全流程客户推进记录", progress)
      + section("当前未完成行动", pending)
      + section("阶段历史、目标与攻坚计划", execution)
      + section("联合工作计划", jointWorkPlan)
      + section("谈判与成交策略", negotiation)
      + section("材料与证据索引", evidence);
  }

  function wrapWord(html, styles) {
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>${String(styles == null ? "" : styles)}</style></head><body>${String(html == null ? "" : html)}</body></html>`;
  }

  return { build, wrapWord };
});
