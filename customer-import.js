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
  const COLORS = ["#0052d9", "#0d9488", "#7c3aed", "#ed7b2f", "#6366f1", "#0ea5a4"];
  const FIELD_KEYS = ["industry", "founded", "staff", "funding", "product", "dau", "revenue", "cloudStatus", "billNote", "relation"];

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
    mappedRecords(rows).forEach(record => {
      if (record.empty) return;
      const values = { ...record.values };
      const key = nameKey(values.name);
      if (!key) {
        errors.push({ row: record.row, field: "name", message: "缺少必填字段：客户名称" });
        return;
      }
      if (clean(values.nextDate) && !normalizeImportDate(values.nextDate)) {
        errors.push({ row: record.row, field: "nextDate", message: "提醒日期格式无效，请使用 YYYY-MM-DD" });
        values.nextDate = "";
      }
      sequence += 1;
      const incoming = createCustomer(values, settings, sequence);
      const duplicate = index.get(key);
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
    return { imported, updated, skipped, errors, customers };
  }

  function importCSV(text, existingCustomers, options) {
    try {
      return importRows(parseCSV(text, options), existingCustomers, options);
    } catch (error) {
      return {
        imported: 0, updated: 0, skipped: 0,
        errors: [{ row: 0, field: "csv", message: error instanceof Error ? error.message : String(error) }],
        customers: clone(Array.isArray(existingCustomers) ? existingCustomers : []),
      };
    }
  }

  return {
    CSV_TEMPLATE,
    template: CSV_TEMPLATE,
    parseCSV,
    parseCsv: parseCSV,
    convertRows,
    rowsToCustomers,
    importRows,
    importCSV,
    importCsv: importCSV,
    normalizeStage,
    normalizeGrade,
    normalizeImportDate,
  };
});
