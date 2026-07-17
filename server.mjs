import { createServer } from "node:http";
import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { access, mkdir, open, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PROJECT_ROOT = fileURLToPath(new URL(".", import.meta.url));
const JSON_BODY_LIMIT = 1024 * 1024;
const CUSTOMERS_BODY_LIMIT = 10 * 1024 * 1024;
const TOKEN_TTL_SECONDS = 12 * 60 * 60;
const AI_TEXT_LIMIT = 20_000;
const FIELD_KEYS = [
  "industry", "founded", "staff", "funding", "product",
  "dau", "revenue", "cloudStatus", "billNote", "relation",
];
const POINT_KEYS = ["nextSteps", "decisions", "concerns", "relation"];
const EXTRACTION_TEXT_KEYS = ["name", "method", "contact", "next", "nextDate"];
const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function error(status, code, message) {
  throw new HttpError(status, code, message);
}

function sendJson(response, status, body, headers = {}) {
  const data = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": data.length,
    "cache-control": "no-store",
    ...headers,
  });
  response.end(data);
}

function sendError(response, err) {
  const status = err instanceof HttpError ? err.status : 500;
  const code = err instanceof HttpError ? err.code : "INTERNAL_ERROR";
  const message = err instanceof HttpError ? err.message : "服务器内部错误";
  sendJson(response, status, { error: { code, message } });
}

async function readJsonBody(request, limit = JSON_BODY_LIMIT) {
  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    error(415, "UNSUPPORTED_MEDIA_TYPE", "请求体必须使用 application/json");
  }
  const declaredLength = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    error(413, "BODY_TOO_LARGE", `JSON 请求体不能超过 ${limit} 字节`);
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) error(413, "BODY_TOO_LARGE", `JSON 请求体不能超过 ${limit} 字节`);
    chunks.push(chunk);
  }
  if (size === 0) error(400, "INVALID_JSON", "请求体不能为空");

  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (value === null || typeof value !== "object") error(400, "INVALID_JSON", "JSON 请求体必须是对象或数组");
    return value;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    error(400, "INVALID_JSON", "JSON 请求体格式无效");
  }
}

function normalizeIdentity(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateCredentials(body, { registering = false } = {}) {
  if (!body || Array.isArray(body)) error(400, "INVALID_INPUT", "请求体必须是 JSON 对象");
  const identity = normalizeIdentity(body.email ?? body.username);
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity) && !/^[a-z0-9_.-]{3,64}$/.test(identity)) {
    error(400, "INVALID_IDENTITY", "请输入有效的邮箱或 3-64 位用户名");
  }
  if (password.length < 8 || password.length > 128) {
    error(400, "INVALID_PASSWORD", "密码长度必须为 8-128 个字符");
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (registering && (name.length < 1 || name.length > 80)) error(400, "INVALID_NAME", "名称长度必须为 1-80 个字符");
  return { identity, password, name };
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return { salt: salt.toString("base64"), passwordHash: derived.toString("base64") };
}

async function verifyPassword(password, user) {
  try {
    const expected = Buffer.from(user.passwordHash, "base64");
    const actual = await scrypt(password, Buffer.from(user.salt, "base64"), expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signToken(userId, secret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({ sub: userId, iat: now, exp: now + ttlSeconds });
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, providedSignature] = parts;
  const expectedSignature = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  let actualSignature;
  try {
    actualSignature = Buffer.from(providedSignature, "base64url");
  } catch {
    return null;
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) return null;
  try {
    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    const parsedPayload = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") return null;
    if (typeof parsedPayload.sub !== "string" || !Number.isInteger(parsedPayload.exp) || parsedPayload.exp <= now) return null;
    return parsedPayload;
  } catch {
    return null;
  }
}

function publicUser(user) {
  const email = String(user.identity || "").includes("@") ? user.identity : "";
  return { id: user.id, identity: user.identity, email, name: user.name || "" };
}

function createStorage(dataDir) {
  const usersFile = join(dataDir, "users.json");
  const customersDir = join(dataDir, "customers");
  let queue = Promise.resolve();

  const serialized = task => {
    const result = queue.then(task, task);
    queue = result.catch(() => {});
    return result;
  };

  async function readJson(path, fallback) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch (err) {
      if (err?.code === "ENOENT") return structuredClone(fallback);
      throw err;
    }
  }

  async function writeJson(path, value) {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    await mkdir(customersDir, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, path);
  }

  return {
    async findUserByIdentity(identity) {
      const store = await readJson(usersFile, { version: 1, users: [] });
      return store.users.find(user => user.identity === identity) || null;
    },
    async findUserById(id) {
      const store = await readJson(usersFile, { version: 1, users: [] });
      return store.users.find(user => user.id === id) || null;
    },
    registerUser(credentials) {
      return serialized(async () => {
        const store = await readJson(usersFile, { version: 1, users: [] });
        if (store.users.some(user => user.identity === credentials.identity)) {
          error(409, "IDENTITY_EXISTS", "该邮箱或用户名已注册");
        }
        const password = await hashPassword(credentials.password);
        const user = {
          id: randomUUID(),
          identity: credentials.identity,
          name: credentials.name,
          ...password,
          createdAt: new Date().toISOString(),
        };
        store.users.push(user);
        await writeJson(usersFile, store);
        return user;
      });
    },
    async getCustomers(userId) {
      const stored = await readJson(join(customersDir, `${userId}.json`), { revision: 0, customers: [] });
      if (Array.isArray(stored)) return { revision: 0, customers: stored };
      return {
        revision: Number.isInteger(stored?.revision) && stored.revision >= 0 ? stored.revision : 0,
        customers: Array.isArray(stored?.customers) ? stored.customers : [],
      };
    },
    setCustomers(userId, customers, expectedRevision = null) {
      return serialized(async () => {
        const path = join(customersDir, `${userId}.json`);
        const currentRaw = await readJson(path, { revision: 0, customers: [] });
        const current = Array.isArray(currentRaw)
          ? { revision: 0, customers: currentRaw }
          : { revision: Number.isInteger(currentRaw?.revision) ? currentRaw.revision : 0, customers: Array.isArray(currentRaw?.customers) ? currentRaw.customers : [] };
        if (expectedRevision !== null && expectedRevision !== current.revision) {
          error(409, "CUSTOMERS_CONFLICT", "客户数据已在其他页面或设备更新，请合并后重试");
        }
        const next = { revision: current.revision + 1, customers };
        await writeJson(path, next);
        return next.revision;
      });
    },
  };
}

function createRateLimiter(windowMs, maxAttempts) {
  const buckets = new Map();
  return key => {
    const now = Date.now();
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    bucket.count += 1;
    buckets.set(key, bucket);
    if (buckets.size > 5000) {
      for (const [storedKey, value] of buckets) if (value.resetAt <= now) buckets.delete(storedKey);
    }
    if (bucket.count > maxAttempts) error(429, "RATE_LIMITED", "尝试次数过多，请稍后再试");
  };
}

function requireAuth(request, secret) {
  const authorization = String(request.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) error(401, "AUTH_REQUIRED", "请先登录");
  const payload = verifyToken(match[1], secret);
  if (!payload) error(401, "INVALID_TOKEN", "登录凭证无效或已过期");
  return payload.sub;
}

function validateCustomers(value) {
  const customers = Array.isArray(value) ? value : value?.customers;
  if (!Array.isArray(customers)) error(400, "INVALID_CUSTOMERS", "customers 必须是数组");
  if (customers.length > 10_000) error(400, "INVALID_CUSTOMERS", "客户数量不能超过 10000 条");
  for (const customer of customers) {
    if (!customer || typeof customer !== "object" || Array.isArray(customer)) {
      error(400, "INVALID_CUSTOMERS", "每条客户数据都必须是 JSON 对象");
    }
  }
  return customers;
}

function validateExtraction(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!value.found || typeof value.found !== "object" || Array.isArray(value.found)) return null;
  if (!value.points || typeof value.points !== "object" || Array.isArray(value.points)) return null;

  const textValues = {};
  for (const key of EXTRACTION_TEXT_KEYS) {
    if (typeof value[key] !== "string") return null;
    textValues[key] = value[key].slice(0, key === "name" ? 200 : 2000);
  }
  if (textValues.nextDate && !/^\d{4}-\d{2}-\d{2}$/.test(textValues.nextDate)) return null;
  if (textValues.method && !["phone", "wechat", "email", "visit", "meeting", "other"].includes(textValues.method)) return null;

  const found = {};
  for (const key of FIELD_KEYS) {
    if (typeof value.found[key] !== "string") return null;
    found[key] = value.found[key].slice(0, 2000);
  }
  const points = {};
  for (const key of POINT_KEYS) {
    if (!Array.isArray(value.points[key]) || value.points[key].some(item => typeof item !== "string")) return null;
    points[key] = value.points[key].slice(0, 50).map(item => item.slice(0, 2000));
  }
  return { ...textValues, found, points };
}

function extractionSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [...EXTRACTION_TEXT_KEYS, "found", "points"],
    properties: {
      name: { type: "string", description: "原文明确出现或与候选列表精确匹配的公司名称；未出现时为空字符串" },
      method: { type: "string", enum: ["", "phone", "wechat", "email", "visit", "meeting", "other"], description: "原文明确出现的沟通方式" },
      contact: { type: "string", description: "原文明确出现的联系人；未出现时为空字符串" },
      next: { type: "string", description: "原文明确提出的下一步行动；未出现时为空字符串" },
      nextDate: { type: "string", pattern: "^$|^\\d{4}-\\d{2}-\\d{2}$", description: "下一步日期 YYYY-MM-DD；不能从原文确定时为空字符串" },
      found: {
        type: "object",
        additionalProperties: false,
        required: FIELD_KEYS,
        properties: Object.fromEntries(FIELD_KEYS.map(key => [key, { type: "string" }])),
      },
      points: {
        type: "object",
        additionalProperties: false,
        required: POINT_KEYS,
        properties: Object.fromEntries(POINT_KEYS.map(key => [key, { type: "array", items: { type: "string" } }])),
      },
    },
  };
}

function aiEndpoint(apiUrl) {
  return apiUrl.replace(/\/+$/, "").endsWith("/chat/completions")
    ? apiUrl.replace(/\/+$/, "")
    : `${apiUrl.replace(/\/+$/, "")}/chat/completions`;
}

async function extractWithAi(text, customerNames, config) {
  if (!config.apiUrl || !config.apiKey || !config.model) {
    error(503, "AI_NOT_CONFIGURED", "AI 服务尚未配置，请设置 AI_API_URL、AI_API_KEY 和 AI_MODEL");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const messages = [
    {
      role: "system",
      content: "你是销售资料抽取助手。只能提取用户原文明确陈述的信息，禁止猜测或补全；没有的信息返回空字符串或空数组。必须只返回 JSON，字段为 name、method、contact、next、nextDate、found、points；found 必须包含 industry、founded、staff、funding、product、dau、revenue、cloudStatus、billNote、relation；points 必须包含 nextSteps、decisions、concerns、relation。",
    },
    {
      role: "user",
      content: customerNames.length
        ? `已有客户候选（仅在原文可明确匹配时使用）：${customerNames.join("、")}\n\n待抽取原文：\n${text}`
        : text,
    },
  ];
  const callUpstream = responseFormat => fetch(aiEndpoint(config.apiUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages,
      response_format: responseFormat,
    }),
    signal: controller.signal,
  });
  let response;
  try {
    response = await callUpstream({
      type: "json_schema",
      json_schema: { name: "sales_extraction", strict: true, schema: extractionSchema() },
    });
    if (!response.ok && [400, 404, 422].includes(response.status)) {
      response = await callUpstream({ type: "json_object" });
    }
  } catch (err) {
    if (err?.name === "AbortError") error(504, "AI_TIMEOUT", "AI 服务响应超时");
    error(502, "AI_UNAVAILABLE", "暂时无法连接 AI 服务");
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) error(502, "AI_UPSTREAM_ERROR", `AI 服务返回错误（HTTP ${response.status}）`);
  let upstream;
  try {
    upstream = await response.json();
  } catch {
    error(502, "AI_INVALID_RESPONSE", "AI 服务返回了无效响应");
  }
  const message = upstream?.choices?.[0]?.message;
  const content = message?.content;
  const textContent = Array.isArray(content)
    ? content.map(part => typeof part === "string" ? part : part?.text || "").join("")
    : content;
  let parsed = message?.parsed;
  if (!parsed) {
    if (typeof textContent !== "string") error(502, "AI_INVALID_RESPONSE", "AI 服务未返回结构化结果");
    const normalized = textContent.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      parsed = JSON.parse(normalized);
    } catch {
      error(502, "AI_INVALID_RESPONSE", "AI 服务返回的结果不是有效 JSON");
    }
  }
  const extraction = validateExtraction(parsed);
  if (!extraction) error(502, "AI_INVALID_RESPONSE", "AI 服务返回的 JSON 不符合预期结构");
  return extraction;
}

async function serveStatic(request, response, rootDir, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    error(405, "METHOD_NOT_ALLOWED", "不支持该请求方法");
  }
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    error(400, "INVALID_PATH", "请求路径无效");
  }
  if (decoded.includes("\0") || decoded.split("/").some(part => part.startsWith("."))) {
    error(404, "NOT_FOUND", "资源不存在");
  }
  const relativePath = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const candidate = resolve(rootDir, relativePath);
  const escaped = relative(rootDir, candidate);
  if (escaped.startsWith(`..${sep}`) || escaped === ".." || isAbsolute(escaped)) {
    error(404, "NOT_FOUND", "资源不存在");
  }
  if (!MIME_TYPES.has(extname(candidate).toLowerCase())) error(404, "NOT_FOUND", "资源不存在");

  let actualRoot;
  let actualFile;
  try {
    [actualRoot, actualFile] = await Promise.all([realpath(rootDir), realpath(candidate)]);
    await access(actualFile, fsConstants.R_OK);
  } catch {
    error(404, "NOT_FOUND", "资源不存在");
  }
  const actualRelative = relative(actualRoot, actualFile);
  if (actualRelative.startsWith(`..${sep}`) || actualRelative === ".." || isAbsolute(actualRelative)) {
    error(404, "NOT_FOUND", "资源不存在");
  }

  const handle = await open(actualFile, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) error(404, "NOT_FOUND", "资源不存在");
    response.writeHead(200, {
      "content-type": MIME_TYPES.get(extname(actualFile).toLowerCase()),
      "content-length": stat.size,
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'self'; script-src 'self' https://web.sdk.qcloud.com https://cdn.sheetjs.com https://unpkg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' https:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
    });
    if (request.method === "HEAD") {
      await handle.close();
      response.end();
    } else {
      const stream = handle.createReadStream();
      stream.on("error", () => response.destroy());
      stream.pipe(response);
    }
  } catch (err) {
    try { await handle.close(); } catch (closeError) {}
    throw err;
  }
}

export function createApp(options = {}) {
  const rootDir = resolve(options.rootDir || PROJECT_ROOT);
  const dataDir = resolve(options.dataDir || process.env.DATA_DIR || join(rootDir, ".data"));
  const tokenSecret = options.tokenSecret || process.env.AUTH_SECRET || randomBytes(32).toString("hex");
  if (Buffer.byteLength(tokenSecret, "utf8") < 32) throw new Error("AUTH_SECRET 至少需要 32 字节");
  const tokenTtlSeconds = options.tokenTtlSeconds || TOKEN_TTL_SECONDS;
  const storage = createStorage(dataDir);
  const checkAuthRate = createRateLimiter(15 * 60 * 1000, 20);
  const checkAiMinuteRate = createRateLimiter(60 * 1000, 30);
  const checkAiDailyRate = createRateLimiter(24 * 60 * 60 * 1000, 1000);
  const ai = {
    apiUrl: options.aiApiUrl ?? process.env.AI_API_URL ?? "",
    apiKey: options.aiApiKey ?? process.env.AI_API_KEY ?? "",
    model: options.aiModel ?? process.env.AI_MODEL ?? "",
    timeoutMs: options.aiTimeoutMs || 30_000,
  };

  return createServer(async (request, response) => {
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("referrer-policy", "no-referrer");
    try {
      const url = new URL(request.url || "/", "http://localhost");
      const { pathname } = url;

      if (pathname === "/api/health" && request.method === "GET") {
        sendJson(response, 200, { ok: true, service: "ai-sales-api" });
        return;
      }

      if (pathname === "/api/auth/register" && request.method === "POST") {
        checkAuthRate(`${request.socket.remoteAddress || "unknown"}:auth`);
        const body = await readJsonBody(request);
        const credentials = validateCredentials(body, { registering: true });
        const user = await storage.registerUser(credentials);
        const token = signToken(user.id, tokenSecret, tokenTtlSeconds);
        sendJson(response, 201, { token, user: publicUser(user), expiresIn: tokenTtlSeconds });
        return;
      }

      if (pathname === "/api/auth/login" && request.method === "POST") {
        checkAuthRate(`${request.socket.remoteAddress || "unknown"}:auth`);
        const body = await readJsonBody(request);
        const credentials = validateCredentials(body);
        const user = await storage.findUserByIdentity(credentials.identity);
        if (!user || !(await verifyPassword(credentials.password, user))) {
          error(401, "INVALID_CREDENTIALS", "邮箱、用户名或密码错误");
        }
        const token = signToken(user.id, tokenSecret, tokenTtlSeconds);
        sendJson(response, 200, { token, user: publicUser(user), expiresIn: tokenTtlSeconds });
        return;
      }

      if (pathname === "/api/auth/me" && request.method === "GET") {
        const userId = requireAuth(request, tokenSecret);
        const user = await storage.findUserById(userId);
        if (!user) error(401, "INVALID_TOKEN", "登录用户不存在");
        sendJson(response, 200, { user: publicUser(user) });
        return;
      }

      if (pathname === "/api/customers" && request.method === "GET") {
        const userId = requireAuth(request, tokenSecret);
        const store = await storage.getCustomers(userId);
        sendJson(response, 200, store, { etag: `"${store.revision}"` });
        return;
      }

      if (pathname === "/api/customers" && request.method === "PUT") {
        const userId = requireAuth(request, tokenSecret);
        const body = await readJsonBody(request, CUSTOMERS_BODY_LIMIT);
        const customers = validateCustomers(body);
        const headerRevision = String(request.headers["if-match"] || "").replace(/^W\//, "").replace(/^"|"$/g, "");
        const candidateRevision = body?.revision ?? (headerRevision === "" ? null : Number(headerRevision));
        const expectedRevision = candidateRevision === null ? null : Number(candidateRevision);
        if (expectedRevision !== null && (!Number.isInteger(expectedRevision) || expectedRevision < 0)) {
          error(400, "INVALID_REVISION", "revision 必须是非负整数");
        }
        const revision = await storage.setCustomers(userId, customers, expectedRevision);
        sendJson(response, 200, { customers, revision }, { etag: `"${revision}"` });
        return;
      }

      if (pathname === "/api/ai/extract" && request.method === "POST") {
        const userId = requireAuth(request, tokenSecret);
        const actor = `${userId}:${request.socket.remoteAddress || "unknown"}`;
        checkAiMinuteRate(`${actor}:minute`);
        checkAiDailyRate(`${actor}:day`);
        const body = await readJsonBody(request);
        const text = typeof body.text === "string" ? body.text.trim() : typeof body.rawText === "string" ? body.rawText.trim() : "";
        if (!text) error(400, "INVALID_TEXT", "text 不能为空");
        if (text.length > AI_TEXT_LIMIT) error(400, "INVALID_TEXT", `text 不能超过 ${AI_TEXT_LIMIT} 个字符`);
        const customerNames = body.customerNames === undefined ? [] : body.customerNames;
        if (!Array.isArray(customerNames) || customerNames.length > 500 || customerNames.some(name => typeof name !== "string" || !name.trim() || name.length > 200)) {
          error(400, "INVALID_CUSTOMER_NAMES", "customerNames 必须是最多 500 项的非空字符串数组");
        }
        const extraction = await extractWithAi(text, customerNames.map(name => name.trim()), ai);
        sendJson(response, 200, { extraction });
        return;
      }

      if (pathname.startsWith("/api/")) {
        error(404, "NOT_FOUND", "API 接口不存在");
      }
      await serveStatic(request, response, rootDir, pathname);
    } catch (err) {
      if (!response.headersSent) sendError(response, err);
      else response.destroy();
    }
  });
}

async function start() {
  try {
    process.loadEnvFile?.(join(PROJECT_ROOT, ".env"));
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必须是 1-65535 之间的整数");
  const host = process.env.HOST || "127.0.0.1";
  const app = createApp();
  app.listen(port, host, () => console.log(`AI Sales server listening on http://${host}:${port}`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  start().catch(err => {
    console.error(err);
    process.exitCode = 1;
  });
}
