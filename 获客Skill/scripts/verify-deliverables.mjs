#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [jsonFile, mdFile, htmlFile] = process.argv.slice(2);
if (!htmlFile) {
  console.error("用法: node verify-deliverables.mjs <json> <lead-list.md> <lead-list.html>");
  process.exit(2);
}

let source;
let bundle;
let markdown;
let html;
try {
  source = fs.readFileSync(path.resolve(jsonFile), "utf8").replace(/^\uFEFF/, "");
  bundle = JSON.parse(source);
  markdown = fs.readFileSync(path.resolve(mdFile), "utf8");
  html = fs.readFileSync(path.resolve(htmlFile), "utf8");
} catch (error) {
  console.error(`读取失败: ${error.message}`);
  process.exit(1);
}

const errors = [];
const sha = crypto.createHash("sha256").update(source).digest("hex");
if (bundle.schema_version !== "crm-customer-list.v1" || !Array.isArray(bundle.customers)) errors.push("JSON 不是 crm-customer-list.v1 customers[] 契约");
for (const [name, text] of [["Markdown", markdown], ["HTML", html]]) {
  if (!text.includes(bundle.run_id)) errors.push(`${name} 缺少运行 ID`);
  if (!text.includes(sha)) errors.push(`${name} 源 SHA-256 不一致`);
  for (const customer of bundle.customers || []) {
    if (!text.includes(customer.name)) errors.push(`${name} 缺少客户：${customer.name}`);
    for (const list of [customer.marketNews, customer.hiringSignals, customer.bidding, customer.qualifications]) {
      for (const item of Array.isArray(list) ? list : []) {
        if (item.id && !text.includes(item.id)) errors.push(`${name} 缺少证据 ID：${item.id}`);
      }
    }
  }
}
if (!markdown.includes("generated-from-json") || !markdown.includes("优先级总览") || !markdown.includes("证据与来源索引")) errors.push("Markdown 缺少生成标记或核心章节");
if (!html.includes(`name="customer-count" content="${bundle.customers.length}"`)) errors.push("HTML 客户计数元信息不一致");
if (!html.includes("Enterprise Prospect Intelligence") || !html.includes("证据与来源索引")) errors.push("HTML 缺少报告结构");
if (/<script[^>]+src=/i.test(html) || /<link[^>]+rel=["']?stylesheet/i.test(html)) errors.push("HTML 存在外部脚本或样式依赖");
if (/javascript\s*:/i.test(html)) errors.push("HTML 存在不安全 javascript: URL");
if (!/@media\s*\(max-width/i.test(html) || !/@media\s+print/i.test(html)) errors.push("HTML 缺少响应式或打印样式");
if (fs.statSync(mdFile).size < 1800) errors.push("Markdown 过小，疑似渲染不完整");
if (fs.statSync(htmlFile).size < 7000) errors.push("HTML 过小，疑似渲染不完整");
if (!markdown.includes("不代表已经触达或建联") || !html.includes("公开身份不等于已建联")) errors.push("报告缺少公开关系与建联状态边界");

if (errors.length) {
  console.error(`三文件一致性检查失败（${errors.length} 项）`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`三文件一致性检查通过：${bundle.customers.length} 家客户，SHA ${sha.slice(0, 12)}…`);