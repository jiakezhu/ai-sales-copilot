import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2), input = args[0], outAt = args.indexOf("--out"), outDir = outAt >= 0 ? args[outAt + 1] : ".";
if (!input) { console.error("用法: node render-research.mjs <json> --out <directory>"); process.exit(2); }
const here = path.dirname(fileURLToPath(import.meta.url));
const gate = spawnSync(process.execPath, [path.join(here, "quality-gate.mjs"), path.resolve(input)], { encoding: "utf8" });
if (gate.stdout) process.stdout.write(gate.stdout);
if (gate.stderr) process.stderr.write(gate.stderr);
if (gate.status !== 0) { console.error("渲染已取消：源 JSON 未通过交付门禁。"); process.exit(gate.status || 1); }
const sourceText = fs.readFileSync(path.resolve(input), "utf8"), bundle = JSON.parse(sourceText);
if (bundle.schema_version !== "crm-customer-list.v1" || !Array.isArray(bundle.customers) || bundle.customers.length !== 1 || !bundle.customers[0]?.deepResearch) { console.error("渲染器要求 CRM 原生单客户 deepResearch JSON，文件名不限。"); process.exit(1); }
const customer = bundle.customers[0], data = customer.deepResearch;
if (data.subject?.legal_name !== customer.name) { console.error("deepResearch 主体名称与 CRM 客户名称不一致。"); process.exit(1); }
const sha = crypto.createHash("sha256").update(sourceText).digest("hex");
const css = fs.readFileSync(path.join(here, "..", "assets", "report-theme.css"), "utf8");
fs.mkdirSync(path.resolve(outDir), { recursive: true });
const mdPath = path.join(path.resolve(outDir), "company-deep-research.md");
const htmlPath = path.join(path.resolve(outDir), "company-deep-research.html");
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mdEsc = v => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
const url = v => /^https?:\/\//i.test(v || "") ? v : "";
const ids = xs => (xs || []).map(id => `[${id}](#evidence-${id.toLowerCase()})`).join(" · ") || "—";
const hids = xs => (xs || []).map(id => `<a href="#evidence-${esc(id)}">${esc(id)}</a>`).join("") || "<span class=muted>无</span>";
const badge = (v) => `<span class="badge ${esc(v)}">${esc(v)}</span>`;
const listMd = xs => (xs?.length ? xs.map(x => `- ${x}`).join("\n") : "- 无");
const listHtml = xs => `<ul>${(xs?.length ? xs : ["无"]).map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
const claimById = new Map(data.claims.map(x => [x.id, x]));

let md = `<!-- generated-from-json: do-not-edit -->\n<!-- source-sha256: ${sha} -->\n# ${data.subject.legal_name}｜企业客户深度调研\n\n> 研究 ID：${data.research_id}<br>\n> 截止日期：${data.scope.as_of}<br>\n> 生成时间：${data.generated_at}<br>\n> 证据：${data.evidence.length} 条｜主张：${data.claims.length} 条<br>\n> 本报告仅使用公开、合法、可定位的信息。\n\n## 执行摘要\n\n${data.executive_summary.overview}\n\n### 关键结论\n\n`;
for (const id of data.executive_summary.key_claim_ids) { const c = claimById.get(id); if (c) md += `- **${c.statement}**（${c.status} / ${c.confidence}） ${ids(c.evidence_ids)}\n`; }
md += `\n### 重点观察\n\n${listMd(data.executive_summary.watch_items)}\n\n### 尚待确认\n\n${listMd(data.executive_summary.unknowns)}\n\n## 来源覆盖矩阵\n\n| 维度 | 状态 | 已尝试来源 | 说明 | 证据 |\n|---|---|---|---|---|\n`;
for (const x of data.source_coverage) md += `| ${mdEsc(x.dimension)} | ${x.status} | ${mdEsc(x.providers_attempted.join("、"))} | ${mdEsc(x.notes)} | ${ids(x.evidence_ids)} |\n`;
md += `\n## 主体档案\n\n| 字段 | 值 |\n|---|---|\n| 法定名称 | ${mdEsc(data.subject.legal_name)} |\n| CRM 阶段 / 等级 | ${mdEsc(customer.stage)} / ${mdEsc(customer.grade)} |\n| 原始查询 | ${mdEsc(data.subject.query)} |\n| 曾用名/别名 | ${mdEsc(data.subject.aliases.join("、") || "无")} |\n| 统一社会信用代码 | ${mdEsc(data.subject.credit_code || "未获得")} |\n| 登记状态 | ${mdEsc(data.subject.registration_status)} |\n| 总部/注册地址 | ${mdEsc(data.subject.headquarters)} |\n| 官网 | ${url(data.subject.website) ? `[${data.subject.website}](${data.subject.website})` : mdEsc(data.subject.website || "未确认")} |\n| 锁定证据 | ${ids(data.subject.evidence_ids)} |\n\n## 关键主张\n\n`;
for (const c of data.claims) md += `### ${c.id} · ${c.category}\n\n**${c.statement}**<br>\n状态：${c.status}｜置信度：${c.confidence}｜截至：${c.as_of}<br>\n依据：${c.rationale || "—"}<br>\n证据：${ids(c.evidence_ids)}${c.counter_evidence_ids.length ? `｜反证：${ids(c.counter_evidence_ids)}` : ""}\n\n`;
md += `## 股权穿透\n\n**实际控制结论：** ${data.ownership.ultimate_controller_claim_id ? `[${data.ownership.ultimate_controller_claim_id}](#${data.ownership.ultimate_controller_claim_id.toLowerCase()})` : "未确认"}\n\n`;
for (const p of data.ownership.penetration_paths) md += `- ${p.nodes.join(" → ")}；直接比例：${p.direct_percentages.map(x => `${x}%`).join(" × ")}；间接比例：${p.calculated_indirect_percentage}%；终点：${p.terminal_type || "未确认"}${p.stop_reason ? `；停止原因：${p.stop_reason}` : ""} ${ids(p.evidence_ids)}\n`;
md += `\n### 股权边\n\n| 股东 | 被投资主体 | 关系 | 比例 | 截至 | 证据 |\n|---|---|---|---:|---|---|\n`;
for (const x of data.ownership.edges) md += `| ${mdEsc(x.from)} | ${mdEsc(x.to)} | ${mdEsc(x.relationship)} | ${x.percentage}% | ${mdEsc(x.as_of)} | ${ids(x.evidence_ids)} |\n`;
md += `\n## 集团与组织边界\n\n${data.organization.boundary_note}\n\n| 上游节点 | 下游节点 | 关系 | 比例 | 证据 |\n|---|---|---|---:|---|\n`;
for (const x of data.organization.edges) md += `| ${mdEsc(x.from)} | ${mdEsc(x.to)} | ${mdEsc(x.relationship)} | ${x.percentage}% | ${ids(x.evidence_ids)} |\n`;
md += `\n## 关键人员与公开关系\n\n> ${data.people.privacy_note}\n\n| 人员 | 公开角色 | 证据 |\n|---|---|---|\n`;
for (const p of data.people.persons) md += `| ${mdEsc(p.name)} | ${mdEsc(p.public_roles.join("、"))} | ${ids(p.evidence_ids)} |\n`;
md += `\n| 人员节点 | 企业节点 | 关系 | 时间 | 证据 |\n|---|---|---|---|---|\n`;
for (const r of data.people.relationships) md += `| ${mdEsc(r.person_id)} | ${mdEsc(r.entity_id)} | ${r.relationship} | ${mdEsc(r.period)} | ${ids(r.evidence_ids)} |\n`;
const factSections = [["业务事实",data.business.facts],["产品与服务",data.business.products],["技术线索",data.business.technologies],["客户与渠道",data.business.customers_channels],["合作伙伴",data.business.partners],["竞争参照",data.business.competitors],["供应链",data.business.supply_chain]];
md += `\n## 业务与技术\n\n`;
for (const [name, facts] of factSections) { md += `### ${name}\n\n`; md += facts.length ? facts.map(f => `- **${f.label}：** ${f.value}（截至 ${f.as_of}） ${ids(f.evidence_ids)}`).join("\n") : "- 未获得可靠公开信息"; md += "\n\n"; }
md += `## 招聘观察\n\n${data.hiring.summary}\n\n| 职位 | 地点 | 职能 | 技术词 | 发布 | 状态 | 证据 |\n|---|---|---|---|---|---|---|\n`;
for (const x of data.hiring.postings) md += `| ${mdEsc(x.title)} | ${mdEsc(x.location)} | ${mdEsc(x.function)} | ${mdEsc(x.technologies.join("、"))} | ${mdEsc(x.published_at)} | ${mdEsc(x.status)} | ${ids(x.evidence_ids)} |\n`;
md += `\n## 事件时间线\n\n`;
for (const e of [...data.events].sort((a,b)=>b.date.localeCompare(a.date))) md += `- **${e.date}｜${e.title}**（${e.category} / ${e.significance}）— ${e.description} ${ids(e.evidence_ids)}\n`;
md += `\n## 招投标\n\n| 日期 | 角色 | 对手方 | 项目 | 金额 | 状态 | 证据 |\n|---|---|---|---|---|---|---|\n`;
for (const x of data.procurement) md += `| ${x.date} | ${x.role} | ${mdEsc(x.counterparty)} | ${mdEsc(x.project)} | ${mdEsc(x.amount)} | ${mdEsc(x.status)} | ${ids(x.evidence_ids)} |\n`;
if (!data.procurement.length) md += `| — | — | — | 未获得可靠记录 | — | — | — |\n`;
md += `\n## 知识产权与资质\n\n| 类型 | 名称 | 编号 | 状态 | 日期 | 证据 |\n|---|---|---|---|---|---|\n`;
for (const x of data.intellectual_property) md += `| ${x.type} | ${mdEsc(x.name)} | ${mdEsc(x.identifier)} | ${mdEsc(x.status)} | ${mdEsc(x.date)} | ${ids(x.evidence_ids)} |\n`;
md += `\n## 风险观察\n\n`;
md += data.risks.length ? data.risks.map(x => `- **${x.title}**（${x.category} / ${x.severity} / ${x.status}，${x.date}）— ${x.description} ${ids(x.evidence_ids)}`).join("\n") : "- 未发现可确认风险；这不等于不存在风险。";
md += `\n\n## 销售研判（均为假设）\n\n`;
for (const x of data.sales_implications.hypotheses) md += `### ${x.title}\n\n${x.hypothesis}<br>\n置信度：${x.confidence}<br>\n反向信号：${x.counter_signals.join("；") || "无"}<br>\n未知项：${x.unknowns.join("；") || "无"}<br>\n证据：${ids(x.evidence_ids)}\n\n`;
md += `### 首轮确认问题\n\n${listMd(data.sales_implications.discovery_questions)}\n\n## 冲突与数据盲区\n\n### 来源冲突\n\n`;
md += data.conflicts.length ? data.conflicts.map(x => `- **${x.topic}**（${x.resolution_status}）：${x.positions.map(p => `${p.statement} ${ids(p.evidence_ids)}`).join("；")}。影响：${x.impact}`).join("\n") : "- 本轮未记录来源冲突。";
md += `\n\n### 数据盲区\n\n${data.blind_spots.length ? data.blind_spots.map(x => `- **${x.dimension}**：${x.reason}。影响：${x.impact}。下一步：${x.next_step}`).join("\n") : "- 未记录。"}\n\n## 完整证据清单\n\n`;
for (const e of data.evidence) md += `### <a id="evidence-${e.id.toLowerCase()}"></a>${e.id} · ${e.title}\n\n- 来源：${e.provider} / ${e.source_type} / ${e.authority} / ${e.directness}\n- 定位：${url(e.url) ? `[${e.url}](${e.url})` : e.locator}\n- 工具/查询/记录：${e.tool_name || "—"} / ${e.query || "—"} / ${e.record_id || "—"}\n- 发布时间：${e.published_at || "—"}；访问时间：${e.accessed_at}\n- 摘录：${e.excerpt || "—"}\n\n`;
fs.writeFileSync(mdPath, `${md.trimEnd()}\n`, "utf8");

const cards = (facts) => facts.length ? facts.map(f => `<div class=card><div class=label>${esc(f.label)}</div><div class=value>${esc(f.value)}</div><div class=refs>${hids(f.evidence_ids)}</div></div>`).join("") : `<div class="card muted">未获得可靠公开信息</div>`;
const claimCards = data.claims.map(c => `<article class="card claim" id="${esc(c.id.toLowerCase())}"><div class=claim-meta>${badge(c.status)}${badge(c.confidence)}<span class=muted>${esc(c.id)} · ${esc(c.category)} · ${esc(c.as_of)}</span></div><h3>${esc(c.statement)}</h3><p>${esc(c.rationale || "无补充说明")}</p><div class=refs>${hids(c.evidence_ids)}</div></article>`).join("");
const navs = [["summary","摘要"],["coverage","覆盖"],["identity","主体"],["claims","主张"],["ownership","股权"],["people","人员"],["business","业务"],["signals","动态"],["risks","风险"],["sales","销售研判"],["evidence","证据"]];
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="research-id" content="${esc(data.research_id)}"><meta name="source-sha256" content="${sha}"><meta name="claim-count" content="${data.claims.length}"><meta name="evidence-count" content="${data.evidence.length}"><title>${esc(data.subject.legal_name)}｜企业客户深度调研</title><style>${css}</style></head><body>
<header class=hero><div class=wrap><div class=eyebrow>Enterprise Intelligence Dossier</div><h1>${esc(data.subject.legal_name)}</h1><p class=subtitle>${esc(data.executive_summary.overview)}</p><div class=metrics><div class=metric><b>${data.claims.length}</b><span>结构化主张</span></div><div class=metric><b>${data.evidence.length}</b><span>可定位证据</span></div><div class=metric><b>${data.source_coverage.filter(x=>x.status==="verified").length}/11</b><span>已验证维度</span></div><div class=metric><b>${esc(data.scope.as_of)}</b><span>研究截止日期</span></div></div></div></header>
<nav class=nav><div class=wrap>${navs.map(([id,t])=>`<a href="#${id}">${t}</a>`).join("")}</div></nav><main class="main wrap">
<section class=section id=summary><h2>执行摘要</h2><div class=grid><div><h3>关键结论</h3>${listHtml(data.executive_summary.key_claim_ids.map(id=>claimById.get(id)?.statement).filter(Boolean))}</div><div><h3>重点观察</h3>${listHtml(data.executive_summary.watch_items)}<h3>尚待确认</h3>${listHtml(data.executive_summary.unknowns)}</div></div></section>
<section class=section id=coverage><h2>来源覆盖矩阵</h2><div class=coverage>${data.source_coverage.map(x=>`<div class=card><div class=label>${esc(x.dimension)}</div>${badge(x.status)}<p>${esc(x.notes)}</p><small class=muted>${esc(x.providers_attempted.join(" · "))}</small><div class=refs>${hids(x.evidence_ids)}</div></div>`).join("")}</div></section>
<section class=section id=identity><h2>主体档案</h2><div class=grid3>${[["法定名称",data.subject.legal_name],["CRM 阶段 / 等级",`${customer.stage} / ${customer.grade}`],["统一社会信用代码",data.subject.credit_code||"未获得"],["登记状态",data.subject.registration_status],["总部/注册地址",data.subject.headquarters],["别名",data.subject.aliases.join("、")||"无"],["官网",data.subject.website||"未确认"]].map(([k,v])=>`<div class=card><div class=label>${k}</div><div class=value>${esc(v)}</div></div>`).join("")}</div><div class="refs" style="margin-top:12px">锁定证据：${hids(data.subject.evidence_ids)}</div></section>
<section class=section id=claims><h2>关键主张</h2><div class=grid>${claimCards}</div></section>
<section class=section id=ownership><h2>股权穿透与集团边界</h2><h3>穿透路径</h3>${data.ownership.penetration_paths.map(p=>`<div class=card><div class=path>${p.nodes.map((n,i)=>`${i?`<span class=arrow>→ ${esc(p.direct_percentages[i-1])}% →</span>`:""}<span class=node>${esc(n)}</span>`).join("")}</div><p class=muted>间接比例 ${esc(p.calculated_indirect_percentage)}% · 终点 ${esc(p.terminal_type||"未确认")}${p.stop_reason?` · ${esc(p.stop_reason)}`:""}</p><div class=refs>${hids(p.evidence_ids)}</div></div>`).join("")}<h3>组织边界</h3><p>${esc(data.organization.boundary_note)}</p><div class=table-wrap><table><thead><tr><th>股东/上游</th><th>主体</th><th>关系</th><th>比例</th><th>证据</th></tr></thead><tbody>${[...data.ownership.edges,...data.organization.edges].map(x=>`<tr><td>${esc(x.from)}</td><td>${esc(x.to)}</td><td>${esc(x.relationship)}</td><td>${x.percentage}%</td><td class=refs>${hids(x.evidence_ids)}</td></tr>`).join("")}</tbody></table></div></section>
<section class=section id=people><h2>关键人员与公开关系</h2><div class=callout>${esc(data.people.privacy_note)}</div><div class=grid3 style="margin-top:14px">${data.people.persons.map(p=>`<div class=card><div class=value>${esc(p.name)}</div><p>${esc(p.public_roles.join("、"))}</p><div class=refs>${hids(p.evidence_ids)}</div></div>`).join("")}</div><div class=table-wrap><table><thead><tr><th>人员</th><th>企业</th><th>公开关系</th><th>期间</th><th>证据</th></tr></thead><tbody>${data.people.relationships.map(r=>`<tr><td>${esc(r.person_id)}</td><td>${esc(r.entity_id)}</td><td>${esc(r.relationship)}</td><td>${esc(r.period)}</td><td class=refs>${hids(r.evidence_ids)}</td></tr>`).join("")}</tbody></table></div></section>
<section class=section id=business><h2>业务、产品与技术</h2>${factSections.map(([name,facts])=>`<h3>${name}</h3><div class=grid3>${cards(facts)}</div>`).join("")}</section>
<section class=section id=signals><h2>招聘、事件与招采信号</h2><div class=callout>${esc(data.hiring.summary)}</div><h3>招聘岗位</h3><div class=grid3>${data.hiring.postings.length?data.hiring.postings.map(x=>`<div class=card><div class=label>${esc(x.location)} · ${esc(x.function)}</div><div class=value>${esc(x.title)}</div><p>${esc(x.technologies.join(" · "))}</p><small>${esc(x.published_at)} · ${esc(x.status)}</small><div class=refs>${hids(x.evidence_ids)}</div></div>`).join(""):`<div class="card muted">未获得可确认招聘记录</div>`}</div><h3>事件时间线</h3><div class=timeline>${[...data.events].sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`<article class=event><time>${esc(e.date)} · ${esc(e.category)}</time><h3>${esc(e.title)} ${badge(e.significance)}</h3><p>${esc(e.description)}</p><div class=refs>${hids(e.evidence_ids)}</div></article>`).join("")}</div><h3>招投标</h3>${data.procurement.length?`<div class=table-wrap><table><thead><tr><th>日期</th><th>角色</th><th>项目</th><th>对手方</th><th>金额/状态</th></tr></thead><tbody>${data.procurement.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.role)}</td><td>${esc(x.project)}<div class=refs>${hids(x.evidence_ids)}</div></td><td>${esc(x.counterparty)}</td><td>${esc(x.amount)} / ${esc(x.status)}</td></tr>`).join("")}</tbody></table></div>`:`<p class=muted>未获得可确认招投标记录。</p>`}</section>
<section class=section id=risks><h2>风险、冲突与盲区</h2><div class=grid>${data.risks.length?data.risks.map(x=>`<div class="card ${x.severity==="high"?"danger":"warning"}">${badge(x.severity)}<h3>${esc(x.title)}</h3><p>${esc(x.description)}</p><small>${esc(x.category)} · ${esc(x.status)} · ${esc(x.date)}</small><div class=refs>${hids(x.evidence_ids)}</div></div>`).join(""):`<div class=card>未发现可确认风险；这不等于不存在风险。</div>`}</div><h3>来源冲突</h3>${data.conflicts.length?listHtml(data.conflicts.map(x=>`${x.topic}（${x.resolution_status}）：${x.positions.map(p=>p.statement).join("；")}。影响：${x.impact}`)):listHtml(["本轮未记录来源冲突"])}<h3>数据盲区</h3>${listHtml(data.blind_spots.map(x=>`${x.dimension}：${x.reason}；影响：${x.impact}；下一步：${x.next_step}`))}</section>
<section class=section id=sales><h2>销售研判 <span class="badge inferred">全部为假设</span></h2><div class=grid>${data.sales_implications.hypotheses.map(x=>`<article class="card claim">${badge(x.confidence)}<h3>${esc(x.title)}</h3><p>${esc(x.hypothesis)}</p><div class="callout warning"><b>反向信号</b>${listHtml(x.counter_signals)}<b>未知项</b>${listHtml(x.unknowns)}</div><div class=refs>${hids(x.evidence_ids)}</div></article>`).join("")}</div><h3>首轮确认问题</h3>${listHtml(data.sales_implications.discovery_questions)}</section>
<section class=section id=evidence><h2>完整证据清单</h2><div class=table-wrap><table><thead><tr><th>ID</th><th>来源</th><th>标题与定位</th><th>时间</th><th>摘录</th></tr></thead><tbody>${data.evidence.map(e=>`<tr class=evidence id="evidence-${esc(e.id)}"><td><b>${esc(e.id)}</b></td><td>${esc(e.provider)}<br>${badge(e.authority)} ${badge(e.directness)}</td><td><b>${esc(e.title)}</b><br>${url(e.url)?`<a class=source-link href="${esc(e.url)}" target=_blank rel="noopener noreferrer">${esc(e.url)}</a>`:`<span class=muted>${esc(e.locator)}</span>`}<br><small>${esc([e.tool_name,e.query,e.record_id].filter(Boolean).join(" · "))}</small></td><td>${esc(e.published_at||"—")}<br><small>访问 ${esc(e.accessed_at)}</small></td><td>${esc(e.excerpt||"—")}</td></tr>`).join("")}</tbody></table></div></section>
</main><footer class=footer>研究 ID ${esc(data.research_id)} · 源文件 SHA-256 ${sha} · 自动生成，请勿直接编辑</footer></body></html>`;
fs.writeFileSync(htmlPath, html, "utf8");
console.log(`已生成:\n- ${mdPath}\n- ${htmlPath}\n源 SHA-256: ${sha}`);