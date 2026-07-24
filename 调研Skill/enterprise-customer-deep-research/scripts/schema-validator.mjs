const isRecord = value => !!value && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function typeMatches(value, expected) {
  if (expected === "null") return value === null;
  if (expected === "array") return Array.isArray(value);
  if (expected === "object") return isRecord(value);
  if (expected === "integer") return Number.isInteger(value);
  if (expected === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === expected;
}

function childPath(base, key, arrayItem = false) {
  if (arrayItem) return `${base}[${key}]`;
  return base === "$" ? `$.${key}` : `${base}.${key}`;
}

function resolvePointer(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`仅支持本地 JSON Pointer：${ref}`);
  return ref.slice(2).split("/").reduce((current, token) => {
    const key = token.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!current || !Object.prototype.hasOwnProperty.call(current, key)) throw new Error(`无法解析 Schema 引用：${ref}`);
    return current[key];
  }, root);
}

function validDateTime(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

export function validateSchema(document, rootSchema) {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });

  const visit = (value, rule, path) => {
    if (!isRecord(rule)) return;
    if (rule.$ref) visit(value, resolvePointer(rootSchema, rule.$ref), path);
    (rule.allOf || []).forEach(item => visit(value, item, path));

    if (Object.prototype.hasOwnProperty.call(rule, "const") && !same(value, rule.const)) add(path, `必须等于 ${JSON.stringify(rule.const)}`);
    if (Array.isArray(rule.enum) && !rule.enum.some(item => same(value, item))) add(path, `值不在允许范围 ${JSON.stringify(rule.enum)}`);

    const expectedTypes = Array.isArray(rule.type) ? rule.type : rule.type ? [rule.type] : [];
    if (expectedTypes.length && !expectedTypes.some(type => typeMatches(value, type))) {
      add(path, `类型必须为 ${expectedTypes.join(" 或 ")}`);
      return;
    }

    if (typeof value === "string") {
      const length = Array.from(value).length;
      if (Number.isInteger(rule.minLength) && length < rule.minLength) add(path, `长度不能少于 ${rule.minLength}`);
      if (Number.isInteger(rule.maxLength) && length > rule.maxLength) add(path, `长度不能超过 ${rule.maxLength}`);
      if (rule.pattern && !(new RegExp(rule.pattern)).test(value)) add(path, `格式不符合 ${rule.pattern}`);
      if (rule.format === "date-time" && !validDateTime(value)) add(path, "必须是 ISO 8601 date-time");
    }

    if (typeof value === "number") {
      if (typeof rule.minimum === "number" && value < rule.minimum) add(path, `不能小于 ${rule.minimum}`);
      if (typeof rule.maximum === "number" && value > rule.maximum) add(path, `不能大于 ${rule.maximum}`);
    }

    if (Array.isArray(value)) {
      if (Number.isInteger(rule.minItems) && value.length < rule.minItems) add(path, `至少包含 ${rule.minItems} 项`);
      if (Number.isInteger(rule.maxItems) && value.length > rule.maxItems) add(path, `最多包含 ${rule.maxItems} 项`);
      if (rule.items) value.forEach((item, index) => visit(item, rule.items, childPath(path, index, true)));
    }

    if (isRecord(value)) {
      (rule.required || []).forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(value, key)) add(childPath(path, key), "缺少必填字段");
      });
      const properties = isRecord(rule.properties) ? rule.properties : {};
      Object.entries(properties).forEach(([key, childRule]) => {
        if (Object.prototype.hasOwnProperty.call(value, key)) visit(value[key], childRule, childPath(path, key));
      });
      if (rule.additionalProperties === false) {
        Object.keys(value).filter(key => !Object.prototype.hasOwnProperty.call(properties, key)).forEach(key => {
          add(childPath(path, key), "不允许的额外字段");
        });
      }
    }
  };

  visit(document, rootSchema, "$");
  return errors;
}
