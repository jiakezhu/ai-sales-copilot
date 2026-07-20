import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import CustomerImporter from "../customer-import.js";

const moduleSource = readFileSync(new URL("../customer-import.js", import.meta.url), "utf8");

const fixedOptions = {
  now: new Date(2026, 6, 17),
  idFactory(_row, sequence) { return `customer-${sequence}`; },
};

test("模块同时提供 Node ESM 可加载 API 和浏览器全局对象", () => {
  assert.equal(typeof CustomerImporter.importCSV, "function");
  const sandbox = {};
  vm.runInNewContext(moduleSource, sandbox);
  assert.equal(typeof sandbox.CustomerImporter.parseCSV, "function");
  assert.match(sandbox.CustomerImporter.CSV_TEMPLATE, /^客户名称,行业,阶段,等级/);
});

test("中文 CSV 转为兼容现有 CRM 的完整客户结构", () => {
  const csv = "\uFEFF客户名称,行业,阶段,等级,联系人,职位,电话,邮箱,下一步,提醒日期,备注\n星云科技,企业服务,已约见,重点,张三,CTO,13800000000,zhang@example.com,发送方案,2026-08-01,关注成本";
  const result = CustomerImporter.importCSV(csv, [], fixedOptions);

  assert.deepEqual({ imported: result.imported, updated: result.updated, skipped: result.skipped }, { imported: 1, updated: 0, skipped: 0 });
  assert.equal(result.errors.length, 0);
  const customer = result.customers[0];
  assert.equal(customer.name, "星云科技");
  assert.equal(customer.createdAt, "2026-07-17 00:00");
  assert.equal(customer.stage, "meeting");
  assert.equal(customer.grade, "A");
  assert.equal(customer.fields.industry.v, "企业服务");
  assert.deepEqual(
    { name: customer.orgChain[0].name, role: customer.orgChain[0].role, phone: customer.orgChain[0].phone, email: customer.orgChain[0].email },
    { name: "张三", role: "CTO", phone: "13800000000", email: "zhang@example.com" },
  );
  assert.deepEqual(
    { content: customer.notes[0].content, next: customer.notes[0].next, nextDate: customer.notes[0].nextDate },
    { content: "关注成本", next: "发送方案", nextDate: "2026-08-01" },
  );
  for (const key of ["orgChain", "painPoints", "solution", "notes", "assets", "stageHistory"]) assert.ok(Array.isArray(customer[key]), key);
});

test("CSV 解析支持英文表头、引号中的逗号和双引号转义", () => {
  const csv = 'Company,Industry,Stage,Grade,Contact,Notes\n"Acme, Inc.",Cloud,proposal,S,Alice,"He said ""yes"", then called"';
  const rows = CustomerImporter.parseCSV(csv);
  assert.equal(rows[1][0], "Acme, Inc.");
  assert.equal(rows[1][5], 'He said "yes", then called');

  const customers = CustomerImporter.rowsToCustomers(rows, fixedOptions);
  assert.equal(customers[0].name, "Acme, Inc.");
  assert.equal(customers[0].fields.industry.v, "Cloud");
  assert.equal(customers[0].stage, "proposal");
  assert.equal(customers[0].grade, "S");
});

test("skip 策略同时跳过已有客户和同批次重名客户", () => {
  const existing = [{ id: "old", name: "重复公司", stage: "lead", grade: "C", fields: { industry: { v: "旧行业" } }, orgChain: [], notes: [] }];
  const csv = "客户名称,行业\n重复公司,新行业\n新客户,制造业\n 新客户 ,零售业";
  const result = CustomerImporter.importCSV(csv, existing, { ...fixedOptions, strategy: "skip" });

  assert.deepEqual({ imported: result.imported, updated: result.updated, skipped: result.skipped }, { imported: 1, updated: 0, skipped: 2 });
  assert.equal(result.customers.length, 2);
  assert.equal(result.customers.find(customer => customer.id === "old").fields.industry.v, "旧行业");
  assert.equal(existing[0].fields.industry.v, "旧行业", "导入不应修改调用方传入的已有客户");
});

test("update 策略合并非空字段且保留既有客户身份和数据", () => {
  const existing = [{
    id: "old", name: "更新公司", logo: "更", color: "#000", stage: "lead", grade: "C",
    fields: { industry: { v: "旧行业" }, relation: { v: "既有关系" } },
    orgChain: [{ id: "contact-old", pid: null, name: "李四", role: "经理", phone: "", email: "old@example.com" }],
    notes: [{ id: "old-note", content: "历史记录" }], assets: [{ id: "asset-1" }],
  }];
  const csv = "公司名称,行业,阶段,等级,联系人,职位,电话,下一步,提醒日期,备注\n更新公司,云计算,成交,A,李四,CTO,13900000000,签合同,2026-08-02,已确认预算";
  const result = CustomerImporter.importCSV(csv, existing, { ...fixedOptions, strategy: "update" });
  const customer = result.customers[0];

  assert.deepEqual({ imported: result.imported, updated: result.updated, skipped: result.skipped }, { imported: 0, updated: 1, skipped: 0 });
  assert.equal(customer.id, "old");
  assert.equal(customer.stage, "won");
  assert.equal(customer.grade, "A");
  assert.equal(customer.fields.industry.v, "云计算");
  assert.equal(customer.fields.relation.v, "既有关系");
  assert.equal(customer.orgChain.length, 1);
  assert.equal(customer.orgChain[0].role, "CTO");
  assert.equal(customer.orgChain[0].phone, "13900000000");
  assert.equal(customer.orgChain[0].email, "old@example.com");
  assert.equal(customer.notes.length, 2);
  assert.equal(customer.assets.length, 1);
  assert.equal(customer.assets[0].id, "asset-1");
});

test("缺少客户名称时报告准确行号且不导入该行", () => {
  const rows = [["客户名称", "行业"], ["", "制造业"], ["有效客户", "零售"]];
  const result = CustomerImporter.importRows(rows, [], fixedOptions);

  assert.equal(result.imported, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].row, 2);
  assert.equal(result.errors[0].field, "name");
  assert.equal(result.errors[0].message, "缺少必填字段：客户名称");
});

test("自动识别制表符并支持 SheetJS 风格二维 rows", () => {
  const tsv = "客户名称\t所属行业\t销售阶段\t重点等级\t联系人\t职位\n制表客户\t游戏\t建联中\tB\t王五\t技术负责人";
  const parsed = CustomerImporter.parseCSV(tsv);
  assert.equal(parsed[0].length, 6);
  const result = CustomerImporter.importRows(parsed, [], fixedOptions);

  assert.equal(result.imported, 1);
  assert.equal(result.customers[0].stage, "contact");
  assert.equal(result.customers[0].grade, "B");
  assert.equal(result.customers[0].orgChain[0].name, "王五");
});

test("提醒日期统一归一化并拒绝无效日期", () => {
  assert.equal(CustomerImporter.normalizeImportDate("2026/8/1"), "2026-08-01");
  assert.equal(CustomerImporter.normalizeImportDate("2026年8月2日"), "2026-08-02");
  assert.equal(CustomerImporter.normalizeImportDate("46235"), "2026-08-01");
  assert.equal(CustomerImporter.normalizeImportDate("2026-02-30"), "");

  const rows = [["客户名称", "下一步", "提醒日期"], ["有效客户", "发送方案", "2026/8/1"], ["异常客户", "回访", "下个月"]];
  const result = CustomerImporter.importRows(rows, [], fixedOptions);
  assert.equal(result.imported, 2);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].field, "nextDate");
  assert.equal(result.customers.find(customer => customer.name === "有效客户").notes[0].nextDate, "2026-08-01");
  assert.equal(result.customers.find(customer => customer.name === "异常客户").notes[0].nextDate, "");
});
