#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSchema } from "./schema-validator.mjs";

const file = process.argv[2];
if (!file) {
  console.error("用法: node validate-crm-json.mjs <crm-customer-list.v1.json>");
  process.exit(2);
}

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(baseDir, "../references/crm-customer-list.v1.schema.json");
const readJSON = target => JSON.parse(fs.readFileSync(path.resolve(target), "utf8").replace(/^\uFEFF/, ""));

let bundle;
let schema;
try {
  bundle = readJSON(file);
  schema = readJSON(schemaPath);
} catch (error) {
  console.error(`JSON 读取失败: ${error.message}`);
  process.exit(1);
}

const errors = validateSchema(bundle, schema).map(item => `${item.path}: ${item.message}`);
if (Array.isArray(bundle?.customers)) {
  const counts = { A: 0, B: 0, C: 0 };
  bundle.customers.forEach((customer, index) => {
    if (customer?.stage !== "lead") errors.push(`$.customers[${index}].stage: 获客 Skill 输出必须固定为 lead`);
    if (!Object.prototype.hasOwnProperty.call(counts, customer?.grade)) errors.push(`$.customers[${index}].grade: 获客 Skill 只允许 A/B/C`);
    else counts[customer.grade] += 1;
  });
  if (bundle.summary?.customer_counts) {
    ["A", "B", "C"].forEach(grade => {
      if (bundle.summary.customer_counts[grade] !== counts[grade]) errors.push(`$.summary.customer_counts.${grade}: 摘要数量与 customers[] 不一致`);
    });
    if (bundle.summary.customer_counts.S !== 0) errors.push("$.summary.customer_counts.S: 获客 Skill 不应输出 S 级客户");
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`完整 Schema 校验通过：${bundle.customers.length} 家客户，schema=${bundle.schema_version}`);
