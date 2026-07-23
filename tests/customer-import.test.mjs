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
    { name: customer.orgChain[0].name, role: customer.orgChain[0].role, phone: customer.orgChain[0].phone, phoneType: customer.orgChain[0].phoneType, email: customer.orgChain[0].email },
    { name: "张三", role: "CTO", phone: "13800000000", phoneType: "unverified", email: "zhang@example.com" },
  );
  assert.deepEqual(
    { source: customer.fields.industry.source, confidence: customer.fields.industry.confidence, verifiedAt: customer.fields.industry.verifiedAt },
    { source: "", confidence: "unverified", verifiedAt: "" },
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
  assert.equal(customer.orgChain[0].phoneType, "unverified");
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

test("CRM 原生 JSON 直接导入并保留公开情报结构", () => {
  const bundle = {
    schema_version: "crm-customer-list.v1",
    run_id: "run-1",
    generated_at: "2026-07-22T16:12:33+08:00",
    customers: [{
      name: "深圳示例科技有限公司",
      stage: "lead",
      grade: "A",
      fields: {
        industry: { v: "软件和信息技术服务业", source: "tyc", confidence: "high", verifiedAt: "2026-07-22" },
        website: { v: "https://example.com", source: "website", confidence: "high", verifiedAt: "2026-07-22" },
      },
      orgChain: [{ id: "", name: " 李四 ", role: "CTO", level: 2, phone: " 13800000000 ", note: "公开资料" }],
      marketNews: [{ id: "ev-1", title: "发布新产品", publishedAt: "2026-07-01", sourceUrl: "https://example.com/news", signal: "近期扩张", impact: "核实数据库扩容窗口" }],
      hiringSignals: [], bidding: [], qualifications: [],
      businessBrief: { products: "企业软件", painHypothesis: "推测，未获客户确认：可能存在数据库弹性需求。", unknowns: ["现有云厂商未知"] },
      painChain: { signal: "发布新产品", pain: "推测，未获客户确认", impact: "待核实", solution: "", question: "当前数据库峰值是多少？", inferred: true },
      painPoints: [], solution: [], notes: [], assets: [], stageHistory: [],
    }],
  };
  const result = CustomerImporter.importJSON(JSON.stringify(bundle), [], fixedOptions);
  assert.deepEqual({ imported: result.imported, updated: result.updated, skipped: result.skipped }, { imported: 1, updated: 0, skipped: 0 });
  assert.equal(result.errors.length, 0);
  const customer = result.customers[0];
  assert.equal(customer.id, "customer-1");
  assert.equal(customer.fields.industry.v, "软件和信息技术服务业");
  assert.equal(customer.fields.industry.source, "tyc");
  assert.equal(customer.marketNews[0].id, "ev-1");
  assert.equal(customer.orgChain[0].id, "customer-1-contact-1");
  assert.equal(customer.orgChain[0].name, "李四");
  assert.equal(customer.orgChain[0].phone, "13800000000");
  assert.equal(customer.businessBrief.unknowns[0], "现有云厂商未知");
  assert.equal(customer.painChain.inferred, true);
  assert.equal(customer.stageHistory[0].note, "批量导入");
});

test("CRM 原生 JSON 拒绝错误版本、畸形 JSON 和非法客户字段", () => {
  const malformed = CustomerImporter.importJSON("{", [{ id: "old", name: "原客户" }], fixedOptions);
  assert.equal(malformed.imported, 0);
  assert.equal(malformed.errors[0].field, "json");
  assert.equal(malformed.customers[0].name, "原客户");

  const wrongVersion = CustomerImporter.importJSON({ schema_version: "cloud-lead-list.v1", customers: [] }, [], fixedOptions);
  assert.match(wrongVersion.errors[0].message, /schema_version/);

  const missingCustomers = CustomerImporter.importJSON({
    schema_version: "crm-customer-list.v1", run_id: "run-missing", generated_at: "2026-07-22T16:12:33+08:00",
  }, [], fixedOptions);
  assert.match(missingCustomers.errors[0].message, /customers/);

  const invalid = CustomerImporter.importJSON({
    schema_version: "crm-customer-list.v1",
    run_id: "run-invalid",
    generated_at: "2026-07-22T16:12:33+08:00",
    customers: [{ name: "", stage: "prospect", grade: "X", fields: {
      industry: "软件",
      website: { v: "https://example.com" },
    } }],
  }, [], fixedOptions);
  assert.equal(invalid.imported, 0);
  assert.ok(invalid.errors.some(item => item.field === "name"));
  assert.ok(invalid.errors.some(item => item.field === "stage"));
  assert.ok(invalid.errors.some(item => item.field === "grade"));
  assert.ok(invalid.errors.some(item => item.field === "fields.industry"));
  assert.ok(invalid.errors.some(item => item.field === "fields.website.source"));
  assert.ok(invalid.errors.some(item => item.field === "fields.website.confidence"));
  assert.ok(invalid.errors.some(item => item.field === "fields.website.verifiedAt"));
});

test("CRM 原生 JSON update 合并非空情报并保留既有私有字段", () => {
  const existing = [{
    id: "existing", name: "更新公司", stage: "contact", grade: "B",
    fields: { industry: { v: "旧行业" }, relation: { v: "既有私有关系" } },
    orgChain: [], marketNews: [{ id: "old-news", title: "旧动态" }], notes: [{ id: "note-1", content: "真实跟进" }], stageHistory: [],
  }];
  const bundle = {
    schema_version: "crm-customer-list.v1",
    run_id: "run-update",
    generated_at: "2026-07-22T16:12:33+08:00",
    customers: [{
      name: "更新公司", stage: "lead", grade: "A",
      fields: { industry: { v: "云计算", source: "qxb", confidence: "high", verifiedAt: "2026-07-22" } },
      orgChain: [], marketNews: [{ id: "new-news", title: "新动态", sourceUrl: "https://example.com/new", signal: "扩张", impact: "待核实" }], hiringSignals: [], bidding: [], qualifications: [],
      businessBrief: { products: "云平台" }, painChain: {}, painPoints: [], solution: [], notes: [], assets: [], stageHistory: [],
    }],
  };
  const result = CustomerImporter.importJSON(bundle, existing, { ...fixedOptions, strategy: "update" });
  const customer = result.customers[0];
  assert.equal(result.updated, 1);
  assert.equal(customer.id, "existing");
  assert.equal(customer.fields.industry.v, "云计算");
  assert.equal(customer.fields.relation.v, "既有私有关系");
  assert.deepEqual(customer.marketNews.map(item => item.id), ["old-news", "new-news"]);
  assert.equal(customer.notes[0].content, "真实跟进");
});

test("获客 Skill JSON 不得携带销售推进或已确认痛点", () => {
  const result = CustomerImporter.importJSON({
    schema_version: "crm-customer-list.v1",
    run_id: "run-forbidden",
    generated_at: "2026-07-22T16:12:33+08:00",
    customers: [{
      name: "越界客户", stage: "lead", grade: "C", fields: {},
      notes: [{ content: "已沟通预算" }], painPoints: [{ v: "已确认痛点" }], jointWorkPlan: [{ title: "未经确认的计划" }], solution: [], assets: [], stageHistory: [],
    }],
  }, [], fixedOptions);
  assert.equal(result.imported, 0);
  assert.ok(result.errors.some(item => item.field === "notes"));
  assert.ok(result.errors.some(item => item.field === "painPoints"));
  assert.ok(result.errors.some(item => item.field === "jointWorkPlan"));
});
test("selectedRows 只导入用户勾选的 JSON 客户并返回全部逐条预览状态", () => {
  const bundle = {
    schema_version: "crm-customer-list.v1",
    run_id: "run-selection",
    generated_at: "2026-07-23T10:00:00+08:00",
    customers: ["甲公司", "乙公司", "丙公司"].map((name, index) => ({
      name, stage: "lead", grade: index === 0 ? "A" : "B",
      fields: { industry: { v: "软件", source: "web", confidence: "medium", verifiedAt: "2026-07-23" } },
    })),
  };
  const result = CustomerImporter.importJSON(bundle, [], { ...fixedOptions, selectedRows: [1, 3] });

  assert.equal(result.imported, 2);
  assert.deepEqual(result.items.map(item => ({ row: item.row, name: item.name, selected: item.selected, action: item.action })), [
    { row: 1, name: "甲公司", selected: true, action: "import" },
    { row: 2, name: "乙公司", selected: false, action: "import" },
    { row: 3, name: "丙公司", selected: true, action: "import" },
  ]);
  assert.deepEqual(result.customers.map(customer => customer.name).sort(), ["丙公司", "甲公司"]);
});

test("取消勾选的表格错误行不会阻塞其他客户导入", () => {
  const rows = [["客户名称", "行业", "阶段", "等级"], ["", "制造业", "线索", "B"], ["有效客户", "零售", "已约见", "重点"]];
  const result = CustomerImporter.importRows(rows, [], { ...fixedOptions, selectedRows: [3] });

  assert.equal(result.imported, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].action, "error");
  assert.equal(result.items[0].selected, false);
  assert.equal(result.items[1].stage, "meeting");
  assert.equal(result.items[1].grade, "A");
  assert.equal(result.customers[0].name, "有效客户");
});
