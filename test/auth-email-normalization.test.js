const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = process.env.JWT_SECRET || "email-normalization-test-secret";
process.env.AUTH_LOGIN_RATE_LIMIT_MAX = "100";

const app = require("../app");
const User = require("../models/User");
const {
  normalizeEmailInput,
  normalizeRegistrationEmail,
  gmailDotEquivalentRegex,
} = require("../utils/emailIdentity");

const TARGET_ID = "664000000000000000000001";
const patchMethod = (target, method, replacement) => {
  const original = target[method]; target[method] = replacement;
  return () => { target[method] = original; };
};
const queryFor = (value) => {
  const query = {
    select: () => query,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};
const listen = () => new Promise((resolve) => {
  const server = app.listen(0, "127.0.0.1", () => resolve(server));
});
const close = (server) => new Promise((resolve) => server.close(resolve));
const login = (server, email, password) => fetch(
  `http://127.0.0.1:${server.address().port}/auth/login`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  }
);
const account = async ({ email, role = "Admin", isActive = true, password = "existing-password" } = {}) => ({
  _id: TARGET_ID,
  name: "Email User",
  email,
  role,
  isActive,
  password: await bcrypt.hash(password, 10),
});

test("login succeeds for a dotted Gmail address stored exactly with dots", { concurrency: false }, async () => {
  const stored = await account({ email: "sk.dwomoh88@gmail.com" });
  const filters = [];
  const restore = patchMethod(User, "findOne", (filter) => {
    filters.push(filter); return queryFor(filter.email === stored.email ? stored : null);
  });
  const server = await listen();
  try {
    const response = await login(server, "  SK.Dwomoh88@gmail.com ", "existing-password");
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(filters.length, 1);
    assert.equal(filters[0].email, stored.email);
    assert.equal(body.data.user.id, TARGET_ID);
    assert.equal(body.data.user.email, stored.email);
    assert.equal(body.data.user.role, "Admin");
    assert.ok(body.data.token);
    assert.equal(body.data.password, undefined);
    assert.equal(body.data.user.password, undefined);
  } finally { await close(server); restore(); }
});

test("login selects authVersion and issues the current session version", { concurrency: false }, async () => {
  const stored = await account({ email: "versioned@example.com" });
  stored.authVersion = 4;
  const selections = [];
  const restore = patchMethod(User, "findOne", () => {
    const query = queryFor(stored);
    query.select = (value) => { selections.push(value); return query; };
    return query;
  });
  const server = await listen();
  try {
    const response = await login(server, stored.email, "existing-password");
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.match(selections[0], /\+authVersion/);
    const decoded = require("jsonwebtoken").verify(body.data.token, process.env.JWT_SECRET);
    assert.equal(decoded.version, 4);
  } finally { await close(server); restore(); }
});

test("login falls back deterministically to a previously dot-normalized Gmail", { concurrency: false }, async () => {
  const stored = await account({ email: "skdwomoh88@gmail.com" });
  const filters = [];
  const restore = patchMethod(User, "findOne", (filter) => {
    filters.push(filter); return queryFor(filter.email === stored.email ? stored : null);
  });
  const server = await listen();
  try {
    const response = await login(server, "sk.dwomoh88@gmail.com", "existing-password");
    assert.equal(response.status, 200);
    assert.deepEqual(filters.map(({ email }) => email), ["sk.dwomoh88@gmail.com", "skdwomoh88@gmail.com"]);
  } finally { await close(server); restore(); }
});

test("invalid email, wrong password, and inactive account retain safe failures", { concurrency: false }, async () => {
  const stored = await account({ email: "person@example.com" });
  const restore = patchMethod(User, "findOne", () => queryFor(stored));
  const server = await listen();
  try {
    const invalid = await login(server, "not-an-email", "existing-password");
    assert.equal(invalid.status, 400);
    const wrong = await login(server, stored.email, "wrong-password");
    const wrongBody = await wrong.json();
    assert.equal(wrong.status, 401);
    assert.equal(wrongBody.error.code, "INVALID_CREDENTIALS");
    stored.isActive = false;
    const inactive = await login(server, stored.email, "existing-password");
    const inactiveBody = await inactive.json();
    assert.equal(inactive.status, 401);
    assert.equal(inactiveBody.error.code, "INVALID_CREDENTIALS");
    assert.doesNotMatch(JSON.stringify(inactiveBody), /password.*\$2[aby]\$/i);
  } finally { await close(server); restore(); }
});

test("registration rejects a Gmail dot-equivalent existing account", { concurrency: false }, async () => {
  const existing = await account({ email: "sk.dwomoh88@gmail.com" });
  let creates = 0;
  const restoreFind = patchMethod(User, "findOne", (filter) => {
    if (typeof filter.email === "string") return queryFor(null);
    return queryFor(filter.email instanceof RegExp && filter.email.test(existing.email) ? existing : null);
  });
  const restoreCreate = patchMethod(User, "create", async () => { creates += 1; return existing; });
  const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/register`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Duplicate", email: "skdwomoh88@gmail.com", password: "password123" }),
    });
    assert.equal(response.status, 409);
    assert.equal(creates, 0);
    assert.equal(gmailDotEquivalentRegex("skdwomoh88@gmail.com").test(existing.email), true);
    assert.equal(normalizeRegistrationEmail("sk.dwomoh88@gmail.com"), "skdwomoh88@gmail.com");
    assert.equal(normalizeRegistrationEmail("skdwomoh88@gmail.com"), "skdwomoh88@gmail.com");
  } finally { await close(server); restoreCreate(); restoreFind(); }
});

test("non-Gmail addresses are only trimmed/lowercased and use exact lookup", { concurrency: false }, async () => {
  assert.equal(normalizeEmailInput(" First.Last+Tag@Example.COM "), "first.last+tag@example.com");
  assert.equal(gmailDotEquivalentRegex("first.last@example.com"), null);
  const stored = await account({ email: "first.last+tag@example.com" });
  const filters = [];
  const restore = patchMethod(User, "findOne", (filter) => { filters.push(filter); return queryFor(stored); });
  const server = await listen();
  try {
    const response = await login(server, "First.Last+Tag@Example.COM", "existing-password");
    assert.equal(response.status, 200);
    assert.deepEqual(filters, [{ email: stored.email }]);
  } finally { await close(server); restore(); }
});

test("legacy Admin, Agent, Owner, and Customer roles are returned unchanged", { concurrency: false }, async () => {
  const stored = await account({ email: "role@example.com" });
  const restore = patchMethod(User, "findOne", () => queryFor(stored));
  const server = await listen();
  try {
    for (const role of ["Admin", "Agent", "Owner", "Customer"]) {
      stored.role = role;
      const response = await login(server, stored.email, "existing-password");
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.data.user.role, role);
    }
  } finally { await close(server); restore(); }
});
