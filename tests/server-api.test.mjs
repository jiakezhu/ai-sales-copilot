import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";

async function startTestServer(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "ai-sales-server-"));
  const server = createApp({
    dataDir,
    tokenSecret: "test-secret-that-is-long-enough-for-hmac",
    aiApiUrl: "",
    aiApiKey: "",
    aiModel: "",
    ...options,
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await rm(dataDir, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${port}`;
}

async function request(baseUrl, path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, json: await response.json() };
}

async function register(baseUrl, identity, password = "correct-password") {
  const result = await request(baseUrl, "/api/auth/register", {
    method: "POST",
    body: { email: identity, password, name: identity.split("@")[0] },
  });
  assert.equal(result.response.status, 201);
  return result.json;
}

test("健康检查无需鉴权", async t => {
  const baseUrl = await startTestServer(t);
  const result = await request(baseUrl, "/api/health");
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.json, { ok: true, service: "ai-sales-api" });
});

test("注册、登录和获取当前用户", async t => {
  const baseUrl = await startTestServer(t);
  const registration = await register(baseUrl, "sales@example.com");

  assert.ok(registration.token);
  assert.equal(registration.user.identity, "sales@example.com");
  assert.equal("passwordHash" in registration.user, false);

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: { email: "SALES@example.com", password: "correct-password" },
  });
  assert.equal(login.response.status, 200);
  assert.ok(login.json.token);

  const me = await request(baseUrl, "/api/auth/me", { token: login.json.token });
  assert.equal(me.response.status, 200);
  assert.deepEqual(me.json.user, registration.user);
});

test("错误密码无法登录", async t => {
  const baseUrl = await startTestServer(t);
  await register(baseUrl, "owner@example.com");

  const login = await request(baseUrl, "/api/auth/login", {
    method: "POST",
    body: { email: "owner@example.com", password: "wrong-password" },
  });
  assert.equal(login.response.status, 401);
  assert.equal(login.json.error.code, "INVALID_CREDENTIALS");
});

test("客户数据按登录用户隔离且首次为空数组", async t => {
  const baseUrl = await startTestServer(t);
  const first = await register(baseUrl, "first@example.com");
  const second = await register(baseUrl, "second@example.com");

  const firstEmpty = await request(baseUrl, "/api/customers", { token: first.token });
  const secondEmpty = await request(baseUrl, "/api/customers", { token: second.token });
  assert.deepEqual(firstEmpty.json, { revision: 0, customers: [] });
  assert.deepEqual(secondEmpty.json, { revision: 0, customers: [] });

  const customers = [{ id: "c1", name: "仅属于用户一的客户", notes: [] }];
  const saved = await request(baseUrl, "/api/customers", {
    method: "PUT",
    token: first.token,
    body: { customers },
  });
  assert.equal(saved.response.status, 200);
  assert.deepEqual(saved.json, { customers, revision: 1 });

  const firstRead = await request(baseUrl, "/api/customers", { token: first.token });
  const secondRead = await request(baseUrl, "/api/customers", { token: second.token });
  assert.deepEqual(firstRead.json, { customers, revision: 1 });
  assert.deepEqual(secondRead.json, { customers: [], revision: 0 });
});

test("客户整表更新使用 revision 防止旧快照覆盖新数据", async t => {
  const baseUrl = await startTestServer(t);
  const user = await register(baseUrl, "revision@example.com");
  const first = await request(baseUrl, "/api/customers", {
    method: "PUT", token: user.token, body: { customers: [{ id: "c1", name: "版本一" }], revision: 0 },
  });
  assert.equal(first.response.status, 200);
  assert.equal(first.json.revision, 1);

  const second = await request(baseUrl, "/api/customers", {
    method: "PUT", token: user.token, body: { customers: [{ id: "c1", name: "版本二" }], revision: 1 },
  });
  assert.equal(second.response.status, 200);
  assert.equal(second.json.revision, 2);

  const stale = await request(baseUrl, "/api/customers", {
    method: "PUT", token: user.token, body: { customers: [{ id: "c1", name: "过期快照" }], revision: 1 },
  });
  assert.equal(stale.response.status, 409);
  assert.equal(stale.json.error.code, "CUSTOMERS_CONFLICT");
});

test("AI 未配置时返回明确的 503 错误", async t => {
  const baseUrl = await startTestServer(t);
  const user = await register(baseUrl, "ai@example.com");

  const result = await request(baseUrl, "/api/ai/extract", {
    method: "POST",
    token: user.token,
    body: { text: "客户明确表示关注海外延迟。" },
  });
  assert.equal(result.response.status, 503);
  assert.equal(result.json.error.code, "AI_NOT_CONFIGURED");
  assert.match(result.json.error.message, /AI.*配置/);
});

test("周期总结 AI 未配置时保留明确的 503 契约", async t => {
  const baseUrl = await startTestServer(t);
  const user = await register(baseUrl, "review@example.com");

  const result = await request(baseUrl, "/api/ai/polish-review", {
    method: "POST",
    token: user.token,
    body: { summary: "本周有效跟进 3 次。" },
  });
  assert.equal(result.response.status, 503);
  assert.equal(result.json.error.code, "AI_NOT_CONFIGURED");
});

test("周期总结润色拒绝空内容", async t => {
  const baseUrl = await startTestServer(t);
  const user = await register(baseUrl, "empty-review@example.com");

  const result = await request(baseUrl, "/api/ai/polish-review", {
    method: "POST",
    token: user.token,
    body: { summary: "   " },
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.json.error.code, "INVALID_SUMMARY");
});

test("静态资源 HEAD 请求可重复完成且不返回正文", async t => {
  const baseUrl = await startTestServer(t);
  for (let index = 0; index < 50; index += 1) {
    const response = await fetch(`${baseUrl}/index.html`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
  }
});

test("AI 接口按用户和 IP 限制每分钟调用次数", async t => {
  const baseUrl = await startTestServer(t);
  const user = await register(baseUrl, "quota@example.com");
  let last;
  for (let index = 0; index < 31; index += 1) {
    last = await request(baseUrl, "/api/ai/extract", {
      method: "POST",
      token: user.token,
      body: { text: "客户关注成本。" },
    });
  }
  assert.equal(last.response.status, 429);
  assert.equal(last.json.error.code, "RATE_LIMITED");
});
