import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = path.join(root, "调研Skill", "enterprise-customer-deep-research");
const sample = path.join(root, "调研Skill", "sample-output", "company-deep-research.json");
const run = (script, args) => spawnSync(process.execPath, [path.join(skill, "scripts", script), ...args], { cwd: root, encoding: "utf8" });

test("深度调研样例通过 Schema 与质量审计", () => {
  for (const script of ["validate-research.mjs", "audit-research-quality.mjs"]) {
    const result = run(script, [sample]);
    assert.equal(result.status, 0, `${script}\n${result.stdout}\n${result.stderr}`);
  }
});

test("渲染器生成一致的 Markdown 与独立 HTML", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-"));
  const rendered = run("render-research.mjs", [sample, "--out", out]);
  assert.equal(rendered.status, 0, rendered.stderr);
  const md = path.join(out, "company-deep-research.md"), html = path.join(out, "company-deep-research.html");
  const verified = run("verify-deliverables.mjs", [sample, md, html]);
  assert.equal(verified.status, 0, verified.stderr);
  const htmlText = fs.readFileSync(html, "utf8");
  assert.match(htmlText, /@media\s+print/);
  assert.doesNotMatch(htmlText, /<script[^>]+src=/i);
  assert.doesNotMatch(htmlText, /<link[^>]+stylesheet/i);
});

test("缺少核心字段的 JSON 被拒绝", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-invalid-"));
  const broken = JSON.parse(fs.readFileSync(sample, "utf8"));
  delete broken.customers[0].deepResearch.subject.legal_name;
  const file = path.join(out, "broken.json");
  fs.writeFileSync(file, JSON.stringify(broken), "utf8");
  const result = run("validate-research.mjs", [file]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /legal_name/);
});

test("悬空证据引用和不足两来源主体锁定被质量审计拒绝", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-audit-"));
  const broken = JSON.parse(fs.readFileSync(sample, "utf8"));
  broken.customers[0].deepResearch.subject.evidence_ids = ["E001"];
  broken.customers[0].deepResearch.claims[0].evidence_ids.push("E999");
  const file = path.join(out, "broken.json");
  fs.writeFileSync(file, JSON.stringify(broken), "utf8");
  const result = run("audit-research-quality.mjs", [file]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /E999/);
  assert.match(result.stderr, /两个独立提供方/);
});
test("深调 JSON 顶层直接使用 CRM 单客户契约且文件名不参与校验", () => {
  const bundle = JSON.parse(fs.readFileSync(sample, "utf8"));
  assert.equal(bundle.schema_version, "crm-customer-list.v1");
  assert.equal(bundle.customers.length, 1);
  assert.equal(bundle.customers[0].deepResearch.schema_version, "company-deep-research.v1");
  assert.ok(bundle.customers[0].orgChain.every(person => person.relationStatus === "identified"));
  const arbitrary = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "named-anything-")), "深圳客户完整尽调结果.json");
  fs.copyFileSync(sample, arbitrary);
  const result = run("validate-research.mjs", [arbitrary]);
  assert.equal(result.status, 0, result.stderr);
});


test("强制脚手架由 Schema 生成完整深调键并拒绝未填占位符", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-scaffold-"));
  const file = path.join(out, "任意名称.json");
  const created = run("create-research-scaffold.mjs", ["--company", "测试科技有限公司", "--out", file]);
  assert.equal(created.status, 0, created.stderr);
  const bundle = JSON.parse(fs.readFileSync(file, "utf8"));
  const research = bundle.customers[0].deepResearch;
  assert.equal(bundle.schema_version, "crm-customer-list.v1");
  assert.equal(research.schema_version, "company-deep-research.v1");
  assert.equal(research.subject.legal_name, "测试科技有限公司");
  for (const key of ["research_id", "generated_at", "scope", "source_coverage", "executive_summary", "events", "intellectual_property", "evidence"]) assert.ok(key in research, key);
  assert.equal(research.source_coverage.length, 11);
  const validation = run("validate-research.mjs", [file]);
  assert.notEqual(validation.status, 0);
  assert.match(validation.stderr, /脚手架尚未填写完成/);
});

test("渲染器对非法 JSON 失败关闭且不生成报告", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-render-gate-"));
  const broken = JSON.parse(fs.readFileSync(sample, "utf8"));
  delete broken.customers[0].deepResearch.schema_version;
  const file = path.join(out, "broken.json");
  const reports = path.join(out, "reports");
  fs.writeFileSync(file, JSON.stringify(broken), "utf8");
  const rendered = run("render-research.mjs", [file, "--out", reports]);
  assert.notEqual(rendered.status, 0);
  assert.match(rendered.stderr, /渲染已取消/);
  assert.equal(fs.existsSync(path.join(reports, "company-deep-research.md")), false);
  assert.equal(fs.existsSync(path.join(reports, "company-deep-research.html")), false);
});

test("唯一交付入口只在全部门禁通过后写入两份报告", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "deep-research-finalize-ok-"));
  const finalized = run("finalize-research.mjs", [sample, "--out", out]);
  assert.equal(finalized.status, 0, finalized.stderr);
  assert.equal(fs.existsSync(path.join(out, "company-deep-research.md")), true);
  assert.equal(fs.existsSync(path.join(out, "company-deep-research.html")), true);
});
