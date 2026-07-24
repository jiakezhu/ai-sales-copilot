import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validateSchema } from "../获客Skill/enterprise-prospect-research/scripts/schema-validator.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = path.join(root, "获客Skill", "enterprise-prospect-research");
const schema = JSON.parse(fs.readFileSync(path.join(skillRoot, "references", "crm-customer-list.v1.schema.json"), "utf8"));
const sampleMarkdown = fs.readFileSync(path.join(root, "获客Skill", "04-输出样例.md"), "utf8");
const sampleMatch = sampleMarkdown.match(/```json\s*([\s\S]*?)```/);
assert.ok(sampleMatch, "04-输出样例.md should contain a JSON code block");
const sample = JSON.parse(sampleMatch[1]);
const clone = value => JSON.parse(JSON.stringify(value));

test("获客 Skill 提供五通道与三件套交付链路", () => {
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  ["ICP 圈选", "事件驱动", "招聘驱动", "采购驱动", "相似与生态扩展"].forEach(lane => assert.match(skill, new RegExp(lane)));
  assert.match(skill, /validate-crm-json\.mjs/);
  assert.match(skill, /audit-prospect-quality\.mjs/);
  assert.match(skill, /render-prospect-report\.mjs/);
  assert.match(skill, /verify-deliverables\.mjs/);
  assert.ok(fs.existsSync(path.join(skillRoot, "agents", "openai.yaml")));
});

test("full schema validator accepts the documented CRM-native sample", () => {
  assert.deepEqual(validateSchema(sample, schema), []);
});

test("full schema validator catches nested required, extra, and forbidden data", () => {
  const invalid = clone(sample);
  delete invalid.customers[0].marketNews[0].sourceUrl;
  invalid.customers[0].marketNews[0].unexpected = true;
  invalid.customers[0].notes.push({ content: "不应出现的跟进" });
  const paths = validateSchema(invalid, schema).map(item => item.path);
  assert.ok(paths.includes("$.customers[0].marketNews[0].sourceUrl"));
  assert.ok(paths.includes("$.customers[0].marketNews[0].unexpected"));
  assert.ok(paths.includes("$.customers[0].notes"));
});

test("quality audit accepts recent evidence and rejects a stale A-grade bundle", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prospect-skill-"));
  const validPath = path.join(tempDir, "valid.json");
  fs.writeFileSync(validPath, JSON.stringify(sample), "utf8");
  const auditScript = path.join(skillRoot, "scripts", "audit-prospect-quality.mjs");
  const valid = spawnSync(process.execPath, [auditScript, validPath], { encoding: "utf8" });
  assert.equal(valid.status, 0, valid.stderr);

  const stale = clone(sample);
  stale.customers[0].marketNews.forEach(item => { item.publishedAt = "2025-01-01"; });
  stale.customers[0].hiringSignals.forEach(item => { item.postedAt = "2025-01-01"; });
  const stalePath = path.join(tempDir, "stale.json");
  fs.writeFileSync(stalePath, JSON.stringify(stale), "utf8");
  const rejected = spawnSync(process.execPath, [auditScript, stalePath], { encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /A 级客户缺少 90 天内/);
});

test("渲染器生成精美 Markdown、独立 HTML 并通过三文件一致性检查", () => {
  const samplePath = path.join(root, "获客Skill", "sample-output", "crm-customer-list.v1.json");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "prospect-report-"));
  const renderer = path.join(skillRoot, "scripts", "render-prospect-report.mjs");
  const verifier = path.join(skillRoot, "scripts", "verify-deliverables.mjs");
  const rendered = spawnSync(process.execPath, [renderer, samplePath, "--out", out], { encoding: "utf8" });
  assert.equal(rendered.status, 0, rendered.stderr);
  const mdPath = path.join(out, "lead-list.md");
  const htmlPath = path.join(out, "lead-list.html");
  const verified = spawnSync(process.execPath, [verifier, samplePath, mdPath, htmlPath], { encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);
  const mdText = fs.readFileSync(mdPath, "utf8");
  const htmlText = fs.readFileSync(htmlPath, "utf8");
  for (const phrase of ["管理摘要", "优先级总览", "研究评分与入选依据", "公开信号与证据", "证据与来源索引"]) assert.match(mdText, new RegExp(phrase));
  assert.match(htmlText, /Enterprise Prospect Intelligence/);
  assert.match(htmlText, /score-track/);
  assert.match(htmlText, /@media\s*\(max-width/);
  assert.match(htmlText, /@media\s+print/);
  assert.doesNotMatch(htmlText, /<script[^>]+src=/i);
  assert.doesNotMatch(htmlText, /<link[^>]+stylesheet/i);
});

test("质量审计拒绝评分合计错误或悬空证据引用", () => {
  const invalid = clone(sample);
  invalid.customers[0].prospectResearch.score = 99;
  invalid.customers[0].prospectResearch.evidenceIds.push("missing-evidence");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prospect-score-invalid-"));
  const invalidPath = path.join(tempDir, "invalid.json");
  fs.writeFileSync(invalidPath, JSON.stringify(invalid), "utf8");
  const auditScript = path.join(skillRoot, "scripts", "audit-prospect-quality.mjs");
  const rejected = spawnSync(process.execPath, [auditScript, invalidPath], { encoding: "utf8" });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /维度合计/);
  assert.match(rejected.stderr, /missing-evidence/);
});