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
    return body ? `<div class="${className || "report-data-grid"}">${body}</div>` : "";
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
      return name ? { name, type: "", caption: "", created: "", url: "", size: "" } : null;
    }
    const name = valueOf(asset.name || asset.fileName || asset.title);
    const type = resolveLabel(context.assetTypes, asset.type);
    const caption = valueOf(asset.caption || asset.description || asset.note);
    const created = format(asset.createdAt || asset.date || asset.created, context.formatDateTime);
    const url = valueOf(asset.url || asset.fileUrl || asset.cloudPath);
    const size = valueOf(asset.size);
    return [name, type, caption, created, url, size].some(Boolean)
      ? { name, type, caption, created, url, size }
      : null;
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
    const fieldDefs = array(context.fieldDefs);

    const name = valueOf(source.name);
    const headingMeta = [
      resolveLabel(context.stages, source.stage),
      clean(source.grade) ? `${clean(source.grade)} 级客户` : "",
      clean(context.reportDate),
    ].filter(Boolean).map(item => `<span>${escape(item)}</span>`).join("");
    const heading = `<header class="report-cover"><p class="report-type">客户全景报告</p><h1>${escape(name || "客户报告")}</h1>${headingMeta ? `<div class="report-cover-meta">${headingMeta}</div>` : ""}</header>`;

    const nextAction = pendingNotes[0] && valueOf(pendingNotes[0].next)
      || valueOf(raid.plan && raid.plan.action);
    const executive = fieldGrid([
      ["当前判断", valueOf(fields.relation) || valueOf(raid.dm && raid.dm.reachLevel)],
      ["核心机会", painPoints[0]],
      ["主要风险", valueOf(raid.dm && raid.dm.concern) || valueOf(raid.plan && raid.plan.support)],
      ["下一步行动", nextAction],
    ], "report-summary-grid");

    const profileEntries = fieldDefs.map(definition => [
      valueOf(definition && (definition.label || definition.key)),
      valueOf(fields[definition && definition.key]),
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

    const people = uniqueRecords(array(source.orgChain).filter(person => person && typeof person === "object"), person => keyOf([
      person.id, person.pid, valueOf(person.name), valueOf(person.role), person.level,
      person.phone, person.wechat, person.email, valueOf(person.note),
    ]));
    const peopleById = new Map(people.map(person => [clean(person.id), person]).filter(([id]) => id));
    const orgItems = decisionChains(people);
    people.forEach(person => {
      const parentId = clean(person.pid);
      const parent = parentId ? peopleById.get(parentId) : null;
      const contacts = [person.phone, person.wechat, person.email].map(clean).filter(Boolean).join(" · ");
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
    const organization = list(orgItems, "report-relation-list");

    const marketItems = painPoints.map(item => `客户痛点：${item}`);
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
    solutions.forEach(solution => {
      const detail = describeParts([
        valueOf(solution && (solution.product || solution.name || solution.title || solution)),
        valueOf(solution && (solution.reason || solution.description || solution.detail)),
      ], "：");
      if (detail) marketItems.push(`匹配方案：${detail}`);
    });
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
    const progress = progressItems ? `<div class="report-timeline">${progressItems}</div>` : "";

    const pendingItems = uniqueRecords(pendingNotes, note => keyOf([
      valueOf(note.next), note.nextDate, valueOf(note.contact),
    ])).map(note => describeParts([
      format(note.nextDate, context.formatShortDate), valueOf(note.next), valueOf(note.contact),
    ]));
    const pending = list(pendingItems, "report-action-list");

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
      asset.name, asset.type, asset.caption, asset.created, asset.url, asset.size,
    ]));
    const evidence = list(assets.map(asset => describeParts([
      asset.name, asset.type, asset.caption, asset.created, asset.url, asset.size,
    ])), "report-evidence-list");

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
