#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSchema } from "./schema-validator.mjs";

const file = process.argv[2];
if (!file) {
  console.error("用法: node audit-prospect-quality.mjs <任意文件名.json>");
  process.exit(2);
}

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(baseDir, "../references/crm-customer-list.v1.schema.json");
const readJSON = target => JSON.parse(fs.readFileSync(path.resolve(target), "utf8").replace(/^\uFEFF/, ""));
const clean = value => String(value ?? "").trim();
const normalize = value => clean(value).replace(/[\s_\-—–/\\()（）【】\[\].·:：]+/g, "").toLocaleLowerCase();
const errors = [];
const warnings = [];
const addError = (where, message) => errors.push(`${where}: ${message}`);
const addWarning = (where, message) => warnings.push(`${where}: ${message}`);

let bundle;
let schema;
try {
  bundle = readJSON(file);
  schema = readJSON(schemaPath);
} catch (error) {
  console.error(`读取失败: ${error.message}`);
  process.exit(1);
}

validateSchema(bundle, schema).forEach(item => addError(item.path, item.message));
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const generatedAt = new Date(bundle.generated_at);
const ageDays = date => {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(clean(date)) ? new Date(`${date}T00:00:00Z`) : null;
  return parsed && !Number.isNaN(parsed.valueOf()) ? Math.floor((generatedAt - parsed) / 86400000) : null;
};
const evidenceOf = customer => [
  ...(customer.marketNews || []).map(item => ({ ...item, date: item.publishedAt })),
  ...(customer.hiringSignals || []).map(item => ({ ...item, date: item.postedAt })),
  ...(customer.bidding || []).map(item => ({ ...item, date: item.date || item.verifiedAt })),
  ...(customer.qualifications || []).map(item => ({ ...item, date: item.verifiedAt })),
];

const names = new Map();
const creditCodes = new Map();
const grades = { A: 0, B: 0, C: 0 };
let customersWithEvidence = 0;
let recent90Count = 0;
let recent180Count = 0;

bundle.customers.forEach((customer, index) => {
  const where = `customers[${index}](${customer.name})`;
  grades[customer.grade] = (grades[customer.grade] || 0) + 1;
  if (customer.stage !== "lead") addError(`${where}.stage`, "获客 Skill 输出阶段必须为 lead");
  if (!grades.hasOwnProperty(customer.grade)) addError(`${where}.grade`, "获客 Skill 只允许 A/B/C");

  const nameKey = normalize(customer.name);
  if (names.has(nameKey)) addError(where, `与 ${names.get(nameKey)} 重复企业名称`);
  else names.set(nameKey, customer.name);

  const creditCode = clean(customer.fields?.creditCode?.v).toUpperCase();
  if (creditCode) {
    if (creditCodes.has(creditCode)) addError(where, `统一社会信用代码与 ${creditCodes.get(creditCode)} 重复`);
    else creditCodes.set(creditCode, customer.name);
  }

  const evidence = evidenceOf(customer).filter(item => clean(item.sourceUrl));
  const uniqueEvidence = new Map(evidence.map(item => [clean(item.sourceUrl) || clean(item.id), item]));
  const research = customer.prospectResearch;
  if (!research || typeof research !== "object") addError(`${where}.prospectResearch`, "缺少评分与反向审查元数据");
  else {
    const dimensions = Array.isArray(research.scoreDimensions) ? research.scoreDimensions : [];
    const scoreTotal = dimensions.reduce((sum, item) => sum + Number(item.score || 0), 0);
    const maxTotal = dimensions.reduce((sum, item) => sum + Number(item.maxScore || 0), 0);
    if (scoreTotal !== research.score) addError(`${where}.prospectResearch.score`, `总分 ${research.score} 与维度合计 ${scoreTotal} 不一致`);
    if (maxTotal !== 100) addError(`${where}.prospectResearch.scoreDimensions`, `维度满分合计必须为 100，当前为 ${maxTotal}`);
    const knownIds = new Set(evidenceOf(customer).map(item => clean(item.id)).filter(Boolean));
    (research.evidenceIds || []).forEach(id => { if (!knownIds.has(clean(id))) addError(`${where}.prospectResearch.evidenceIds`, `引用了不存在的结构化证据 ${id}`); });
  }
  const dated = [...uniqueEvidence.values()].map(item => ({ ...item, age: ageDays(item.date) }));
  const recent90 = dated.filter(item => item.age !== null && item.age >= 0 && item.age <= 90);
  const recent180 = dated.filter(item => item.age !== null && item.age >= 0 && item.age <= 180);
  if (evidence.length) customersWithEvidence += 1;
  if (recent90.length) recent90Count += 1;
  if (recent180.length) recent180Count += 1;

  if (customer.grade === "A" && !recent90.length) addError(where, "A 级客户缺少 90 天内带 sourceUrl 的事件证据");
  if (customer.grade === "B" && recent180.length < 2) addError(where, "B 级客户少于 2 条 180 天内独立事件证据");
  if (customer.grade === "C" && !evidence.length) addWarning(where, "C 级客户没有结构化事件 URL，仅适合作为培育候选");

  const unknowns = customer.businessBrief?.unknowns;
  if (!Array.isArray(unknowns) || !unknowns.some(clean)) addError(`${where}.businessBrief.unknowns`, "至少提供 1 个未知项");
  if (!clean(customer.painChain?.question)) addError(`${where}.painChain.question`, "缺少首轮可验证问题");

  const hypothesis = clean(customer.businessBrief?.painHypothesis);
  const pain = clean(customer.painChain?.pain);
  [hypothesis, pain].filter(Boolean).forEach(text => {
    if (!/推测|假设|未获客户确认/.test(text)) addError(where, "需求或痛点推测未明确标注为推测/假设/未获客户确认");
  });

  evidence.forEach(item => {
    if (!/^https?:\/\//i.test(clean(item.sourceUrl))) addWarning(where, `证据 ${item.id || "未命名"} 的 sourceUrl 不是 HTTP(S)`);
  });
});

const expected = bundle.summary?.customer_counts;
if (expected) {
  ["A", "B", "C"].forEach(grade => {
    if (expected[grade] !== grades[grade]) addError(`summary.customer_counts.${grade}`, `摘要为 ${expected[grade]}，实际为 ${grades[grade]}`);
  });
  if (expected.S !== 0) addError("summary.customer_counts.S", "获客 Skill 不应输出 S 级客户");
}

warnings.forEach(message => console.warn(`警告: ${message}`));
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

const total = bundle.customers.length;
console.log(`质量审计通过：${total} 家；A=${grades.A}，B=${grades.B}，C=${grades.C}`);
console.log(`证据 URL 覆盖：${customersWithEvidence}/${total}；90 天事件：${recent90Count}/${total}；180 天事件：${recent180Count}/${total}；警告=${warnings.length}`);
