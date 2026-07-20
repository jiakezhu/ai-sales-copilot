(function (global) {
  "use strict";

  const TOKEN_KEY = "sales_api_token";
  const REVISION_KEY = "sales_api_customers_revision";
  const DEFAULT_TIMEOUT_MS = 12000;
  const API_BASE = typeof global.SALES_API_BASE_URL === "string"
    ? global.SALES_API_BASE_URL.trim().replace(/\/+$/, "")
    : "";

  class SalesAPIError extends Error {
    constructor(message, options) {
      const details = options || {};
      super(message);
      this.name = "SalesAPIError";
      this.code = details.code || "API_ERROR";
      this.status = Number(details.status) || 0;
      this.details = details.details == null ? null : details.details;
    }
  }

  function storage() {
    return global.localStorage && typeof global.localStorage.getItem === "function"
      ? global.localStorage
      : null;
  }

  function getToken() {
    try {
      return storage()?.getItem(TOKEN_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function getRevision() {
    try {
      const value = storage()?.getItem(REVISION_KEY);
      if (value === null || value === undefined || value === "") return null;
      const revision = Number(value);
      return Number.isInteger(revision) && revision >= 0 ? revision : null;
    } catch (_) {
      return null;
    }
  }

  function setRevision(revision) {
    if (!Number.isInteger(revision) || revision < 0) return;
    try { storage()?.setItem(REVISION_KEY, String(revision)); } catch (_) {}
  }

  function setToken(token) {
    if (typeof token !== "string" || !token.trim()) return;
    try {
      const next = token.trim();
      if (storage()?.getItem(TOKEN_KEY) !== next) storage()?.removeItem(REVISION_KEY);
      storage()?.setItem(TOKEN_KEY, next);
    } catch (_) {}
  }

  function clearToken() {
    try {
      storage()?.removeItem(TOKEN_KEY);
      storage()?.removeItem(REVISION_KEY);
    } catch (_) {}
  }

  function responseMessage(body, fallback) {
    if (body && typeof body === "object") {
      if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
      if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
      if (body.error && typeof body.error.message === "string" && body.error.message.trim()) {
        return body.error.message.trim();
      }
    }
    return fallback;
  }

  async function readJSON(response) {
    if (response.status === 204) return null;
    const text = await response.text();
    if (!text.trim()) return null;
    try {
      return JSON.parse(text);
    } catch (_) {
      throw new SalesAPIError("服务器返回了无法识别的数据", {
        code: "INVALID_RESPONSE",
        status: response.status,
      });
    }
  }

  async function request(path, options) {
    const settings = options || {};
    const controller = new global.AbortController();
    const timeoutMs = Number.isFinite(settings.timeoutMs) && settings.timeoutMs > 0
      ? settings.timeoutMs
      : DEFAULT_TIMEOUT_MS;
    const timer = global.setTimeout(() => controller.abort(), timeoutMs);
    const headers = { Accept: "application/json", ...(settings.headers || {}) };
    const token = getToken();

    if (token) headers.Authorization = `Bearer ${token}`;
    if (settings.body !== undefined) headers["Content-Type"] = "application/json";

    let response;
    try {
      response = await global.fetch(`${API_BASE}${path}`, {
        method: settings.method || "GET",
        headers,
        body: settings.body === undefined ? undefined : JSON.stringify(settings.body),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new SalesAPIError("请求超时，请检查网络后重试", { code: "TIMEOUT" });
      }
      throw new SalesAPIError("网络连接失败，请稍后重试", {
        code: "NETWORK_ERROR",
        details: error && error.message ? { message: error.message } : null,
      });
    } finally {
      global.clearTimeout(timer);
    }

    if (response.status === 401) clearToken();
    const body = await readJSON(response);
    if (!response.ok) {
      throw new SalesAPIError(
        responseMessage(body, response.status === 401 ? "登录已过期，请重新登录" : `请求失败（HTTP ${response.status}）`),
        {
          code: response.status === 401
            ? "UNAUTHORIZED"
            : (body && typeof body.code === "string"
              ? body.code
              : (body?.error && typeof body.error.code === "string" ? body.error.code : "HTTP_ERROR")),
          status: response.status,
          details: body,
        }
      );
    }
    return body;
  }

  function payloadOf(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return body;
    return body.data && typeof body.data === "object" ? body.data : body;
  }

  function tokenOf(body) {
    const payload = payloadOf(body);
    if (!payload || typeof payload !== "object") return "";
    return payload.token || payload.accessToken || payload.access_token || "";
  }

  function requiredText(value, field) {
    if (typeof value !== "string" || !value.trim()) {
      throw new SalesAPIError(`${field}不能为空`, { code: "INVALID_ARGUMENT" });
    }
    return value.trim();
  }

  function stringValue(value) {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return "";
  }

  function normalizeMethod(value) {
    const method = stringValue(value).toLowerCase();
    const aliases = {
      "电话": "phone",
      "微信": "wechat",
      "邮件": "email",
      "邮箱": "email",
      "线下拜访": "visit",
      "拜访": "visit",
      "线上会议": "meeting",
      "会议": "meeting",
      "其他": "other",
    };
    return aliases[method] || method;
  }

  function normalizeAI(body) {
    const payload = payloadOf(body) || {};
    const source = payload.result && typeof payload.result === "object"
      ? payload.result
      : (payload.extraction && typeof payload.extraction === "object"
        ? payload.extraction
        : (payload.extracted && typeof payload.extracted === "object" ? payload.extracted : payload));
    const rawFound = source.found && typeof source.found === "object" && !Array.isArray(source.found)
      ? source.found
      : {};
    const found = {};

    for (const [key, value] of Object.entries(rawFound)) {
      const normalized = stringValue(value);
      if (normalized) found[key] = normalized;
    }

    return {
      found,
      name: stringValue(source.name ?? source.customerName ?? source.customer),
      method: normalizeMethod(source.method ?? source.contactMethod),
      contact: stringValue(source.contact ?? source.contactName),
      next: stringValue(source.next ?? source.nextAction),
      nextDate: stringValue(source.nextDate ?? source.next_date),
    };
  }

  const SalesAPI = Object.freeze({
    Error: SalesAPIError,

    isConfigured() {
      const protocol = global.location && global.location.protocol;
      return protocol === "http:" || protocol === "https:";
    },

    getToken,
    getRevision,

    health() {
      return request("/api/health").then(payloadOf);
    },

    async register(name, email, password) {
      const body = await request("/api/auth/register", {
        method: "POST",
        body: {
          name: requiredText(name, "姓名"),
          email: requiredText(email, "邮箱"),
          password: requiredText(password, "密码"),
        },
      });
      setToken(tokenOf(body));
      return payloadOf(body);
    },

    async login(email, password) {
      const body = await request("/api/auth/login", {
        method: "POST",
        body: {
          email: requiredText(email, "邮箱"),
          password: requiredText(password, "密码"),
        },
      });
      setToken(tokenOf(body));
      return payloadOf(body);
    },

    async me() {
      const payload = payloadOf(await request("/api/auth/me"));
      return payload && payload.user && typeof payload.user === "object" ? payload.user : payload;
    },

    logout() {
      clearToken();
    },

    async getCustomers() {
      const body = await request("/api/customers");
      const payload = payloadOf(body);
      if (Number.isInteger(payload?.revision)) setRevision(payload.revision);
      if (Array.isArray(payload)) return payload;
      return payload && Array.isArray(payload.customers) ? payload.customers : [];
    },

    async saveCustomers(list) {
      if (!Array.isArray(list)) {
        throw new SalesAPIError("客户数据必须是数组", { code: "INVALID_ARGUMENT" });
      }
      const revision = getRevision();
      const body = await request("/api/customers", {
        method: "PUT",
        headers: revision === null ? {} : { "If-Match": `"${revision}"` },
        body: { customers: list, ...(revision === null ? {} : { revision }) },
      });
      const payload = payloadOf(body);
      if (Number.isInteger(payload?.revision)) setRevision(payload.revision);
      return payload;
    },

    async extractAI(text, customerNames) {
      const names = customerNames === undefined
        ? undefined
        : Array.isArray(customerNames)
          ? customerNames.map(stringValue).filter(Boolean)
          : (() => { throw new SalesAPIError("客户名称必须是数组", { code: "INVALID_ARGUMENT" }); })();
      const body = { text: requiredText(text, "待提取文本") };
      if (names !== undefined) body.customerNames = names;
      return normalizeAI(await request("/api/ai/extract", { method: "POST", body }));
    },

    async polishReview(summary) {
      const payload = payloadOf(await request("/api/ai/polish-review", {
        method: "POST",
        body: { summary: requiredText(summary, "周期总结") },
      }));
      const polished = stringValue(payload?.summary || payload?.polishedSummary);
      if (!polished) throw new SalesAPIError("AI 未返回润色后的总结", { code: "INVALID_RESPONSE" });
      return polished;
    },
  });

  global.SalesAPI = SalesAPI;
})(typeof globalThis !== "undefined" ? globalThis : this);
