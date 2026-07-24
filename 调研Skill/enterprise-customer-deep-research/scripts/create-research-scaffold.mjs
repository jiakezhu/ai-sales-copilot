import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const company = valueAfter("--company");
const query = valueAfter("--query") || company;
const output = valueAfter("--out") || "company-deep-research.json";
if (!company) {
  console.error("用法: node create-research-scaffold.mjs --company <法定名称> [--query <原始查询>] [--out <json>]");
  process.exit(2);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(fs.readFileSync(path.join(here, "..", "references", "crm-customer-list.v1.schema.json"), "utf8"));
const now = new Date();
const iso = now.toISOString();
const date = iso.slice(0, 10);
const stamp = iso.replace(/\D/g, "").slice(0, 14);
const fill = at => `__FILL_${at.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase()}__`;

function resolve(rule) {
  if (!rule?.$ref) return rule || {};
  return rule.$ref.slice(2).split("/").reduce((value, token) => value[token.replace(/~1/g, "/").replace(/~0/g, "~")], schema);
}

function build(rule, at, arrayIndex = 0, includeOptional = false) {
  rule = resolve(rule);
  if (Object.prototype.hasOwnProperty.call(rule, "const")) return structuredClone(rule.const);
  if (Array.isArray(rule.enum)) return structuredClone(rule.enum[0]);
  const type = Array.isArray(rule.type) ? rule.type.find(x => x !== "null") : rule.type;
  if (type === "object" || rule.properties) {
    const result = {};
    const keys = includeOptional ? Object.keys(rule.properties || {}) : (rule.required || []);
    for (const key of keys) result[key] = build(rule.properties[key], `${at}.${key}`, 0, includeOptional);
    return result;
  }
  if (type === "array") {
    if (!rule.items) return [];
    const count = Math.max(rule.minItems || 0, 1);
    return Array.from({ length: count }, (_, index) => build(rule.items, `${at}[${index}]`, index, includeOptional));
  }
  if (type === "boolean") return false;
  if (type === "integer" || type === "number") return typeof rule.minimum === "number" ? rule.minimum : 0;
  if (type === "null") return null;
  if (rule.format === "date-time") return iso;
  if (rule.format === "date" || /(?:^|\.)(?:date|as_of|published_at)$/.test(at)) return date;
  if (/\.id$/.test(at)) {
    if (at.includes(".evidence[")) return `E${String(arrayIndex + 1).padStart(3, "0")}`;
    if (at.includes(".claims[")) return `C${String(arrayIndex + 1).padStart(3, "0")}`;
  }
  return fill(at);
}

const customerRule = schema.$defs.customer;
const customer = {
  name: company,
  stage: "lead",
  grade: "B",
  fields: build(schema.$defs.fields, "$.customers[0].fields", 0, true),
  orgChain: build(customerRule.properties.orgChain, "$.customers[0].orgChain"),
  marketNews: build(customerRule.properties.marketNews, "$.customers[0].marketNews"),
  hiringSignals: build(customerRule.properties.hiringSignals, "$.customers[0].hiringSignals"),
  bidding: build(customerRule.properties.bidding, "$.customers[0].bidding"),
  qualifications: build(customerRule.properties.qualifications, "$.customers[0].qualifications"),
  businessBrief: build(customerRule.properties.businessBrief, "$.customers[0].businessBrief", 0, true),
  painChain: build(customerRule.properties.painChain, "$.customers[0].painChain", 0, true),
  jointWorkPlan: [],
  meetingPreps: [],
  meetingReviews: [],
  salesAssets: [],
  painPoints: [],
  solution: [],
  notes: [],
  assets: [],
  stageHistory: [],
  deepResearch: build(customerRule.properties.deepResearch, "$.customers[0].deepResearch")
};

const research = customer.deepResearch;
research.schema_version = "company-deep-research.v1";
research.research_id = `research-${stamp}`;
research.generated_at = iso;
research.subject.legal_name = company;
research.subject.query = query;
research.subject.evidence_ids = ["E001", "E002"];
research.scope.as_of = date;
research.source_coverage = [
  "identity", "ownership", "organization", "people", "business", "hiring",
  "news", "procurement", "ip", "risks", "sales"
].map(dimension => ({
  dimension,
  status: "not_found",
  providers_attempted: [fill(`source_coverage.${dimension}.providers_attempted`)],
  notes: fill(`source_coverage.${dimension}.notes`),
  evidence_ids: []
}));
research.executive_summary.key_claim_ids = ["C001"];
research.claims[0].id = "C001";
research.claims[0].evidence_ids = ["E001"];
research.claims[0].counter_evidence_ids = [];
research.evidence[0].id = "E001";
research.evidence[1].id = "E002";

const bundle = {
  schema_version: "crm-customer-list.v1",
  run_id: `deep-research-${stamp}`,
  generated_at: iso,
  customers: [customer]
};

const target = path.resolve(output);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
console.log(`已生成强制脚手架: ${target}`);
console.log("所有 __FILL_* 占位符必须替换；没有可靠信息的可选记录必须整项删除。");
