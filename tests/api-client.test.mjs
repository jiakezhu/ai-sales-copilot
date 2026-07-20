import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../api-client.js", import.meta.url), "utf8");

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() { return body == null ? "" : JSON.stringify(body); },
  };
}

function loadAPI(responses, options = {}) {
  const values = new Map(Object.entries(options.storage || {}));
  const calls = [];
  const sandbox = {
    AbortController,
    clearTimeout,
    setTimeout,
    location: { protocol: options.protocol || "https:" },
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
    },
    async fetch(url, init) {
      calls.push({ url, init });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  };
  vm.runInNewContext(source, sandbox);
  return { api: sandbox.SalesAPI, values, calls };
}

test("login stores the returned token", async () => {
  const harness = loadAPI([
    jsonResponse(200, { data: { token: "jwt-token", user: { id: "u1" } } }),
  ]);

  const result = await harness.api.login("sales@example.com", "secret");

  assert.equal(harness.values.get("sales_api_token"), "jwt-token");
  assert.equal(harness.api.getToken(), "jwt-token");
  assert.equal(result.user.id, "u1");
  assert.equal(harness.calls[0].url, "/api/auth/login");
  assert.equal(harness.calls[0].init.method, "POST");
  assert.equal(harness.calls[0].init.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(harness.calls[0].init.body), {
    email: "sales@example.com",
    password: "secret",
  });
});

test("401 responses clear the stored token and expose a clear error", async () => {
  const harness = loadAPI(
    [jsonResponse(401, { message: "令牌已失效" })],
    { storage: { sales_api_token: "expired-token", sales_api_customers_revision: "7" } }
  );

  await assert.rejects(
    harness.api.me(),
    error => error.name === "SalesAPIError"
      && error.status === 401
      && error.code === "UNAUTHORIZED"
      && error.message === "令牌已失效"
  );
  assert.equal(harness.values.has("sales_api_token"), false);
  assert.equal(harness.values.has("sales_api_customers_revision"), false);
  assert.equal(harness.calls[0].init.headers.Authorization, "Bearer expired-token");
});

test("saveCustomers sends authenticated JSON customer data", async () => {
  const customers = [{ id: "c1", name: "星澜互娱" }];
  const harness = loadAPI(
    [jsonResponse(200, { data: { saved: true } })],
    { storage: { sales_api_token: "valid-token" } }
  );

  const result = await harness.api.saveCustomers(customers);

  assert.equal(result.saved, true);
  assert.equal(harness.calls[0].url, "/api/customers");
  assert.equal(harness.calls[0].init.method, "PUT");
  assert.equal(harness.calls[0].init.headers.Authorization, "Bearer valid-token");
  assert.deepEqual(JSON.parse(harness.calls[0].init.body), { customers });
});

test("customer revision is retained and sent with optimistic updates", async () => {
  const customers = [{ id: "c1", name: "星澜互娱" }];
  const harness = loadAPI(
    [jsonResponse(200, { customers, revision: 3 }), jsonResponse(200, { customers, revision: 4 })],
    { storage: { sales_api_token: "valid-token" } }
  );

  assert.deepEqual(JSON.parse(JSON.stringify(await harness.api.getCustomers())), customers);
  assert.equal(harness.api.getRevision(), 3);
  await harness.api.saveCustomers(customers);
  assert.equal(harness.calls[1].init.headers["If-Match"], '"3"');
  assert.deepEqual(JSON.parse(harness.calls[1].init.body), { customers, revision: 3 });
  assert.equal(harness.api.getRevision(), 4);
});

test("extractAI normalizes the server result for the existing CRM model", async () => {
  const harness = loadAPI([
    jsonResponse(200, {
      extraction: {
        customerName: " 星澜互娱 ",
        found: { industry: " 游戏 ", staff: 480, ignored: null },
        contactMethod: "电话",
        contactName: " 王工 ",
        nextAction: " 发送方案 ",
        next_date: "2026-07-22",
      },
    }),
  ]);

  const result = await harness.api.extractAI("刚和王工通了电话", ["星澜互娱", ""]);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    found: { industry: "游戏", staff: "480" },
    name: "星澜互娱",
    method: "phone",
    contact: "王工",
    next: "发送方案",
    nextDate: "2026-07-22",
  });
  assert.deepEqual(JSON.parse(harness.calls[0].init.body), {
    text: "刚和王工通了电话",
    customerNames: ["星澜互娱"],
  });
});

test("polishReview sends the rule summary and returns polished text", async () => {
  const harness = loadAPI([
    jsonResponse(200, { summary: "本周完成了三次有效跟进。" }),
  ], { storage: { sales_api_token: "valid-token" } });

  const result = await harness.api.polishReview("本周有效跟进 3 次");

  assert.equal(result, "本周完成了三次有效跟进。");
  assert.equal(harness.calls[0].url, "/api/ai/polish-review");
  assert.equal(harness.calls[0].init.headers.Authorization, "Bearer valid-token");
  assert.deepEqual(JSON.parse(harness.calls[0].init.body), { summary: "本周有效跟进 3 次" });
});

test("isConfigured only enables API calls on HTTP(S) pages", () => {
  assert.equal(loadAPI([], { protocol: "https:" }).api.isConfigured(), true);
  assert.equal(loadAPI([], { protocol: "http:" }).api.isConfigured(), true);
  assert.equal(loadAPI([], { protocol: "file:" }).api.isConfigured(), false);
});
