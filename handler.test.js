import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/save.js";

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ALLOWED_ORIGIN"];
const GOOD_ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" };

async function call(req, env = GOOD_ENV) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  Object.assign(process.env, env);
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
  try {
    await handler({ method: "POST", headers: { "content-type": "application/json" }, body: {}, ...req }, res);
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
  return res;
}

test("rejects non-POST methods", async () => {
  const r = await call({ method: "GET" });
  assert.equal(r.code, 405);
  assert.equal(r.headers.Allow, "POST");
});

test("fails loudly when the server is not configured", async () => {
  assert.equal((await call({}, {})).code, 500);
});

test("blocks a foreign origin when ALLOWED_ORIGIN is set", async () => {
  const env = { ...GOOD_ENV, ALLOWED_ORIGIN: "https://good.example" };
  assert.equal((await call({ headers: { "content-type": "application/json", origin: "https://evil.example" } }, env)).code, 403);
});

test("rejects non-JSON content types", async () => {
  assert.equal((await call({ headers: { "content-type": "text/plain" } })).code, 415);
});

test("rejects oversized bodies", async () => {
  assert.equal((await call({ headers: { "content-type": "application/json", "content-length": "20000" } })).code, 413);
});

test("returns 400 with a reason for an invalid payload", async () => {
  const r = await call({ body: { sessionId: "nope", step: 1 } });
  assert.equal(r.code, 400);
  assert.equal(r.body.error, "invalid sessionId");
});
