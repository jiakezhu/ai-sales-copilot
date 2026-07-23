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

test("v2 Skill source exposes five discovery lanes and both delivery gates", () => {
  const skill = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  ["ICP 圈选", "事件驱动", "招聘驱动", "采购驱动", "相似与生态扩展"].forEach(lane => assert.match(skill, new RegExp(lane)));
  assert.match(skill, /validate-crm-json\.mjs/);
  assert.match(skill, /audit-prospect-quality\.mjs/);
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
