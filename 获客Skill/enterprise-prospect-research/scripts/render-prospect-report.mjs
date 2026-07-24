#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const input = args[0];
const outAt = args.indexOf("--out");
const outDir = path.resolve(outAt >= 0 ? args[outAt + 1] : ".");
if (!input) {
  console.error("用法: node render-prospect-report.mjs <任意文件名.json> --out <directory>");
  process.exit(2);
}

let sourceText;
let bundle;
try {
  sourceText = fs.readFileSync(path.resolve(input), "utf8").replace(/^\uFEFF/, "");
  bundle = JSON.parse(sourceText);
} catch (error) {
  console.error(`读取失败: ${error.message}`);
  process.exit(1);
}
if (bundle.schema_version !== "crm-customer-list.v1" || !Array.isArray(bundle.customers)) {
  console.error("渲染器要求 crm-customer-list.v1 customers[] JSON，文件名不限。");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, "..", "assets", "prospect-report.css"), "utf8");
const sha = crypto.createHash("sha256").update(sourceText).digest("hex");
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const md = value => String(value ?? "").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clean = value => String(value ?? "").trim();
const isUrl = value => /^https?:\/\//i.test(clean(value));
const mdUrl = (label, value) => isUrl(value) ? `[${md(label)}](<${clean(value)}>)` : md(label || value || "—");
const htmlUrl = (label, value) => isUrl(value) ? `<a class="source-link" href="${esc(clean(value))}" target="_blank" rel="noopener noreferrer">${esc(label || value)}</a>` : `<span class="muted">${esc(label || value || "—")}</span>`;
const field = (customer, key) => clean(customer.fields?.[key]?.v);
const arrays = value => Array.isArray(value) ? value : [];
const gradeOrder = { A: 0, B: 1, C: 2 };
const dataQualityLabel = { high: "高", medium: "中", low: "低" };
const sourceLabel = { customer: "客户确认", website: "企业官网", qcc: "企查查", tyc: "天眼查", qxb: "企信慧眼", web: "公开网页", panshi: "磐石", "": "未标注" };
const customers = bundle.customers.map((customer, index) => ({ customer, originalIndex: index })).sort((a, b) => (gradeOrder[a.customer.grade] ?? 9) - (gradeOrder[b.customer.grade] ?? 9) || a.originalIndex - b.originalIndex);

function signalsOf(customer) {
  return [
    ...arrays(customer.marketNews).map(item => ({ type: "市场动态", id: item.id, title: item.title, date: item.publishedAt, url: item.sourceUrl, fact: item.signal, implication: item.impact })),
    ...arrays(customer.hiringSignals).map(item => ({ type: "招聘信号", id: item.id, title: item.role, date: item.postedAt, url: item.sourceUrl, fact: item.signal, implication: item.opportunity, meta: item.location })),
    ...arrays(customer.bidding).map(item => ({ type: "招投标", id: item.id, title: item.project || item.title || "招采记录", date: item.date || item.verifiedAt, url: item.sourceUrl, fact: item.signal || item.status || item.result, implication: item.opportunity || item.impact, meta: item.amount })),
    ...arrays(customer.qualifications).map(item => ({ type: "资质许可", id: item.id, title: item.name || item.title || item.type || "资质记录", date: item.verifiedAt || item.date, url: item.sourceUrl, fact: item.status || item.issuer || item.signal, implication: item.impact, meta: item.identifier })),
  ].map(item => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, clean(value)])))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function factsOf(customer) {
  const definitions = [
    ["行业", field(customer, "industry")], ["成立时间", field(customer, "founded")], ["人员规模", field(customer, "staff")],
    ["融资阶段", field(customer, "funding")], ["主营产品", field(customer, "product") || clean(customer.businessBrief?.products)],
    ["商业模式", field(customer, "businessModel") || clean(customer.businessBrief?.revenueLogic)], ["技术栈", field(customer, "techStack")],
    ["总部 / 地址", field(customer, "regAddress")], ["集团关系", field(customer, "parentSubs")],
  ];
  return definitions.filter(([, value]) => value);
}

function fieldSourcesOf(customer) {
  return Object.entries(customer.fields || {}).filter(([, record]) => clean(record?.v)).map(([key, record]) => ({
    id: `field-${key}`,
    type: "基础事实",
    title: key,
    date: clean(record.verifiedAt),
    provider: sourceLabel[clean(record.source)] || clean(record.source) || "未标注",
    confidence: clean(record.confidence) || "unverified",
    fact: clean(record.v),
    url: key === "website" && isUrl(record.v) ? clean(record.v) : "",
  }));
}

function evidenceOf(customer) {
  const signalEvidence = signalsOf(customer).filter(item => item.url).map(item => ({ ...item, provider: item.type, confidence: "structured" }));
  return [...signalEvidence, ...fieldSourcesOf(customer)];
}

function latestSignalDate(customer) {
  return signalsOf(customer).map(item => item.date).filter(Boolean).sort().at(-1) || "—";
}

function customerAnchor(index) { return `customer-${index + 1}`; }
const counts = bundle.summary?.customer_counts || {};
const totalSignals = customers.reduce((sum, entry) => sum + signalsOf(entry.customer).length, 0);
const totalEvidenceUrls = customers.reduce((sum, entry) => sum + signalsOf(entry.customer).filter(item => item.url).length, 0);
const quality = clean(bundle.summary?.data_quality) || "low";
const reportTitle = clean(bundle.summary?.title) || "企业潜客研究清单";
const executiveSummary = clean(bundle.summary?.executive_summary) || `本轮形成 ${customers.length} 家可导入 CRM 的公开信息潜客。`;
const averageScore = customers.length ? Math.round(customers.reduce((sum, entry) => sum + Number(entry.customer.prospectResearch?.score || 0), 0) / customers.length) : 0;

let markdown = `<!-- generated-from-json: do-not-edit -->\n<!-- source-sha256: ${sha} -->\n# ${md(reportTitle)}\n\n> **企业潜客研究交付**  \n> 运行 ID：\`${md(bundle.run_id)}\`  \n> 生成时间：${md(bundle.generated_at)}  \n> CRM 客户：**${customers.length} 家**｜平均研究评分：**${averageScore} 分**｜结构化信号：**${totalSignals} 条**｜可访问证据链接：**${totalEvidenceUrls} 条**  \n> 数据质量：**${dataQualityLabel[quality] || quality}**  \n> 本报告由同目录 CRM JSON 自动生成；需求、痛点、采购时点和方案建议均需客户确认。\n\n---\n\n## 01｜管理摘要\n\n${md(executiveSummary)}\n\n### 客户分层\n\n| 分层 | 数量 | 建议动作 |\n| --- | ---: | --- |\n| A | ${counts.A ?? customers.filter(x => x.customer.grade === "A").length} | 优先补充关键人并发起首轮验证 |\n| B | ${counts.B ?? customers.filter(x => x.customer.grade === "B").length} | 补强独立信号与时机证据 |\n| C | ${counts.C ?? customers.filter(x => x.customer.grade === "C").length} | 纳入长期培育和事件监测 |\n| 待人工复核 | ${counts.manual_review ?? 0} | 核实主体、冲突或证据后再决定是否入库 |\n\n### 使用边界\n\n> [!IMPORTANT]\n> “公开信息已识别”不代表已经触达或建联；报告中的需求判断均为研究假设，不能写成客户已确认的预算、痛点、采购计划或现用供应商。\n\n## 02｜优先级总览\n\n| 序号 | 等级 | 评分 | 企业 | 行业 | 结构化信号 | 最新信号 | 首轮确认方向 |\n| ---: | :---: | ---: | --- | --- | ---: | --- | --- |\n`;
customers.forEach((entry, index) => {
  const customer = entry.customer;
  markdown += `| ${index + 1} | **${md(customer.grade)}** | **${customer.prospectResearch?.score ?? "—"}** | [${md(customer.name)}](#${customerAnchor(index)}) | ${md(field(customer, "industry") || "待补充")} | ${signalsOf(customer).length} | ${md(latestSignalDate(customer))} | ${md(customer.painChain?.question || "待形成")} |\n`;
});

for (const grade of ["A", "B", "C"]) {
  const gradeEntries = customers.filter(entry => entry.customer.grade === grade);
  if (!gradeEntries.length) continue;
  markdown += `\n---\n\n## ${grade} 类潜客｜${gradeEntries.length} 家\n\n`;
  gradeEntries.forEach(entry => {
    const index = customers.indexOf(entry);
    const customer = entry.customer;
    const facts = factsOf(customer);
    const signals = signalsOf(customer);
    const contacts = arrays(customer.orgChain);
    const unknowns = arrays(customer.businessBrief?.unknowns).filter(clean);
    const website = field(customer, "website");
    markdown += `<a id="${customerAnchor(index)}"></a>\n\n### ${String(index + 1).padStart(2, "0")} · ${md(customer.name)}\n\n> **${grade} 类潜客**｜阶段：\`${md(customer.stage)}\`｜信号：${signals.length} 条｜最新信号：${md(latestSignalDate(customer))}\n\n#### 企业画像\n\n| 项目 | 内容 |\n| --- | --- |\n| 行业 | ${md(field(customer, "industry") || "待补充")} |\n| 产品 / 服务 | ${md(field(customer, "product") || customer.businessBrief?.products || "待补充")} |\n| 经营观察 | ${md(customer.businessBrief?.operatingStatus || "待补充")} |\n| 官网 | ${website ? mdUrl(website, website) : "未确认"} |\n| 公开联系人 | ${contacts.length ? contacts.map(person => `${md(person.name)}（${md(person.role || "职位待确认")}，${person.relationStatus === "identified" ? "信息已识别" : md(person.relationStatus || "待建联")}）`).join("；") : "未获得可靠公开联系人"} |\n\n`;
    if (facts.length) {
      markdown += `#### 已核实公开事实\n\n| 维度 | 事实 |\n| --- | --- |\n${facts.map(([label, value]) => `| ${md(label)} | ${md(value)} |`).join("\n")}\n\n`;
    }
    const research = customer.prospectResearch;
    if (research) {
      markdown += `#### 研究评分与入选依据\n\n**综合评分：${research.score} / 100**  \n发现通道：${arrays(research.discoveryChannels).map(md).join("、")}  \n入选理由：${md(research.selectionRationale)}\n\n| 评分维度 | 得分 | 满分 | 依据 |\n| --- | ---: | ---: | --- |\n${arrays(research.scoreDimensions).map(item => `| ${md(item.label)} | ${item.score} | ${item.maxScore} | ${md(item.rationale)} |`).join("\n")}\n\n> **反向审查**：${md(research.reverseReview)}\n\n`;
    }
    markdown += `#### 公开信号与证据\n\n`;
    if (signals.length) {
      signals.forEach(signal => {
        markdown += `- **${md(signal.date || "日期待确认")}｜${md(signal.type)}｜${md(signal.title || "未命名信号")}**  \n  ${md(signal.fact || "已记录结构化公开信号。")}${signal.implication ? `  \n  销售含义（待验证）：${md(signal.implication)}` : ""}${signal.url ? `  \n  来源：${mdUrl(signal.id || "查看原文", signal.url)}` : ""}\n`;
      });
    } else markdown += `- 暂无带结构化记录的近期信号，建议补充官网、招聘、招采或新闻检索。\n`;
    markdown += `\n#### 机会研判（未经客户确认）\n\n> **触发信号**：${md(customer.painChain?.signal || "尚未形成")}  \n> **需求假设**：${md(customer.businessBrief?.painHypothesis || customer.painChain?.pain || "尚未形成")}  \n> **可能影响**：${md(customer.painChain?.impact || "待首轮沟通核实")}  \n> **首轮问题**：${md(customer.painChain?.question || "待形成可验证问题")}\n\n#### 尚待确认\n\n${unknowns.length ? unknowns.map(item => `- ${md(item)}`).join("\n") : "- 当前供应商、部署方式、负载、预算、采购计划和决策链仍需确认。"}\n\n`;
  });
}

const allEvidence = customers.flatMap((entry, customerIndex) => evidenceOf(entry.customer).map((item, evidenceIndex) => ({ ...item, customer: entry.customer.name, ref: `${customerIndex + 1}-${item.id || evidenceIndex + 1}` })));
markdown += `---\n\n## 03｜证据与来源索引\n\n| 引用 | 企业 | 类型 | 日期 | 内容 | 来源 |\n| --- | --- | --- | --- | --- | --- |\n`;
if (allEvidence.length) allEvidence.forEach(item => {
  markdown += `| \`${md(item.ref)}\` | ${md(item.customer)} | ${md(item.type)} | ${md(item.date || "—")} | ${md(item.fact || item.title || "—")} | ${item.url ? mdUrl(item.provider || "原文", item.url) : md(item.provider || "CRM 字段来源")} |\n`;
});
else markdown += `| — | — | — | — | 暂无可索引证据 | — |\n`;
markdown += `\n## 04｜研究方法与交付说明\n\n- 候选经 ICP、事件、招聘、采购和相似生态通道发现，并执行主体核验与去重。\n- A/B/C 代表研究优先级，不是成交概率。\n- JSON 是 CRM 导入唯一事实源；本 Markdown 与 HTML 均由该 JSON 自动渲染。\n- 文件名可以自定义，JSON 内部版本必须为 \`crm-customer-list.v1\`。\n- 源 JSON SHA-256：\`${sha}\`\n`;

const gradeBadge = grade => `<span class="badge grade-${esc(grade)}">${esc(grade)} 类</span>`;
const factsHtml = customer => {
  const facts = factsOf(customer);
  return facts.length ? `<div class="fact-grid">${facts.map(([label, value]) => `<div class="fact"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`).join("")}</div>` : `<div class="empty">基础公开事实仍需补充</div>`;
};
const signalsHtml = customer => {
  const signals = signalsOf(customer);
  return signals.length ? `<div class="signal-list">${signals.map(signal => `<article class="signal"><time>${esc(signal.date || "日期待确认")} · ${esc(signal.type)}</time><h3>${esc(signal.title || "未命名信号")}</h3><p>${esc(signal.fact || "已记录结构化公开信号。")}</p>${signal.implication ? `<p><b>待验证含义：</b>${esc(signal.implication)}</p>` : ""}${signal.url ? htmlUrl(signal.id || "查看原文", signal.url) : ""}</article>`).join("")}</div>` : `<div class="empty">暂无结构化近期信号</div>`;
};
const contactsHtml = customer => {
  const contacts = arrays(customer.orgChain);
  return contacts.length ? `<div class="contacts">${contacts.map(person => `<div class="contact"><span class="avatar">${esc(Array.from(clean(person.name))[0] || "人")}</span><div><b>${esc(person.name)}</b><small>${esc(person.role || "职位待确认")} · ${person.relationStatus === "identified" ? "信息已识别" : esc(person.relationStatus || "待建联")}</small></div></div>`).join("")}</div>` : `<div class="empty">未获得可靠公开联系人</div>`;
};
const customerHtml = (entry, index) => {
  const customer = entry.customer;
  const signals = signalsOf(customer);
  const research = customer.prospectResearch;
  const unknowns = arrays(customer.businessBrief?.unknowns).filter(clean);
  return `<section class="section customer ${esc(customer.grade)}" id="${customerAnchor(index)}"><div class="customer-head"><div><div class="customer-title">${gradeBadge(customer.grade)}<h2>${esc(customer.name)}</h2></div><div class="customer-meta"><span>${esc(field(customer, "industry") || "行业待补充")}</span><span>·</span><span>CRM 阶段 ${esc(customer.stage)}</span><span>·</span><span>最新信号 ${esc(latestSignalDate(customer))}</span></div></div><div class="customer-stats"><div class="stat"><b>${research?.score ?? "—"}</b><span>研究评分</span></div><div class="stat"><b>${signals.length}</b><span>结构化信号</span></div><div class="stat"><b>${signals.filter(item => item.url).length}</b><span>证据链接</span></div><div class="stat"><b>${arrays(customer.orgChain).length}</b><span>公开人物</span></div></div></div><h3>企业画像</h3>${factsHtml(customer)}${research ? `<h3>研究评分与入选依据</h3><div class="score-layout"><div class="score-total"><b>${research.score}</b><span>/ 100</span><small>${esc(arrays(research.discoveryChannels).join(" · "))}</small></div><div class="score-grid">${arrays(research.scoreDimensions).map(item => `<div class="score-row"><div><b>${esc(item.label)}</b><span>${item.score} / ${item.maxScore}</span></div><div class="score-track"><i style="width:${Math.min(100, Math.round(item.score / item.maxScore * 100))}%"></i></div><p>${esc(item.rationale)}</p></div>`).join("")}</div></div><div class="grid" style="margin-top:12px"><div class="callout"><b>入选理由</b>${esc(research.selectionRationale)}</div><div class="callout warning"><b>反向审查</b>${esc(research.reverseReview)}</div></div>` : ""}<div class="grid"><div><h3>公开信号与证据</h3>${signalsHtml(customer)}</div><div><h3>机会研判</h3><div class="card hypothesis"><div class="label">未经客户确认的研究假设</div><p><b>触发信号：</b>${esc(customer.painChain?.signal || "尚未形成")}</p><p><b>需求假设：</b>${esc(customer.businessBrief?.painHypothesis || customer.painChain?.pain || "尚未形成")}</p><p><b>可能影响：</b>${esc(customer.painChain?.impact || "待核实")}</p></div><div class="callout" style="margin-top:12px"><b>首轮建议确认</b>${esc(customer.painChain?.question || "待形成可验证问题")}</div><h3>尚待确认</h3><ul class="unknowns">${(unknowns.length ? unknowns : ["当前供应商、部署方式、负载、预算、采购计划和决策链仍需确认。"]).map(item => `<li>${esc(item)}</li>`).join("")}</ul><h3>公开关系</h3>${contactsHtml(customer)}</div></div></section>`;
};

const rankRows = customers.map((entry, index) => {
  const customer = entry.customer;
  return `<tr><td>${index + 1}</td><td>${gradeBadge(customer.grade)}</td><td><b>${customer.prospectResearch?.score ?? "—"}</b></td><td><a href="#${customerAnchor(index)}"><b>${esc(customer.name)}</b></a></td><td>${esc(field(customer, "industry") || "待补充")}</td><td>${signalsOf(customer).length}</td><td>${esc(latestSignalDate(customer))}</td><td>${esc(customer.painChain?.question || "待形成")}</td></tr>`;
}).join("");
const evidenceRows = allEvidence.length ? allEvidence.map(item => `<tr><td class="mono">${esc(item.ref)}</td><td>${esc(item.customer)}</td><td>${esc(item.type)}</td><td>${esc(item.date || "—")}</td><td>${esc(item.fact || item.title || "—")}</td><td>${item.url ? htmlUrl(item.provider || "原文", item.url) : esc(item.provider || "CRM 字段来源")}</td></tr>`).join("") : `<tr><td colspan="6" class="muted">暂无可索引证据</td></tr>`;

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="source-sha256" content="${sha}"><meta name="customer-count" content="${customers.length}"><meta name="evidence-count" content="${allEvidence.length}"><title>${esc(reportTitle)}｜企业潜客研究</title><style>${css}</style></head><body><header class="hero"><div class="wrap"><div class="eyebrow">Enterprise Prospect Intelligence</div><h1>${esc(reportTitle)}</h1><p class="subtitle">${esc(executiveSummary)}</p><div class="meta"><span>运行 ID ${esc(bundle.run_id)}</span><span>生成时间 ${esc(bundle.generated_at)}</span><span>数据质量 ${esc(dataQualityLabel[quality] || quality)}</span></div><div class="metrics"><div class="metric"><b>${customers.length}</b><span>CRM 候选客户</span></div><div class="metric"><b>${counts.A ?? 0}</b><span>A 类优先客户</span></div><div class="metric"><b>${counts.B ?? 0}</b><span>B 类观察客户</span></div><div class="metric"><b>${totalSignals}</b><span>结构化公开信号</span></div><div class="metric"><b>${averageScore}</b><span>平均研究评分</span></div></div></div></header><nav class="nav"><div class="wrap"><a href="#summary">管理摘要</a><a href="#ranking">优先级总览</a><a href="#customers">逐客研判</a><a href="#evidence">证据索引</a><a href="#method">方法说明</a></div></nav><main class="wrap"><section class="section" id="summary"><div class="section-head"><div><h2>管理摘要</h2><p>面向销售决策的公开信息候选池，不代表已确认商机。</p></div><span class="badge quality-${esc(quality)}">数据质量 ${esc(dataQualityLabel[quality] || quality)}</span></div><div class="summary-grid"><div class="callout"><b>本轮结论</b>${esc(executiveSummary)}</div><div class="callout warning"><b>重要边界</b>公开身份不等于已建联；需求、预算、采购计划和现用供应商必须通过客户沟通确认。</div></div></section><section class="section" id="ranking"><div class="section-head"><div><h2>优先级总览</h2><p>A/B/C 是公开信息研究优先级，不是成交概率。</p></div></div><div class="rank-table"><table><thead><tr><th>#</th><th>等级</th><th>评分</th><th>企业</th><th>行业</th><th>信号</th><th>最新信号</th><th>首轮确认方向</th></tr></thead><tbody>${rankRows}</tbody></table></div></section><div id="customers">${customers.map(customerHtml).join("")}</div><section class="section" id="evidence"><div class="section-head"><div><h2>证据与来源索引</h2><p>结构化事件链接与 CRM 基础字段来源的统一索引。</p></div><span class="badge">${allEvidence.length} 条记录</span></div><div class="evidence-table"><table><thead><tr><th>引用</th><th>企业</th><th>类型</th><th>日期</th><th>内容</th><th>来源</th></tr></thead><tbody>${evidenceRows}</tbody></table></div></section><section class="section" id="method"><div class="section-head"><div><h2>研究方法与交付说明</h2><p>三份文件使用同一 CRM JSON 事实源。</p></div></div><div class="grid3"><div class="card"><div class="label">发现</div><div class="value">五通道候选发现</div><p>ICP、事件、招聘、采购、相似生态。</p></div><div class="card"><div class="label">质量</div><div class="value">主体核验与反向审查</div><p>去重、冲突、时效和集团证据边界。</p></div><div class="card"><div class="label">交付</div><div class="value">CRM JSON + MD + HTML</div><p>文件名可自定义，内容版本固定。</p></div></div><p class="muted mono" style="margin-top:18px">源 JSON SHA-256 ${sha}</p></section></main><footer class="footer">${esc(reportTitle)} · 自动生成，请勿直接编辑 Markdown 或 HTML · ${esc(bundle.run_id)}</footer></body></html>`;

fs.mkdirSync(outDir, { recursive: true });
const mdPath = path.join(outDir, "lead-list.md");
const htmlPath = path.join(outDir, "lead-list.html");
markdown = markdown.replace(/ {2,}\n/g, "<br>\n");
fs.writeFileSync(mdPath, markdown, "utf8");
fs.writeFileSync(htmlPath, html, "utf8");
console.log(`已生成:\n- ${mdPath}\n- ${htmlPath}\n客户 ${customers.length} 家，信号 ${totalSignals} 条，源 SHA-256: ${sha}`);