const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "password-reset-route-secret";
process.env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX = "2";
process.env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS = "60000";
process.env.NODE_ENV = "test";

const resetService = require("../services/passwordResetService");
const User = require("../models/User");
const app = require("../app");

const patch = (target, method, replacement) => { const original = target[method]; target[method] = replacement; return () => { target[method] = original; }; };
const query = (value) => { const q = { select: () => q, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) }; return q; };
const listen = () => new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
const close = (server) => new Promise((resolve) => server.close(resolve));

test("forgot-password is neutral, normalized, protected-field safe, and rate limited", { concurrency: false }, async () => {
  const emails = [];
  const restore = patch(resetService, "requestPasswordReset", async ({ email }) => { emails.push(email); return { message: resetService.NEUTRAL_MESSAGE }; });
  const server = await listen();
  const request = (body) => fetch(`http://127.0.0.1:${server.address().port}/auth/forgot-password`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  try {
    const known = await request({ email: " Known@Example.COM " });
    const unknown = await request({ email: "unknown@example.com" });
    assert.equal(known.status, 200); assert.equal(unknown.status, 200);
    assert.deepEqual(await known.json(), await unknown.json());
    assert.deepEqual(emails, ["known@example.com", "unknown@example.com"]);
    const limited = await request({ email: "third@example.com" });
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).error.code, "RATE_LIMIT_EXCEEDED");
  } finally { await close(server); restore(); }
});

test("reset-password rejects invalid tokens and role/status/profile injection", { concurrency: false }, async () => {
  let calls = 0;
  const restore = patch(resetService, "resetPassword", async () => { calls += 1; return { message: "Your password has been reset successfully." }; });
  const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/reset-password`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "x", newPassword: "new-password", role: "SUPER_ADMIN", isActive: true, employeeProfile: {} }),
    });
    assert.equal(response.status, 400); assert.equal(calls, 0);
    const body = await response.json();
    assert.equal(body.error.code, "VALIDATION_ERROR");
  } finally { await close(server); restore(); }
});

test("authVersion rejects a JWT issued before password reset", { concurrency: false }, async () => {
  const user = { _id: "66e000000000000000000001", role: "Customer", isActive: true, authVersion: 1 };
  const restore = patch(User, "findById", () => query(user));
  const server = await listen();
  try {
    const oldToken = jwt.sign({ id: user._id, role: user.role, version: 0 }, process.env.JWT_SECRET);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/me`, { headers: { authorization: `Bearer ${oldToken}` } });
    assert.equal(response.status, 401);
  } finally { await close(server); restore(); }
});
