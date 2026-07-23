(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CustomerImporter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CSV_COLUMNS = [
    "客户名称", "行业", "阶段", "等级", "联系人", "职位", "电话", "邮箱", "下一步", "提醒日期", "备注",
  ];
  const CSV_TEMPLATE = `${CSV_COLUMNS.join(",")}\n示例科技,企业服务,线索,A,张三,CTO,13800000000,zhangsan@example.com,发送方案,2026-08-01,首次接洽`;
  const JSON_SCHEMA_VERSION = "crm-customer-list.v1";
  const SOURCE_KEYS = ["", "customer", "website", "qcc", "tyc", "qxb", "web", "panshi"];
  const CONFIDENCE_KEYS = ["unverified", "high", "medium", "low"];
  const COLORS = ["#0052d9", "#0d9488", "#7c3aed", "#ed7b2f", "#6366f1", "#0ea5a4"];
  const FIELD_KEYS = [
    "industry", "founded", "staff", "funding", "website", "product", "dau", "revenue",
    "creditCode", "legalPerson", "regCapital", "regAddress", "businessModel", "techStack",
    "shareholders", "parentSubs", "supplyChain", "recentNews", "hiring", "riskNote", "triggerEvents",
    "cloudStatus", "billNote", "relation",
  ];
  const NATIVE_ARRAY_KEYS = [
    "orgChain", "marketNews", "hiringSignals", "bidding", "qualifications", "painPoints", "solution",
    "notes", "assets", "stageHistory", "jointWorkPlan", "meetingPreps", "meetingReviews", "salesAssets",
  ];
  const SKILL_FORBIDDEN_ARRAY_KEYS = [
    "painPoints", "solution", "notes", "assets", "stageHistory",
    "jointWorkPlan", "meetingPreps", "meetingReviews", "salesAssets",
  ];

  const HEADER_ALIASES = {
    name: ["客户名称", "客户名", "公司", "公司名称", "企业名称", "name", "customer", "customername", "company", "companyname"],
    industry: ["行业", "所属行业", "industry"],
    stage: ["阶段", "客户阶段", "销售阶段", "stage", "customerstage", "salesstage"],
    grade: ["等级", "客户等级", "重点等级", "优先级", "grade", "level", "priority"],
    contact: ["联系人", "联系人姓名", "对接人", "contact", "contactname"],
    role: ["职位", "职务", "联系人职位", "role", "title", "position", "jobtitle"],
    phone: ["电话", "手机号", "手机", "联系电话", "phone", "mobile", "telephone", "tel"],
    email: ["邮箱", "电子邮箱", "邮件", "email", "emailaddress"],
    next: ["下一步", "下一步行动", "后续动作", "next", "nextstep", "nextaction"],
    nextDate: ["提醒日期", "下次跟进日期", "下一步日期", "reminderdate", "nextdate", "followupdate"],
    remarks: ["备注", "说明", "跟进备注", "notes", "note", "remarks", "remark", "comments", "comment"],
  };

  const STAGES = {
    lead: ["lead", "线索", "潜客", "潜在客户"],
    contact: ["contact", "建联", "建联中", "已联系", "接洽", "接洽中"],
    meeting: ["meeting", "已约见", "约见", "会议", "已开会"],
    proposal: ["proposal", "方案", "方案中", "提案", "报价", "商务谈判"],
    won: ["won", "win", "已成交", "成交", "赢单", "签约"],
    lost: ["lost", "已流失", "流失", "输单", "丢单"],
  };

  const clean = value => String(value == null ? "" : value).trim();
  const comparable = value => clean(value).replace(/[\s_\-—–/\\()（）【】\[\].·:：]+/g, "").toLocaleLowerCase();
  const nameKey = value => clean(value).replace(/\s+/g, " ").toLocaleLowerCase();
  const headerLookup = new Map();
  Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => aliases.forEach(alias => headerLookup.set(comparable(alias), key)));

  function detectDelimiter(text) {
    let commas = 0;
    let tabs = 0;
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === '"') {
        if (quoted && text[index + 1] === '"') index += 1;
        else quoted = !quoted;
      } else if (!quoted && (character === "\n" || character === "\r")) {
        break;
      } else if (!quoted && character === ",") commas += 1;
      else if (!quoted && character === "\t") tabs += 1;
    }
    return tabs > commas ? "\t" : ",";
  }

  function parseCSV(source, options) {
    const text = String(source == null ? "" : source).replace(/^\uFEFF/, "");
    if (!text) return [];
    const delimiter = options && options.delimiter ? String(options.delimiter) : detectDelimiter(text);
    if (delimiter.length !== 1) throw new TypeError("CSV 分隔符必须是单个字符");

    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index += 1;
          } else quoted = false;
        } else if (character === "\r" && text[index + 1] === "\n") {
          field += "\n";
          index += 1;
        } else field += character;
        continue;
      }
      if (character === '"' && field === "") quoted = true;
      else if (character === delimiter) {
        row.push(field);
        field = "";
      } else if (character === "\n" || character === "\r") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        if (character === "\r" && text[index + 1] === "\n") index += 1;
      } else field += character;
    }
    if (quoted) throw new Error("CSV 存在未闭合的引号");
    if (field !== "" || row.length) {
      row.push(field);
      rows.push(row);
    }
    while (rows.length && rows[rows.length - 1].every(value => clean(value) === "")) rows.pop();
    return rows;
  }

  function normalizeStage(value, fallback) {
    const candidate = comparable(value);
    if (!candidate) return fallback || "lead";
    for (const [key, aliases] of Object.entries(STAGES)) {
      if (aliases.some(alias => comparable(alias) === candidate)) return key;
    }
    return fallback || "lead";
  }

  function normalizeGrade(value, fallback) {
    const candidate = clean(value).toUpperCase();
    const direct = candidate.match(/(?:^|[^A-Z])([SABC])(?:[^A-Z]|$)/);
    if (direct) return direct[1];
    const labels = { 战略级: "S", 战略: "S", 重点: "A", 常规: "B", 培育: "C" };
    for (const [label, grade] of Object.entries(labels)) if (candidate.includes(label)) return grade;
    return fallback || "B";
  }

  function normalizeImportDate(value) {
    const source = clean(value);
    if (!source) return "";
    const format = (year, month, day) => {
      const y = Number(year); const m = Number(month); const d = Number(day);
      const date = new Date(Date.UTC(y, m - 1, d));
      if (y < 1900 || y > 2100 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };
    let matched = source.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?(?:\s+.*)?$/);
    if (matched) return format(matched[1], matched[2], matched[3]);
    matched = source.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:\s+.*)?$/);
    if (matched) return format(matched[3], matched[1], matched[2]);
    if (/^\d{4,5}(?:\.\d+)?$/.test(source)) {
      const serial = Math.floor(Number(source));
      if (serial > 0 && serial < 100000) {
        const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        return format(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
      }
    }
    return "";
  }

  function tableFromRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return { headers: [], records: [], firstDataRow: 2 };
    if (rows[0] && !Array.isArray(rows[0]) && typeof rows[0] === "object") {
      const headers = [];
      rows.forEach(record => Object.keys(record || {}).forEach(header => { if (!headers.includes(header)) headers.push(header); }));
      return { headers, records: rows.map(record => headers.map(header => record && record[header])), firstDataRow: 1 };
    }
    const headers = Array.from(rows[0] || []);
    return { headers, records: rows.slice(1).map(row => Array.isArray(row) ? row : []), firstDataRow: 2 };
  }

  function mappedRecords(rows) {
    const table = tableFromRows(rows);
    const mappedHeaders = table.headers.map(header => headerLookup.get(comparable(header)) || "");
    return table.records.map((row, index) => {
      const values = {};
      mappedHeaders.forEach((key, column) => {
        if (key && clean(values[key]) === "" && clean(row[column]) !== "") values[key] = clean(row[column]);
      });
      return { values, row: table.firstDataRow + index, empty: row.every(value => clean(value) === "") };
    });
  }

  function makeFields(industry) {
    const fields = {};
    FIELD_KEYS.forEach(key => { fields[key] = { v: key === "industry" ? clean(industry) : "", source: "", confidence: "unverified", verifiedAt: "" }; });
    return fields;
  }

  function localDate(value) {
    const date = value instanceof Date ? value : new Date();
    const pad = number => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function createCustomer(values, options, sequence) {
    const name = clean(values.name);
    const idFactory = options && options.idFactory;
    const id = clean(typeof idFactory === "function" ? idFactory(values, sequence) : "") || `import-${Date.now().toString(36)}-${sequence.toString(36)}`;
    const now = options && options.now;
    const today = localDate(typeof now === "function" ? now() : now);
    const customer = {
      id,
      name,
      createdAt: `${today} 00:00`,
      logo: Array.from(name)[0] || "客",
      color: COLORS[(sequence - 1) % COLORS.length],
      stage: normalizeStage(values.stage),
      grade: normalizeGrade(values.grade),
      fields: makeFields(values.industry),
      orgChain: [],
      painPoints: [],
      solution: [],
      notes: [],
      assets: [],
      funnel: { reached: 0, connected: 0, meeting: 0, proposal: 0, won: 0 },
      stageHistory: [{ stage: normalizeStage(values.stage), date: today, note: "批量导入" }],
    };
    const contactName = clean(values.contact);
    if (contactName) {
      customer.orgChain.push({
        id: `${id}-contact-1`, pid: null, name: contactName, role: clean(values.role), level: 3,
        phone: clean(values.phone), phoneType: "unverified", wechat: "", email: clean(values.email), note: clean(values.remarks),
      });
    }
    const nextDate = normalizeImportDate(values.nextDate);
    if (clean(values.remarks) || clean(values.next) || nextDate) {
      customer.notes.push({
        id: `${id}-note-1`, method: "other", date: `${today} 00:00`, contact: contactName, place: "",
        content: clean(values.remarks), next: clean(values.next), nextDate, taskDone: false,
      });
    }
    return customer;
  }

  function convertRows(rows, options) {
    const customers = [];
    const errors = [];
    let sequence = 0;
    mappedRecords(rows).forEach(record => {
      if (record.empty) return;
      if (!clean(record.values.name)) {
        errors.push({ row: record.row, field: "name", message: "缺少必填字段：客户名称" });
        return;
      }
      const values = { ...record.values };
      if (clean(values.nextDate) && !normalizeImportDate(values.nextDate)) {
        errors.push({ row: record.row, field: "nextDate", message: "提醒日期格式无效，请使用 YYYY-MM-DD" });
        values.nextDate = "";
      }
      sequence += 1;
      customers.push(createCustomer(values, options || {}, sequence));
    });
    return { customers, errors };
  }

  function rowsToCustomers(rows, options) {
    return convertRows(rows, options).customers;
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function nonEmpty(value) {
    if (typeof value === "string") return value.trim() !== "";
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined;
  }

  function selectedRowSet(options) {
    if (!Array.isArray(options && options.selectedRows)) return null;
    return new Set(options.selectedRows.map(Number).filter(Number.isFinite));
  }

  function importItem(row, values, action, selected, errors) {
    return {
      row,
      name: clean(values && values.name) || `第 ${row} 条未命名客户`,
      industry: clean(values && values.industry),
      stage: clean(values && values.stage),
      grade: clean(values && values.grade).toUpperCase(),
      action,
      selected,
      errors: (errors || []).map(item => item.message),
    };
  }
  function parseCRMJSON(source) {
    const bundle = typeof source === "string"
      ? JSON.parse(String(source).replace(/^\uFEFF/, ""))
      : clone(source);
    if (!isRecord(bundle)) throw new TypeError("JSON 顶层必须是对象");
    if (bundle.schema_version !== JSON_SCHEMA_VERSION) throw new TypeError(`schema_version 必须为 ${JSON_SCHEMA_VERSION}`);
    if (typeof bundle.run_id !== "string" || !clean(bundle.run_id)) throw new TypeError("run_id 不能为空");
    const generatedAt = clean(bundle.generated_at);
    if (typeof bundle.generated_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(generatedAt) || Number.isNaN(Date.parse(generatedAt))) throw new TypeError("generated_at 必须是 ISO 8601 date-time");
    if (!Array.isArray(bundle.customers) || !bundle.customers.length) throw new TypeError("JSON 缺少非空 customers 数组");
    if (bundle.customers.length > 1000) throw new TypeError("customers 最多包含 1000 家客户");
    return bundle;
  }

  function validateNativeCustomer(raw, row) {
    const errors = [];
    const add = (field, message) => errors.push({ row, field, message });
    if (!isRecord(raw)) {
      add("customer", "客户记录必须是对象");
      return errors;
    }
    if (!clean(raw.name)) add("name", "缺少必填字段：客户名称");
    if (!Object.prototype.hasOwnProperty.call(STAGES, raw.stage)) add("stage", `客户阶段无效：${clean(raw.stage) || "空"}`);
    if (!["S", "A", "B", "C"].includes(clean(raw.grade).toUpperCase())) add("grade", `客户等级无效：${clean(raw.grade) || "空"}`);
    if (!isRecord(raw.fields)) add("fields", "fields 必须是 CRM 情报字段对象");
    else {
      Object.entries(raw.fields).forEach(([key, value]) => {
        if (!FIELD_KEYS.includes(key)) add(`fields.${key}`, `不支持的 CRM 情报字段：${key}`);
        else if (!isRecord(value) || typeof value.v !== "string") add(`fields.${key}`, `${key} 必须使用 { v, source, confidence, verifiedAt } 结构`);
        else {
          if (typeof value.source !== "string" || !SOURCE_KEYS.includes(value.source)) add(`fields.${key}.source`, `来源代码无效：${clean(value.source) || "空"}`);
          if (typeof value.confidence !== "string" || !CONFIDENCE_KEYS.includes(value.confidence)) add(`fields.${key}.confidence`, `置信度无效：${clean(value.confidence) || "空"}`);
          if (typeof value.verifiedAt !== "string" || (value.verifiedAt && !/^\d{4}-\d{2}-\d{2}$/.test(value.verifiedAt))) add(`fields.${key}.verifiedAt`, "核验日期必须为空或 YYYY-MM-DD");
          if (["cloudStatus", "billNote", "relation"].includes(key) && value.v) add(`fields.${key}.v`, `获客 Skill 不得填充 ${key} 销售私有字段`);
        }
      });
    }
    NATIVE_ARRAY_KEYS.forEach(key => {
      if (raw[key] !== undefined && !Array.isArray(raw[key])) add(key, `${key} 必须是数组`);
    });
    SKILL_FORBIDDEN_ARRAY_KEYS.forEach(key => {
      if (Array.isArray(raw[key]) && raw[key].length) add(key, `获客 Skill 不得生成 ${key} 销售私有数据`);
    });
    ["businessBrief", "painChain"].forEach(key => {
      if (raw[key] !== undefined && !isRecord(raw[key])) add(key, `${key} 必须是对象`);
    });
    if (Array.isArray(raw.orgChain)) raw.orgChain.forEach((person, index) => {
      if (!isRecord(person) || !clean(person.name)) add(`orgChain.${index}`, "联系人必须包含姓名");
      if (isRecord(person) && (typeof person.role !== "string" || typeof person.note !== "string")) add(`orgChain.${index}`, "联系人必须直接提供字符串 role 和 note");
      if (isRecord(person) && (!Number.isInteger(person.level) || ![1, 2, 3].includes(person.level))) add(`orgChain.${index}.level`, "联系人层级只能为整数 1、2 或 3");
    });
    if (isRecord(raw.painChain) && Object.keys(raw.painChain).length && raw.painChain.inferred !== true) add("painChain.inferred", "销售假设必须明确标记 inferred: true");
    return errors;
  }

  function nativeField(value) {
    return { v: "", source: "", confidence: "unverified", verifiedAt: "", ...(isRecord(value) ? clone(value) : {}) };
  }

  function prepareNativeCustomer(raw, options, sequence) {
    const customer = clone(raw);
    const name = clean(customer.name);
    const idFactory = options && options.idFactory;
    const generatedId = clean(typeof idFactory === "function" ? idFactory(raw, sequence) : "") || `import-${Date.now().toString(36)}-${sequence.toString(36)}`;
    const now = options && options.now;
    const today = localDate(typeof now === "function" ? now() : now);
    customer.id = clean(customer.id) || generatedId;
    customer.name = name;
    customer.createdAt = clean(customer.createdAt) || `${today} 00:00`;
    customer.logo = clean(customer.logo) || Array.from(name)[0] || "客";
    customer.color = clean(customer.color) || COLORS[(sequence - 1) % COLORS.length];
    customer.stage = clean(customer.stage);
    customer.grade = clean(customer.grade).toUpperCase();
    customer.fields = Object.fromEntries(Object.entries(customer.fields || {}).map(([key, value]) => [key, nativeField(value)]));
    NATIVE_ARRAY_KEYS.forEach(key => { customer[key] = Array.isArray(customer[key]) ? customer[key] : []; });
    customer.businessBrief = isRecord(customer.businessBrief) ? customer.businessBrief : {};
    customer.painChain = isRecord(customer.painChain) ? customer.painChain : {};
    customer.funnel = isRecord(customer.funnel) ? customer.funnel : { reached: 0, connected: 0, meeting: 0, proposal: 0, won: 0 };
    if (!customer.stageHistory.length) customer.stageHistory.push({ stage: customer.stage, date: today, note: "批量导入" });
    customer.orgChain = customer.orgChain.map((person, index) => ({
      ...person,
      id: clean(person.id) || `${customer.id}-contact-${index + 1}`,
      pid: person.pid || null,
      name: clean(person.name),
      role: clean(person.role),
      level: Number(person.level),
      phone: clean(person.phone),
      phoneType: clean(person.phoneType) || "unverified",
      wechat: clean(person.wechat),
      email: clean(person.email),
      note: clean(person.note),
    }));
    return customer;
  }

  function recordKey(value) {
    if (!isRecord(value)) return JSON.stringify(value);
    return clean(value.id) || JSON.stringify(value);
  }

  function mergeRecordArray(target, incoming, key) {
    target[key] ||= [];
    const known = new Set(target[key].map(recordKey));
    (incoming[key] || []).forEach(item => {
      const fingerprint = recordKey(item);
      if (!known.has(fingerprint)) {
        target[key].push(clone(item));
        known.add(fingerprint);
      }
    });
  }

  function mergeNativeCustomer(target, incoming) {
    target.stage = incoming.stage;
    target.grade = incoming.grade;
    target.fields ||= {};
    Object.entries(incoming.fields || {}).forEach(([key, value]) => {
      if (clean(value && value.v)) target.fields[key] = clone(value);
    });
    target.orgChain ||= [];
    (incoming.orgChain || []).forEach(person => {
      const matched = target.orgChain.find(item => nameKey(item.name) === nameKey(person.name));
      if (!matched) target.orgChain.push(clone(person));
      else Object.entries(person).forEach(([key, value]) => { if (nonEmpty(value) && key !== "id") matched[key] = clone(value); });
    });
    ["marketNews", "hiringSignals", "bidding", "qualifications"].forEach(key => mergeRecordArray(target, incoming, key));
    ["businessBrief", "painChain"].forEach(key => {
      target[key] ||= {};
      Object.entries(incoming[key] || {}).forEach(([field, value]) => { if (nonEmpty(value)) target[key][field] = clone(value); });
    });
    target.stageHistory ||= [];
    if (!target.stageHistory.length || target.stageHistory.at(-1)?.stage !== incoming.stage) {
      target.stageHistory.push(clone(incoming.stageHistory[0]));
    }
    return target;
  }

  function importJSON(source, existingCustomers, options) {
    const settings = options || {};
    const strategy = clean(settings.strategy || "skip").toLocaleLowerCase();
    const original = clone(Array.isArray(existingCustomers) ? existingCustomers : []);
    const selectedRows = selectedRowSet(settings);
    if (strategy !== "skip" && strategy !== "update") throw new TypeError("去重策略仅支持 skip 或 update");
    try {
      const bundle = parseCRMJSON(source);
      const customers = clone(original);
      const index = new Map();
      customers.forEach(customer => {
        const key = nameKey(customer && customer.name);
        if (key && !index.has(key)) index.set(key, customer);
      });
      const errors = [];
      let imported = 0;
      let updated = 0;
      let skipped = 0;
      let sequence = 0;
      const items = [];
      bundle.customers.forEach((raw, indexInFile) => {
        const row = indexInFile + 1;
        const selected = !selectedRows || selectedRows.has(row);
        const recordErrors = validateNativeCustomer(raw, row);
        if (recordErrors.length) {
          items.push(importItem(row, {
            name: raw && raw.name,
            industry: raw && raw.fields && raw.fields.industry && raw.fields.industry.v,
            stage: raw && raw.stage,
            grade: raw && raw.grade,
          }, "error", selected, recordErrors));
          if (selected) errors.push(...recordErrors);
          return;
        }
        const key = nameKey(raw.name);
        const duplicate = index.get(key);
        const action = duplicate ? strategy : "import";
        items.push(importItem(row, {
          name: raw.name,
          industry: raw.fields && raw.fields.industry && raw.fields.industry.v,
          stage: raw.stage,
          grade: raw.grade,
        }, action, selected));
        if (!selected) return;
        sequence += 1;
        const incoming = prepareNativeCustomer(raw, settings, sequence);
        if (duplicate) {
          if (strategy === "skip") skipped += 1;
          else {
            mergeNativeCustomer(duplicate, incoming);
            updated += 1;
          }
          return;
        }
        customers.unshift(incoming);
        index.set(key, incoming);
        imported += 1;
      });
      return { imported, updated, skipped, errors, customers, items, schemaVersion: bundle.schema_version };
    } catch (error) {
      return {
        imported: 0, updated: 0, skipped: 0,
        errors: [{ row: 0, field: "json", message: error instanceof Error ? error.message : String(error) }],
        customers: original, items: [],
      };
    }
  }
  function mergeContact(target, incoming) {
    const contact = incoming.orgChain && incoming.orgChain[0];
    if (!contact) return;
    target.orgChain ||= [];
    const matched = target.orgChain.find(item => nameKey(item.name) === nameKey(contact.name));
    if (!matched) {
      target.orgChain.push(contact);
      return;
    }
    ["role", "email", "note"].forEach(key => { if (clean(contact[key])) matched[key] = contact[key]; });
    if (clean(contact.phone) && clean(contact.phone) !== clean(matched.phone)) {
      matched.phone = contact.phone;
      matched.phoneType = "unverified";
      matched.phoneVerifiedAt = "";
    }
  }

  function mergeCustomer(target, incoming, values) {
    target.fields ||= {};
    if (clean(values.industry)) target.fields.industry = { ...(target.fields.industry || {}), v: clean(values.industry) };
    if (clean(values.stage)) {
      target.stage = incoming.stage;
      target.stageHistory ||= [];
      target.stageHistory.push(incoming.stageHistory[0]);
    }
    if (clean(values.grade)) target.grade = incoming.grade;
    mergeContact(target, incoming);
    if (incoming.notes && incoming.notes[0]) {
      target.notes ||= [];
      const note = incoming.notes[0];
      const duplicate = target.notes.some(item => [item.content, item.next, item.nextDate, item.contact].every((value, index) => clean(value) === clean([note.content, note.next, note.nextDate, note.contact][index])));
      if (!duplicate) target.notes.push(note);
    }
    return target;
  }

  function importRows(rows, existingCustomers, options) {
    const settings = options || {};
    const strategy = clean(settings.strategy || "skip").toLocaleLowerCase();
    const selectedRows = selectedRowSet(settings);
    if (strategy !== "skip" && strategy !== "update") throw new TypeError("去重策略仅支持 skip 或 update");
    const customers = clone(Array.isArray(existingCustomers) ? existingCustomers : []);
    const index = new Map();
    customers.forEach(customer => {
      const key = nameKey(customer && customer.name);
      if (key && !index.has(key)) index.set(key, customer);
    });

    const errors = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let sequence = 0;
    const items = [];
    mappedRecords(rows).forEach(record => {
      if (record.empty) return;
      const values = { ...record.values };
      const selected = !selectedRows || selectedRows.has(record.row);
      const key = nameKey(values.name);
      if (!key) {
        const recordErrors = [{ row: record.row, field: "name", message: "缺少必填字段：客户名称" }];
        items.push(importItem(record.row, values, "error", selected, recordErrors));
        if (selected) errors.push(...recordErrors);
        return;
      }
      const recordErrors = [];
      if (clean(values.nextDate) && !normalizeImportDate(values.nextDate)) {
        recordErrors.push({ row: record.row, field: "nextDate", message: "提醒日期格式无效，请使用 YYYY-MM-DD" });
        values.nextDate = "";
      }
      const duplicate = index.get(key);
      const action = duplicate ? strategy : "import";
      items.push(importItem(record.row, { ...values, stage: normalizeStage(values.stage), grade: normalizeGrade(values.grade) }, action, selected, recordErrors));
      if (!selected) return;
      errors.push(...recordErrors);
      sequence += 1;
      const incoming = createCustomer(values, settings, sequence);
      if (duplicate) {
        if (strategy === "skip") skipped += 1;
        else {
          mergeCustomer(duplicate, incoming, values);
          updated += 1;
        }
        return;
      }
      customers.unshift(incoming);
      index.set(key, incoming);
      imported += 1;
    });
    return { imported, updated, skipped, errors, customers, items };
  }
  function importCSV(text, existingCustomers, options) {
    try {
      return importRows(parseCSV(text, options), existingCustomers, options);
    } catch (error) {
      return {
        imported: 0, updated: 0, skipped: 0,
        errors: [{ row: 0, field: "csv", message: error instanceof Error ? error.message : String(error) }],
        customers: clone(Array.isArray(existingCustomers) ? existingCustomers : []), items: [],
      };
    }
  }

  return {
    CSV_TEMPLATE,
    JSON_SCHEMA_VERSION,
    template: CSV_TEMPLATE,
    parseCSV,
    parseCsv: parseCSV,
    convertRows,
    rowsToCustomers,
    importRows,
    importCSV,
    importCsv: importCSV,
    importJSON,
    importJson: importJSON,
    parseCRMJSON,
    normalizeStage,
    normalizeGrade,
    normalizeImportDate,
  };
});
