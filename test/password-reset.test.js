const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "password-reset-test-secret";
process.env.NODE_ENV = "test";
process.env.FRONTEND_URL = "http://localhost:5173";

const User = require("../models/User");
const PasswordResetToken = require("../models/PasswordResetToken");
const auditService = require("../services/auditService");
const emailService = require("../services/emailService");
const service = require("../services/passwordResetService");

const IDS = { user: "66e000000000000000000001", reset: "66e000000000000000000002" };
const patch = (target, method, replacement) => { const original = target[method]; target[method] = replacement; return () => { target[method] = original; }; };
const query = (value) => { const q = { select: () => q, session: () => q, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) }; return q; };

test("known reset request stores only a token hash and sends the raw token only in the email URL", { concurrency: false }, async () => {
  const user = { _id: IDS.user, name: "Known", email: "known@example.com", role: "GENERAL_MANAGER", isActive: true, password: "not-returned" };
  let update; let delivery;
  const restores = [
    patch(User, "findOne", (filter) => query(filter.email === user.email ? user : null)),
    patch(PasswordResetToken, "findOneAndUpdate", async (...args) => { update = args; return {}; }),
    patch(emailService, "sendPasswordResetEmail", async (details) => { delivery = details; return { delivered: true }; }),
    patch(emailService, "isPasswordResetEmailConfigured", () => true),
  ];
  try {
    const result = await service.requestPasswordReset({ email: " KNOWN@EXAMPLE.COM ", request: { correlationId: "reset-request-123" } });
    const rawToken = new URL(delivery.resetUrl).searchParams.get("token");
    assert.equal(result.message, service.NEUTRAL_MESSAGE);
    assert.equal(rawToken.length, 64);
    assert.equal(update[1].$set.tokenHash, service.hashResetToken(rawToken));
    assert.notEqual(update[1].$set.tokenHash, rawToken);
    assert.equal(JSON.stringify(update).includes(rawToken), false);
    assert.equal(delivery.to, user.email);
    assert.ok(update[1].$set.expiresAt > new Date());
    assert.ok(update[1].$set.expiresAt <= new Date(Date.now() + 31 * 60 * 1000));
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("unknown email returns the identical neutral response without creating or delivering a token", { concurrency: false }, async () => {
  let writes = 0; let deliveries = 0;
  const restores = [
    patch(User, "findOne", () => query(null)),
    patch(PasswordResetToken, "findOneAndUpdate", async () => { writes += 1; }),
    patch(emailService, "sendPasswordResetEmail", async () => { deliveries += 1; }),
  ];
  try {
    const result = await service.requestPasswordReset({ email: "unknown@example.com", request: {} });
    assert.equal(result.message, service.NEUTRAL_MESSAGE);
    assert.equal(writes, 0); assert.equal(deliveries, 0);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("failed delivery conditionally revokes the generated token and remains publicly neutral", { concurrency: false }, async () => {
  const user = { _id: IDS.user, email: "known@example.com" };
  let storedHash; let deletion;
  const restores = [
    patch(User, "findOne", () => query(user)),
    patch(PasswordResetToken, "findOneAndUpdate", async (filter, update) => { storedHash = update.$set.tokenHash; return {}; }),
    patch(PasswordResetToken, "deleteOne", async (filter) => { deletion = filter; return { deletedCount: 1 }; }),
    patch(emailService, "sendPasswordResetEmail", async () => { const error = new Error("provider detail"); error.code = "TRANSACTIONAL_EMAIL_DELIVERY_FAILED"; throw error; }),
  ];
  try {
    const result = await service.requestPasswordReset({ email: user.email, request: { correlationId: "delivery-failed-123" } });
    assert.equal(result.message, service.NEUTRAL_MESSAGE);
    assert.equal(String(deletion.user), IDS.user);
    assert.equal(deletion.tokenHash, storedHash);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("token-storage and cleanup failures cannot change the neutral public response", { concurrency: false }, async () => {
  const user = { _id: IDS.user, email: "known@example.com" };
  const restoreUser = patch(User, "findOne", () => query(user));
  const restoreStore = patch(PasswordResetToken, "findOneAndUpdate", async () => { throw new Error("storage detail"); });
  try {
    const storageResult = await service.requestPasswordReset({ email: user.email, request: { correlationId: "storage-failed-123" } });
    assert.equal(storageResult.message, service.NEUTRAL_MESSAGE);
  } finally { restoreStore(); }
  const restores = [
    patch(PasswordResetToken, "findOneAndUpdate", async () => ({})),
    patch(emailService, "sendPasswordResetEmail", async () => { throw new Error("delivery detail"); }),
    patch(PasswordResetToken, "deleteOne", async () => { throw new Error("cleanup detail"); }),
  ];
  try {
    const cleanupResult = await service.requestPasswordReset({ email: user.email, request: { correlationId: "cleanup-failed-123" } });
    assert.equal(cleanupResult.message, service.NEUTRAL_MESSAGE);
  } finally { restores.reverse().forEach((restore) => restore()); restoreUser(); }
});

test("FRONTEND_URL accepts secure production and local development origins but rejects unsafe configuration", () => {
  const originalUrl = process.env.FRONTEND_URL; const originalMode = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production"; process.env.FRONTEND_URL = "https://app.stefrealty.example";
    assert.match(service.frontendResetUrl("a".repeat(64)), /^https:\/\/app\.stefrealty\.example\/reset-password\?token=/);
    process.env.FRONTEND_URL = "http://app.stefrealty.example";
    assert.throws(() => service.frontendResetUrl("a".repeat(64)), (error) => error.code === "TRANSACTIONAL_EMAIL_NOT_CONFIGURED");
    process.env.FRONTEND_URL = "not-a-url";
    assert.throws(() => service.frontendResetUrl("a".repeat(64)), (error) => error.code === "TRANSACTIONAL_EMAIL_NOT_CONFIGURED");
  } finally { process.env.FRONTEND_URL = originalUrl; process.env.NODE_ENV = originalMode; }
});

const resetHarness = async ({ record = true } = {}) => {
  const oldHash = await bcrypt.hash("old-password", 10);
  const user = { _id: IDS.user, name: "Reset", email: "reset@example.com", role: "OPERATIONS_MANAGER", isActive: false, password: oldHash, authVersion: 3, $session() {}, async save() {} };
  const resetRecord = record ? { _id: IDS.reset, user: IDS.user } : null;
  const session = { withTransaction: async (work) => work(), endSession: async () => {} };
  let deleted = false; let audit;
  const restores = [
    patch(mongoose, "startSession", async () => session),
    patch(PasswordResetToken, "findOne", () => query(deleted ? null : resetRecord)),
    patch(User, "findById", () => query(user)),
    patch(PasswordResetToken, "deleteOne", () => ({ session: async () => { deleted = true; return { deletedCount: 1 }; } })),
    patch(auditService, "recordAuditEvent", async (event) => { audit = event; return event; }),
  ];
  return { user, oldHash, restores, get deleted() { return deleted; }, get audit() { return audit; } };
};

test("successful reset changes only password/session version, deletes the token, audits safely, and cannot be reused", { concurrency: false }, async () => {
  const h = await resetHarness(); const token = "a".repeat(64);
  try {
    const result = await service.resetPassword({ token, newPassword: "new-password", request: { correlationId: "reset-complete-123", originalUrl: "/auth/reset-password", method: "POST" } });
    assert.equal(result.message, "Your password has been reset successfully.");
    assert.equal(await bcrypt.compare("new-password", h.user.password), true);
    assert.equal(await bcrypt.compare("old-password", h.user.password), false);
    assert.equal(h.user.authVersion, 4);
    assert.equal(h.user.role, "OPERATIONS_MANAGER"); assert.equal(h.user.isActive, false);
    assert.equal(h.deleted, true);
    assert.equal(h.audit.action, "PASSWORD_RESET_COMPLETED"); assert.ok(h.audit.session);
    assert.doesNotMatch(JSON.stringify(h.audit), /new-password|old-password|tokenHash|authorization/i);
    await assert.rejects(service.resetPassword({ token, newPassword: "another-password", request: {} }), (error) => error.code === "PASSWORD_RESET_INVALID");
  } finally { h.restores.reverse().forEach((restore) => restore()); }
});

test("invalid or expired reset token is rejected before User mutation", { concurrency: false }, async () => {
  const h = await resetHarness({ record: false });
  try {
    await assert.rejects(service.resetPassword({ token: "b".repeat(64), newPassword: "new-password", request: {} }), (error) => error.code === "PASSWORD_RESET_INVALID");
    assert.equal(h.user.password, h.oldHash); assert.equal(h.user.authVersion, 3);
  } finally { h.restores.reverse().forEach((restore) => restore()); }
});

test("PasswordResetToken stores hashes privately with unique-user and TTL indexes", () => {
  const tokenPath = PasswordResetToken.schema.path("tokenHash");
  assert.equal(tokenPath.options.select, false);
  const indexes = PasswordResetToken.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.user === 1 && options.unique));
  assert.ok(indexes.some(([fields, options]) => fields.expiresAt === 1 && options.expireAfterSeconds === 0));
});
