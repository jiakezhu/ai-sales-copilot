import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [jsonFile, mdFile, htmlFile] = process.argv.slice(2);
if (!htmlFile) { console.error("用法: node verify-deliverables.mjs <json> <md> <html>"); process.exit(2); }
const here = path.dirname(fileURLToPath(import.meta.url));
const gate = spawnSync(process.execPath, [path.join(here, "quality-gate.mjs"), path.resolve(jsonFile)], { encoding: "utf8" });
if (gate.stdout) process.stdout.write(gate.stdout);
if (gate.stderr) process.stderr.write(gate.stderr);
if (gate.status !== 0) { console.error("一致性检查已取消：源 JSON 未通过交付门禁。"); process.exit(gate.status || 1); }
const source = fs.readFileSync(path.resolve(jsonFile), "utf8"), bundle = JSON.parse(source);
if (bundle.schema_version !== "crm-customer-list.v1" || !Array.isArray(bundle.customers) || bundle.customers.length !== 1 || !bundle.customers[0]?.deepResearch) { console.error("一致性检查要求 CRM 原生单客户 deepResearch JSON。"); process.exit(1); }
const customer = bundle.customers[0], data = customer.deepResearch;
const md = fs.readFileSync(path.resolve(mdFile), "utf8"), html = fs.readFileSync(path.resolve(htmlFile), "utf8");
const sha = crypto.createHash("sha256").update(source).digest("hex"), errors = [];
for (const [name, text] of [["Markdown",md],["HTML",html]]) {
  if (!text.includes(data.subject.legal_name)) errors.push(`${name} 缺少法定名称`);
  if (!text.includes(data.research_id)) errors.push(`${name} 缺少研究 ID`);
  if (!text.includes(sha)) errors.push(`${name} 源 SHA-256 不一致`);
  for (const e of data.evidence) if (!text.includes(e.id)) errors.push(`${name} 缺少证据 ${e.id}`);
  for (const c of data.claims) if (!text.includes(c.id)) errors.push(`${name} 缺少主张 ${c.id}`);
}
if (!md.includes("完整证据清单") || !md.includes("generated-from-json")) errors.push("Markdown 缺少证据清单或生成标记");
if (!html.includes(`name="evidence-count" content="${data.evidence.length}"`)) errors.push("HTML 证据计数元信息不一致");
if (!html.includes(`name="claim-count" content="${data.claims.length}"`)) errors.push("HTML 主张计数元信息不一致");
if (/<script[^>]+src=/i.test(html) || /<link[^>]+rel=["']?stylesheet/i.test(html)) errors.push("HTML 存在外部脚本或样式依赖");
if (/javascript\s*:/i.test(html)) errors.push("HTML 存在不安全 javascript: URL");
if (!/@media\s*\(max-width/i.test(html) || !/@media\s+print/i.test(html)) errors.push("HTML 缺少响应式或打印样式");
if (!html.includes("完整证据清单") || !html.includes("source-sha256")) errors.push("HTML 缺少证据清单或哈希元信息");
if (fs.statSync(mdFile).size < 1500 || fs.statSync(htmlFile).size < 5000) errors.push("报告文件过小，疑似渲染不完整");
if (errors.length) { console.error(`三文件一致性检查失败（${errors.length} 项）`); errors.forEach(x=>console.error(`- ${x}`)); process.exit(1); }
console.log(`三文件一致性检查通过：${data.subject.legal_name}，${data.claims.length} 条主张，${data.evidence.length} 条证据，SHA ${sha.slice(0,12)}…`);