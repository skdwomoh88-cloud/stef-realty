const test = require("node:test");
const assert = require("node:assert/strict");
const emailService = require("../services/emailService");

const withEnvironment = async (values, work) => {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return await work(); } finally { for (const [key, value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; }
};

test("Resend request uses HTTPS API, Bearer key, configured sender, recipient, subject, text and HTML", { concurrency: false }, async () => withEnvironment({ RESEND_API_KEY: "re_test_secret", PASSWORD_RESET_FROM_EMAIL: "Stef Realty <no-reply@stefrealty.example>" }, async () => {
  let call;
  const rawToken = "c".repeat(64);
  const resetUrl = `https://app.stefrealty.example/reset-password?token=${rawToken}`;
  const result = await emailService.sendPasswordResetEmail({ to: "person@example.com", resetUrl, expiresInMinutes: 30, correlationId: "resend-test-123" }, { fetchImpl: async (...args) => { call = args; return { ok: true, status: 200, json: async () => ({ id: "email_123" }) }; } });
  assert.equal(call[0], "https://api.resend.com/emails");
  assert.equal(call[1].method, "POST");
  assert.equal(call[1].headers.Authorization, "Bearer re_test_secret");
  assert.equal(call[1].headers["User-Agent"], "stef-realty-api/1.0");
  assert.equal(call[1].headers["Idempotency-Key"], "password-reset-resend-test-123");
  const payload = JSON.parse(call[1].body);
  assert.equal(payload.from, "Stef Realty <no-reply@stefrealty.example>");
  assert.deepEqual(payload.to, ["person@example.com"]);
  assert.equal(payload.subject, "Reset your Stef Realty password");
  assert.match(payload.text, new RegExp(rawToken)); assert.match(payload.html, new RegExp(rawToken));
  assert.match(payload.text, /expires in 30 minutes/); assert.match(payload.html, /expires in 30 minutes/);
  assert.deepEqual(result, { delivered: true, provider: "resend", messageId: "email_123" });
}));

test("provider 4xx, 5xx, network failures, and missing success IDs are controlled errors", { concurrency: false }, async () => withEnvironment({ RESEND_API_KEY: "re_test_secret", PASSWORD_RESET_FROM_EMAIL: "no-reply@stefrealty.example" }, async () => {
  const details = { to: "person@example.com", resetUrl: "https://app.example/reset-password?token=secret", expiresInMinutes: 30 };
  for (const status of [400, 500]) {
    await assert.rejects(emailService.sendPasswordResetEmail(details, { fetchImpl: async () => ({ ok: false, status, json: async () => ({ message: "provider internals" }) }) }), (error) => error.code === "TRANSACTIONAL_EMAIL_DELIVERY_FAILED" && error.providerStatus === status && !error.message.includes("provider internals"));
  }
  await assert.rejects(emailService.sendPasswordResetEmail(details, { fetchImpl: async () => { throw new Error("network secret"); } }), (error) => error.code === "TRANSACTIONAL_EMAIL_DELIVERY_FAILED" && !error.message.includes("network secret"));
  await assert.rejects(emailService.sendPasswordResetEmail(details, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) }), (error) => error.code === "TRANSACTIONAL_EMAIL_DELIVERY_FAILED");
}));

test("missing API key or sender configuration is rejected before HTTP", { concurrency: false }, async () => {
  let calls = 0; const fetchImpl = async () => { calls += 1; };
  await withEnvironment({ RESEND_API_KEY: "", PASSWORD_RESET_FROM_EMAIL: "no-reply@stefrealty.example" }, async () => assert.rejects(emailService.sendPasswordResetEmail({ to: "person@example.com", resetUrl: "https://app.example/reset", expiresInMinutes: 30 }, { fetchImpl }), (error) => error.code === "TRANSACTIONAL_EMAIL_NOT_CONFIGURED"));
  await withEnvironment({ RESEND_API_KEY: "re_test", PASSWORD_RESET_FROM_EMAIL: "" }, async () => assert.rejects(emailService.sendPasswordResetEmail({ to: "person@example.com", resetUrl: "https://app.example/reset", expiresInMinutes: 30 }, { fetchImpl }), (error) => error.code === "TRANSACTIONAL_EMAIL_NOT_CONFIGURED"));
  await withEnvironment({ RESEND_API_KEY: "re_test", PASSWORD_RESET_FROM_EMAIL: "not-an-email" }, async () => assert.rejects(emailService.sendPasswordResetEmail({ to: "person@example.com", resetUrl: "https://app.example/reset", expiresInMinutes: 30 }, { fetchImpl }), (error) => error.code === "TRANSACTIONAL_EMAIL_NOT_CONFIGURED"));
  assert.equal(calls, 0);
});

test("email service never logs API keys, raw tokens, reset URLs, or provider bodies", { concurrency: false }, async () => withEnvironment({ RESEND_API_KEY: "re_secret_never_log", PASSWORD_RESET_FROM_EMAIL: "no-reply@stefrealty.example" }, async () => {
  const entries = []; const original = console.error; console.error = (...args) => entries.push(args.join(" "));
  const rawToken = "d".repeat(64); const resetUrl = `https://app.example/reset-password?token=${rawToken}`;
  try {
    await assert.rejects(emailService.sendPasswordResetEmail({ to: "person@example.com", resetUrl, expiresInMinutes: 30 }, { fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ message: "provider-secret-body" }) }) }));
  } finally { console.error = original; }
  const logs = entries.join(" ");
  assert.doesNotMatch(logs, /re_secret_never_log|provider-secret-body/); assert.equal(logs.includes(rawToken), false); assert.equal(logs.includes(resetUrl), false);
}));
