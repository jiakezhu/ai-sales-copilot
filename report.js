(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReportBuilder = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const escape = value => String(value == null ? "" : value).replace(/[&<>\"]/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[character]);
  const text = value => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const array = value => Array.isArray(value) ? value : [];

  function valueOf(value) {
    if (value == null) return "";
    if (typeof value !== "object") return text(value);
    for (const key of ["v", "value", "text", "content", "name", "label"]) {
      const candidate = text(value[key]);
      if (candidate) return candidate;
    }
    return "";
  }

  function resolveLabel(items, key) {
    const match = array(items).find(item => item && item.key === key);
    return text(match && match.label) || text(key);
  }

  function format(value, formatter) {
    const source = text(value);
    if (!source) return "";
    if (typeof formatter !== "function") return source;
    try { return text(formatter(value)) || source; } catch (_) { return source; }
  }

  function createLedger() {
    const emitted = new Set();
    return function unique(value) {
      const fact = text(value);
      if (!fact) return "";
      const key = fact.toLocaleLowerCase();
      if (emitted.has(key)) return "";
      emitted.add(key);
      return fact;
    };
  }

  function section(title, body, className) {
    if (!body) return "";
    const classes = ["report-section", className].filter(Boolean).join(" ");
    return `<section class="${classes}"><div class="report-section-title"><h2>${escape(title)}</h2></div>${body}</section>`;
  }

  function fieldGrid(entries, unique, className) {
    const body = entries.map(([label, value]) => {
      const fact = unique(value);
      return fact ? `<div class="report-field"><span>${escape(label)}</span><p>${escape(fact)}</p></div>` : "";
    }).join("");
    return body ? `<div class="${className || "report-data-grid"}">${body}</div>` : "";
  }

  function list(items, unique, className) {
    const body = items.map(item => {
      const fact = unique(item);
      return fact ? `<li>${escape(fact)}</li>` : "";
    }).join("");
    return body ? `<ul class="${className || "report-list"}">${body}</ul>` : "";
  }

  function preparedList(items, className) {
    const body = items.map(text).filter(Boolean).map(item => `<li>${escape(item)}</li>`).join("");
    return body ? `<ul class="${className || "report-list"}">${body}</ul>` : "";
  }

  function describeParts(parts) {
    return parts.map(text).filter(Boolean).join(" · ");
  }

  function uniqueParts(parts, unique, separator) {
    return parts.map(unique).filter(Boolean).join(separator || " · ");
  }

  function build(customer, options) {
    const source = customer && typeof customer === "object" ? customer : {};
    const context = options && typeof options === "object" ? options : {};
    const fields = source.fields && typeof source.fields === "object" ? source.fields : {};
    const raid = source.raidFile && typeof source.raidFile === "object" ? source.raidFile : {};
    const unique = createLedger();
    const notes = array(source.notes).slice().sort((left, right) => text(right && right.date).localeCompare(text(left && left.date)));
    const pendingNotes = notes.filter(note => note && valueOf(note.next) && !note.taskDone);
    const painPoints = array(source.painPoints).map(valueOf).filter(Boolean);
    const solutions = array(source.solution);
    const fieldDefs = array(context.fieldDefs);

    const headingMeta = [
      resolveLabel(context.stages, source.stage),
      text(source.grade) ? `${text(source.grade)} 级客户` : "",
      text(context.reportDate),
    ].filter(Boolean).map(item => `<span>${escape(item)}</span>`).join("");
    const heading = `<header class="report-cover"><p class="report-type">客户全景报告</p><h1>${escape(valueOf(source.name))}</h1>${headingMeta ? `<div class="report-cover-meta">${headingMeta}</div>` : ""}</header>`;

    const executive = fieldGrid([
      ["当前判断", valueOf(fields.relation) || valueOf(raid.dm && raid.dm.reachLevel)],
      ["核心机会", painPoints[0]],
      ["主要风险", valueOf(raid.dm && raid.dm.concern) || valueOf(raid.plan && raid.plan.support)],
    ], unique, "report-summary-grid");

    const profileEntries = fieldDefs.map(definition => [
      definition && definition.label,
      valueOf(fields[definition && definition.key]),
    ]);
    const raidBasic = raid.basic && typeof raid.basic === "object" ? raid.basic : {};
    const raidDm = raid.dm && typeof raid.dm === "object" ? raid.dm : {};
    profileEntries.push(
      ["经营范围", valueOf(raidBasic.scope)],
      ["商业模式", valueOf(raidBasic.model)],
      ["市场分布", valueOf(raidBasic.market)],
      ["当前触达", valueOf(raidDm.reachLevel)],
      ["合作态度", valueOf(raidDm.attitude)],
      ["核心诉求", valueOf(raidDm.coreDemand)],
      ["主要顾虑", valueOf(raidDm.concern)],
      ["内部协同", valueOf(raid.competitor && raid.competitor.internal)],
      ["商务策略", valueOf(raid.solution && raid.solution.biz)],
      ["技术策略", valueOf(raid.solution && raid.solution.tech)],
    );
    array(raid.scenes).forEach((scene, index) => {
      const sceneValue = describeParts([valueOf(scene && scene.title), valueOf(scene && (scene.scene || scene.description)), valueOf(scene && scene.link)]);
      profileEntries.push([`业务场景 ${index + 1}`, sceneValue]);
    });
    const profile = fieldGrid(profileEntries, unique);

    const orgItems = [];
    array(source.orgChain).forEach(person => {
      if (!person || typeof person !== "object") return;
      const contacts = [person.phone, person.wechat, person.email].map(text).filter(Boolean).join(" · ");
      const detail = uniqueParts([valueOf(person.name), valueOf(person.role), contacts, valueOf(person.note)], unique);
      if (detail) orgItems.push(detail);
    });
    const raidOrg = raid.org && typeof raid.org === "object" ? raid.org : {};
    if (unique(valueOf(raidOrg.orgDesc))) orgItems.push(valueOf(raidOrg.orgDesc));
    const roles = array(raid.roles).concat(array(raidOrg.roles));
    roles.forEach(role => {
      if (!role || typeof role !== "object") return;
      const detail = uniqueParts([
        valueOf(role.name), valueOf(role.role), valueOf(role.position), valueOf(role.demand),
      ], unique);
      if (detail) orgItems.push(detail);
    });
    const organization = preparedList(orgItems, "report-relation-list");

    const marketItems = [];
    painPoints.forEach(item => {
      const fact = unique(item);
      if (fact) marketItems.push(`客户痛点：${fact}`);
    });
    array(raid.competitors).forEach(competitor => {
      if (!competitor || typeof competitor !== "object") return;
      const detail = [
        valueOf(competitor.name),
        valueOf(competitor.coverage) ? `覆盖 ${valueOf(competitor.coverage)}` : "",
        valueOf(competitor.pros) ? `优势 ${valueOf(competitor.pros)}` : "",
        valueOf(competitor.cons) ? `劣势 ${valueOf(competitor.cons)}` : "",
      ].map(unique).filter(Boolean).join("；");
      if (detail) marketItems.push(`竞品：${detail}`);
    });
    solutions.forEach(solution => {
      const name = valueOf(solution && (solution.product || solution.name || solution.title || solution));
      const reason = valueOf(solution && (solution.reason || solution.description || solution.detail));
      const detail = uniqueParts([name, reason], unique, "：");
      if (detail) marketItems.push(`匹配方案：${detail}`);
    });
    const market = preparedList(marketItems);

    const progressItems = notes.map(note => {
      if (!note || typeof note !== "object") return "";
      const when = format(note.date, context.formatDateTime);
      const method = resolveLabel(context.methods, note.method);
      const who = valueOf(note.contact);
      const place = valueOf(note.place);
      const content = unique(valueOf(note.content || note.text || note.summary));
      const completedFact = note.taskDone ? unique(valueOf(note.next)) : "";
      const completedAction = completedFact
        ? `已完成：${completedFact}${format(note.nextDate, context.formatShortDate) ? `（${format(note.nextDate, context.formatShortDate)}）` : ""}`
        : "";
      const details = [describeParts([method, who, place]), content, completedAction].filter(Boolean);
      if (!details.length) return "";
      return `<article><time>${escape(when)}</time><div>${details.map((detail, index) => index === 0 ? `<b>${escape(detail)}</b>` : `<p>${escape(detail)}</p>`).join("")}</div></article>`;
    }).filter(Boolean).join("");
    const progress = progressItems ? `<div class="report-timeline">${progressItems}</div>` : "";

    const pending = list(pendingNotes.map(note => {
      const due = format(note.nextDate, context.formatShortDate);
      return describeParts([due, valueOf(note.next), valueOf(note.contact)]);
    }), unique, "report-action-list");

    const executionItems = [];
    array(source.stageHistory).forEach(history => {
      if (!history || typeof history !== "object") return;
      const item = describeParts([
        format(history.date, context.formatDateTime),
        resolveLabel(context.stages, history.stage),
        valueOf(history.note),
      ]);
      if (item) executionItems.push(`阶段历史：${item}`);
    });
    const goals = raid.goals && typeof raid.goals === "object" ? raid.goals : {};
    [
      ["3 个月目标", goals.g1], ["6 个月目标", goals.g2], ["长期目标", goals.g3],
      ["攻坚动作", raid.plan && raid.plan.action], ["支持事项", raid.plan && raid.plan.support],
    ].forEach(([label, value]) => {
      const fact = unique(valueOf(value));
      if (fact) executionItems.push(`${label}：${fact}`);
    });
    const execution = preparedList(executionItems, "report-plan-list");

    const evidenceItems = array(source.assets).map(asset => {
      if (!asset || typeof asset !== "object") return valueOf(asset);
      const name = unique(valueOf(asset.name || asset.fileName || asset.title));
      const type = resolveLabel(context.assetTypes, asset.type);
      const caption = unique(valueOf(asset.caption || asset.description || asset.note));
      const created = format(asset.createdAt || asset.date || asset.created, context.formatDateTime);
      return describeParts([name, type, caption, created]);
    });
    const evidence = preparedList(evidenceItems, "report-evidence-list");

    return heading
      + section("执行摘要", executive, "report-executive")
      + section("客户基本信息与情报", profile)
      + section("组织与关键关系", organization)
      + section("痛点、竞品与匹配方案", market)
      + section("全流程客户推进记录", progress, "page-break")
      + section("当前未完成行动", pending)
      + section("阶段历史、目标与攻坚计划", execution)
      + section("材料与证据索引", evidence);
  }

  function wrapWord(html) {
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"></head><body>${String(html == null ? "" : html)}</body></html>`;
  }

  return { build, wrapWord };
});
