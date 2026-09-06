const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "rbac-test-secret";

const app = require("../app");
const User = require("../models/User");
const Task = require("../models/Task");
const errorHandler = require("../middleware/errorMiddleware");
const { protect, authorize } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { ROLES, USER_ROLE_VALUES } = require("../constants/roleCatalogue");
const LEGACY_ROLES = require("../constants/roles");
const { PERMISSIONS, ALL_PERMISSIONS } = require("../constants/permissions");
const { normalizeRole, getPermissionsForRole, hasPermission } = require("../utils/rbac");
const { scopeQuery, assertRecordAccess } = require("../utils/scopePolicy");
const { assertRoleAssignmentAllowed } = require("../utils/roleAssignmentPolicy");
const taskService = require("../services/taskService");
const organizationService = require("../services/organizationService");

const IDS = {
  admin: "661000000000000000000001",
  agent: "661000000000000000000002",
  otherAgent: "661000000000000000000003",
  customer: "661000000000000000000004",
  task: "661000000000000000000005",
};
const patchMethod = (target, method, replacement) => {
  const original = target[method]; target[method] = replacement;
  return () => { target[method] = original; };
};
const queryFor = (value) => {
  const query = {
    select: () => query, populate: () => query, sort: () => query,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};
const listen = (target = app) => new Promise((resolve) => {
  const server = target.listen(0, "127.0.0.1", () => resolve(server));
});
const close = (server) => new Promise((resolve) => server.close(resolve));

test("legacy and future roles resolve deterministically", () => {
  assert.equal(normalizeRole("Admin"), ROLES.ADMIN);
  assert.equal(normalizeRole("Agent"), ROLES.AGENT);
  assert.equal(normalizeRole("Owner"), ROLES.OWNER);
  assert.equal(normalizeRole("Customer"), ROLES.CUSTOMER);
  for (const role of Object.values(ROLES)) assert.equal(normalizeRole(role), role);
  assert.equal(normalizeRole("unknown"), null);
  assert.equal(normalizeRole(null), null);
});

test("every role has deterministic unique effective permissions", () => {
  for (const role of Object.values(ROLES)) {
    const first = getPermissionsForRole(role);
    const second = getPermissionsForRole(role);
    assert.deepEqual(first, second);
    assert.equal(new Set(first).size, first.length);
    assert.ok(first.every((permission) => ALL_PERMISSIONS.includes(permission)));
  }
});

test("role mappings enforce security boundaries", () => {
  assert.deepEqual(new Set(getPermissionsForRole(ROLES.SUPER_ADMIN)), new Set(ALL_PERMISSIONS));
  assert.equal(hasPermission(ROLES.GENERAL_MANAGER, PERMISSIONS.SECURITY_ADMIN), false);
  assert.equal(hasPermission(ROLES.GENERAL_MANAGER, PERMISSIONS.USER_ROLE_MANAGE), false);
  assert.equal(hasPermission(ROLES.HR_MANAGER, PERMISSIONS.USER_ROLE_MANAGE), false);
  assert.equal(hasPermission(ROLES.HR_MANAGER, PERMISSIONS.SECURITY_ADMIN), false);
  assert.equal(hasPermission(ROLES.AGENT, PERMISSIONS.PROPERTY_APPROVE), false);
  assert.equal(hasPermission(ROLES.AGENT, PERMISSIONS.SECURITY_ADMIN), false);
  assert.equal(hasPermission(ROLES.AUDITOR, PERMISSIONS.PROPERTY_UPDATE_ANY), false);
  assert.equal(hasPermission(ROLES.AUDITOR, PERMISSIONS.PAYMENT_RECORD), false);
  for (const role of [ROLES.OWNER, ROLES.CUSTOMER]) {
    assert.equal(hasPermission(role, PERMISSIONS.EMPLOYEE_VIEW), false);
    assert.equal(hasPermission(role, PERMISSIONS.USER_ROLE_MANAGE), false);
    assert.equal(hasPermission(role, PERMISSIONS.TASK_MANAGE), false);
  }
});

test("User schema accepts legacy and future roles without per-user permissions", async () => {
  for (const role of USER_ROLE_VALUES) {
    await new User({ name: "Role User", email: `${role.toLowerCase()}@example.com`, password: "hash", role }).validate();
  }
  assert.equal(User.schema.path("permissions"), undefined);
  assert.ok(User.schema.indexes().some(([fields]) => fields.role === 1 && fields.isActive === 1));
});

test("requirePermission allows effective permission and hides policy details on denial", async () => {
  const permissionApp = express();
  permissionApp.use(express.json());
  permissionApp.get("/allowed", (req, res, next) => { req.user = { _id: IDS.agent, role: "Agent" }; next(); }, requirePermission(PERMISSIONS.TASK_VIEW), (req, res) => res.json({ success: true }));
  permissionApp.get("/denied", (req, res, next) => { req.user = { _id: IDS.agent, role: "Agent" }; next(); }, requirePermission(PERMISSIONS.PROPERTY_APPROVE), (req, res) => res.json({ success: true }));
  permissionApp.use(errorHandler);
  const server = await listen(permissionApp);
  try {
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/allowed`)).status, 200);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/denied`);
    const body = await response.json();
    assert.equal(response.status, 403); assert.equal(body.error.code, "FORBIDDEN");
    assert.equal(body.permissions, undefined); assert.doesNotMatch(JSON.stringify(body), /PROPERTY_APPROVE|role mapping/i);
  } finally { await close(server); }
});

test("protected permission calculation uses current database role, not JWT or request permissions", { concurrency: false }, async () => {
  const permissionApp = express(); permissionApp.use(express.json());
  permissionApp.post("/", protect, requirePermission(PERMISSIONS.SECURITY_ADMIN), (req, res) => res.json({ success: true }));
  permissionApp.use(errorHandler);
  const restore = patchMethod(User, "findById", () => queryFor({ _id: IDS.customer, role: "Customer", isActive: true }));
  const token = jwt.sign({ id: IDS.customer, role: "SUPER_ADMIN", permissions: ALL_PERMISSIONS }, process.env.JWT_SECRET);
  const server = await listen(permissionApp);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
      method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ permissions: ALL_PERMISSIONS }),
    });
    assert.equal(response.status, 403);
  } finally { await close(server); restore(); }
});

test("inactive users are denied before permission middleware", { concurrency: false }, async () => {
  const permissionApp = express();
  permissionApp.get("/", protect, requirePermission(PERMISSIONS.TASK_VIEW), (req, res) => res.json({ success: true }));
  permissionApp.use(errorHandler);
  const restore = patchMethod(User, "findById", () => queryFor({ _id: IDS.agent, role: "Agent", isActive: false }));
  const token = jwt.sign({ id: IDS.agent }, process.env.JWT_SECRET);
  const server = await listen(permissionApp);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 401);
  } finally { await close(server); restore(); }
});

test("/auth/me adds current-role permissions and never exposes password", { concurrency: false }, async () => {
  const user = new User({ _id: IDS.agent, name: "Agent", email: "agent-rbac@example.com", password: "hash", role: "Agent", isActive: true });
  const restore = patchMethod(User, "findById", () => queryFor(user));
  const restoreEmployee = patchMethod(organizationService, "getEmployeeProfileForUser", async () => null);
  const token = jwt.sign({ id: IDS.agent, role: "Admin", permissions: ALL_PERMISSIONS }, process.env.JWT_SECRET);
  const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.data.role, "Agent");
    assert.deepEqual(body.data.permissions, getPermissionsForRole("Agent"));
    assert.equal(body.data.password, undefined);
    assert.equal(body.data.permissions.includes(PERMISSIONS.SECURITY_ADMIN), false);
  } finally { await close(server); restoreEmployee(); restore(); }
});

test("public registration ignores attempted staff role and creates legacy Customer", { concurrency: false }, async () => {
  let created;
  const restoreFind = patchMethod(User, "findOne", async () => null);
  const restoreCreate = patchMethod(User, "create", async (data) => { created = { _id: IDS.customer, ...data, role: data.role || "Customer" }; return created; });
  const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/register`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Customer", email: "new-rbac@example.com", password: "password123", role: "SUPER_ADMIN", permissions: ALL_PERMISSIONS }),
    });
    assert.equal(response.status, 201); assert.equal(created.role, "Customer");
    assert.equal(created.permissions, undefined);
  } finally { await close(server); restoreCreate(); restoreFind(); }
});

test("permission possession does not bypass Task ownership", { concurrency: false }, async () => {
  assert.equal(hasPermission("Agent", PERMISSIONS.TASK_VIEW), true);
  assert.deepEqual(scopeQuery("TASK", { _id: IDS.agent, role: "Agent" }), { assignedAgent: IDS.agent });
  assert.throws(() => assertRecordAccess("TASK", "view", { assignedAgent: IDS.otherAgent }, { _id: IDS.agent, role: "Agent" }), (error) => error.code === "FORBIDDEN");
  const restore = patchMethod(Task, "findById", () => queryFor({ _id: IDS.task, assignedAgent: { _id: IDS.otherAgent } }));
  try {
    await assert.rejects(taskService.getTaskById(IDS.task, { _id: IDS.agent, role: "Agent" }), (error) => error.code === "FORBIDDEN");
  } finally { restore(); }
});

test("Super Admin assignment is protected while legacy Admin behavior remains compatible", () => {
  assert.throws(() => assertRoleAssignmentAllowed({ role: "Admin" }, "SUPER_ADMIN"), (error) => error.code === "ROLE_ASSIGNMENT_FORBIDDEN");
  assert.equal(assertRoleAssignmentAllowed({ role: "Admin" }, "Agent"), true);
  assert.throws(() => assertRoleAssignmentAllowed({ role: "Admin" }, "Admin"), (error) => error.code === "ROLE_ASSIGNMENT_FORBIDDEN");
  assert.equal(assertRoleAssignmentAllowed({ role: "SUPER_ADMIN" }, "SUPER_ADMIN"), true);
  let passed = false;
  authorize(LEGACY_ROLES.ADMIN)({ user: { role: "Admin" } }, {}, () => { passed = true; });
  assert.equal(passed, true);
});
