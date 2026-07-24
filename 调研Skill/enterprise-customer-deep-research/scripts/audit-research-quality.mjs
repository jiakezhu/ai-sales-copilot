import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input) { console.error("用法: node audit-research-quality.mjs <json>"); process.exit(2); }
const bundle = JSON.parse(fs.readFileSync(path.resolve(input), "utf8"));
if (bundle.schema_version !== "crm-customer-list.v1" || !Array.isArray(bundle.customers) || bundle.customers.length !== 1 || !bundle.customers[0]?.deepResearch) { console.error("质量审计要求 CRM 原生单客户 deepResearch JSON，文件名不限。"); process.exit(1); }
const customer = bundle.customers[0];
const data = customer.deepResearch;
const errors = [], warnings = [];
if (data.subject?.legal_name !== customer.name) errors.push("deepResearch 主体名称与 CRM 客户名称不一致");
const evidence = new Map(), claims = new Map();
for (const e of data.evidence || []) { if (evidence.has(e.id)) errors.push(`重复证据 ID: ${e.id}`); evidence.set(e.id, e); }
for (const c of data.claims || []) { if (claims.has(c.id)) errors.push(`重复主张 ID: ${c.id}`); claims.set(c.id, c); }
const evidenceRefs = [], claimRefs = [];
function walk(value, at = "$") {
  if (Array.isArray(value)) return value.forEach((v, i) => walk(v, `${at}[${i}]`));
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value)) {
    if (k === "evidence_ids" || k === "counter_evidence_ids") (v || []).forEach(id => evidenceRefs.push([id, `${at}.${k}`]));
    if (k === "claim_ids" || k === "key_claim_ids" || k === "trend_claim_ids" || k === "supporting_claim_ids") (v || []).forEach(id => claimRefs.push([id, `${at}.${k}`]));
    if (k === "ultimate_controller_claim_id" && v) claimRefs.push([v, `${at}.${k}`]);
    walk(v, `${at}.${k}`);
  }
}
walk(data);
for (const [id, at] of evidenceRefs) if (!evidence.has(id)) errors.push(`悬空证据引用 ${id} @ ${at}`);
for (const [id, at] of claimRefs) if (!claims.has(id)) errors.push(`悬空主张引用 ${id} @ ${at}`);
const requiredDims = ["identity","ownership","organization","people","business","hiring","news","procurement","ip","risks","sales"];
const coverage = new Map((data.source_coverage || []).map(x => [x.dimension, x]));
for (const d of requiredDims) if (!coverage.has(d)) errors.push(`缺少覆盖维度: ${d}`);
if (coverage.size !== (data.source_coverage || []).length) errors.push("source_coverage 存在重复维度");
const subjectProviders = new Set((data.subject?.evidence_ids || []).map(id => evidence.get(id)?.provider).filter(Boolean));
if (subjectProviders.size < 2) errors.push("主体锁定不足两个独立提供方");
for (const c of data.claims || []) {
  if (["verified","inferred","conflicted"].includes(c.status) && !c.evidence_ids.length) errors.push(`${c.id} 没有证据`);
  if (c.status === "inferred" && !c.rationale.trim()) errors.push(`${c.id} 推测缺少 rationale`);
  if (c.status === "unknown" && c.confidence !== "unverified") errors.push(`${c.id} unknown 应为 unverified`);
  if (c.confidence === "high") {
    const sources = c.evidence_ids.map(id => evidence.get(id)).filter(Boolean);
    const providers = new Set(sources.map(e => e.provider));
    if (!sources.some(e => e.authority === "high" && e.directness === "primary") && providers.size < 2) errors.push(`${c.id} 高置信证据不足`);
  }
}
for (const p of data.ownership?.penetration_paths || []) {
  if (p.nodes.length !== p.direct_percentages.length + 1) errors.push(`股权路径比例数量不匹配: ${p.nodes.join(" -> ")}`);
  if (!p.terminal_type && !p.stop_reason) errors.push(`股权路径没有终点或停止原因: ${p.nodes.join(" -> ")}`);
}
const futureLimit = Date.parse(data.generated_at || new Date().toISOString()) + 86400000;
for (const e of data.evidence || []) if (Date.parse(e.accessed_at) > futureLimit) errors.push(`${e.id} accessed_at 晚于生成时间`);
const forbiddenKeys = /personal_phone|private_email|id_card|home_address|kinship/i;
function scanKeys(value, at = "$") { if (!value || typeof value !== "object") return; for (const [k,v] of Object.entries(value)) { if (forbiddenKeys.test(k)) errors.push(`存在禁止的个人信息字段 ${at}.${k}`); scanKeys(v, `${at}.${k}`); } }
scanKeys(data);
for (const d of ["ownership","people","hiring","news"]) if (["not_found","inaccessible"].includes(coverage.get(d)?.status)) warnings.push(`核心维度 ${d} 未形成实质结果: ${coverage.get(d).status}`);
if (!(data.conflicts || []).length) warnings.push("未记录冲突；请确认确实没有来源冲突");
if (!(data.blind_spots || []).length) warnings.push("未记录数据盲区；深度调研通常至少有一项不可见信息");
if (errors.length) { console.error(`质量审计失败（${errors.length} 项）`); errors.forEach(x => console.error(`- ${x}`)); if (warnings.length) warnings.forEach(x => console.error(`! ${x}`)); process.exit(1); }
console.log(`质量审计通过。证据 ${evidence.size}，主张 ${claims.size}，覆盖维度 ${coverage.size}/11。`);
warnings.forEach(x => console.warn(`提醒: ${x}`));