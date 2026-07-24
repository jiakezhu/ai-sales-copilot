import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSchema } from "./schema-validator.mjs";

const input = process.argv[2];
if (!input) { console.error("用法: node validate-research.mjs <任意文件名.json>"); process.exit(2); }
const here = path.dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(fs.readFileSync(path.join(here, "..", "references", "crm-customer-list.v1.schema.json"), "utf8"));
let data;
try { data = JSON.parse(fs.readFileSync(path.resolve(input), "utf8")); }
catch (error) { console.error(`JSON 读取失败: ${error.message}`); process.exit(1); }
const placeholders = [];
function findPlaceholders(value, at = "$") {
  if (typeof value === "string" && /^__(?:FILL|REMOVE)_[A-Z0-9_]+__$/.test(value)) placeholders.push(`${at} = ${value}`);
  else if (Array.isArray(value)) value.forEach((item, index) => findPlaceholders(item, `${at}[${index}]`));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => findPlaceholders(item, `${at}.${key}`));
}
findPlaceholders(data);
if (placeholders.length) {
  console.error(`脚手架尚未填写完成（${placeholders.length} 个占位符）`);
  placeholders.slice(0, 30).forEach(item => console.error(`- ${item}`));
  if (placeholders.length > 30) console.error(`- 其余 ${placeholders.length - 30} 个占位符已省略`);
  console.error("请替换占位符；没有可靠信息的可选对象或数组项应整项删除。");
  process.exit(1);
}
if (data.schema_version !== "crm-customer-list.v1") { console.error("深调 JSON 必须使用 CRM 顶层版本 crm-customer-list.v1，文件名不限。"); process.exit(1); }
if (!Array.isArray(data.customers) || data.customers.length !== 1 || !data.customers[0]?.deepResearch) { console.error("深调 JSON 必须且只能包含一个带 deepResearch 的 customers[] 客户。"); process.exit(1); }
const errors = validateSchema(data, schema);
if (errors.length) { console.error(`Schema 校验失败（${errors.length} 项）`); errors.forEach(e => console.error(`- ${e.path}: ${e.message}`)); process.exit(1); }
const customer = data.customers[0], research = customer.deepResearch;
if (research.subject.legal_name !== customer.name) { console.error("deepResearch 主体名称必须与 CRM 客户名称一致。"); process.exit(1); }
console.log(`CRM 原生深调 Schema 校验通过: ${customer.name}，${research.claims.length} 条主张，${research.evidence.length} 条证据。`);