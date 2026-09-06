const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "phase3-test-secret";
process.env.NODE_ENV = "test";

const app = require("../app");
const User = require("../models/User");
const Department = require("../models/Department");
const EmployeeProfile = require("../models/EmployeeProfile");
const AuditEvent = require("../models/AuditEvent");
const auditService = require("../services/auditService");
const userAdministrationService = require("../services/userAdministrationService");
const organizationService = require("../services/organizationService");
const employeeProfileService = require("../services/employeeProfileBootstrapService");
const migrationService = require("../services/organizationMigrationService");
const { assertRoleAssignmentAllowed } = require("../utils/roleAssignmentPolicy");
const { ROLES } = require("../constants/roleCatalogue");

const IDS = {
  superAdmin: "663000000000000000000001", otherSuperAdmin: "663000000000000000000002",
  target: "663000000000000000000003", auditor: "663000000000000000000004",
  department: "663000000000000000000005", employee: "663000000000000000000006",
  audit: "663000000000000000000007",
};
const patchMethod = (target, method, replacement) => {
  const original = target[method]; target[method] = replacement;
  return () => { target[method] = original; };
};
const queryFor = (value) => {
  const query = {
    select: () => query, populate: () => query, sort: () => query, skip: () => query, session: () => query,
    limit: () => query, lean: () => query,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};
const listen = () => new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
const close = (server) => new Promise((resolve) => server.close(resolve));
const userDocument = (overrides = {}) => {
  const user = {
    _id: IDS.target, id: IDS.target, name: "Target", email: "target@example.com",
    role: ROLES.AGENT, isActive: true, password: "preserved-hash", ...overrides,
  };
  user.save = async () => user;
  return user;
};

test("correlation middleware accepts safe IDs and replaces unsafe values", async () => {
  const server = await listen();
  try {
    const safe = await fetch(`http://127.0.0.1:${server.address().port}/health`, { headers: { "x-correlation-id": "frontend-request-123" } });
    assert.equal(safe.headers.get("x-correlation-id"), "frontend-request-123");
    const unsafe = await fetch(`http://127.0.0.1:${server.address().port}/health`, { headers: { "x-correlation-id": "bad value with spaces" } });
    assert.match(unsafe.headers.get("x-correlation-id"), /^[0-9a-f-]{36}$/);
  } finally { await close(server); }
});

test("audit service redacts sensitive values and authenticated actor cannot be spoofed", { concurrency: false }, async () => {
  let created;
  const restoreProfile = patchMethod(EmployeeProfile, "findOne", () => queryFor({ department: IDS.department }));
  const restoreCreate = patchMethod(AuditEvent, "create", async (data) => { created = data; return data; });
  try {
    await auditService.recordAuditEvent({
      actor: { _id: IDS.superAdmin, role: ROLES.SUPER_ADMIN },
      request: { correlationId: "request-correlation-123", originalUrl: "/users/x/role", method: "PUT" },
      action: "USER_ROLE_CHANGED", entityType: "User", entityId: IDS.target,
      before: { password: "hash", role: ROLES.AGENT },
      after: { role: ROLES.AUDITOR }, metadata: { actor: IDS.target, jwtToken: "secret" },
    });
    assert.equal(String(created.actor), IDS.superAdmin);
    assert.equal(created.actorRole, ROLES.SUPER_ADMIN);
    assert.equal(created.before.password, "[REDACTED]");
    assert.equal(created.metadata.jwtToken, "[REDACTED]");
    assert.equal(created.correlationId, "request-correlation-123");
  } finally { restoreCreate(); restoreProfile(); }
});

test("AuditEvent model exposes append-only indexes and rejects normal mutations", async () => {
  assert.ok(AuditEvent.schema.indexes().some(([fields]) => fields.createdAt === -1));
  await assert.rejects(AuditEvent.updateOne({ _id: IDS.audit }, { action: "TAMPERED" }), /append-only/);
  await assert.rejects(AuditEvent.deleteOne({ _id: IDS.audit }), /append-only/);
});

test("only Super Admin can assign Super Admin and approved canonical roles", () => {
  assert.equal(assertRoleAssignmentAllowed({ role: ROLES.SUPER_ADMIN }, ROLES.SUPER_ADMIN), true);
  assert.equal(assertRoleAssignmentAllowed({ role: ROLES.SUPER_ADMIN }, ROLES.FINANCE_MANAGER), true);
  for (const role of [ROLES.ADMIN, ROLES.GENERAL_MANAGER, ROLES.HR_MANAGER, ROLES.OWNER, ROLES.CUSTOMER]) {
    assert.throws(() => assertRoleAssignmentAllowed({ role }, ROLES.SUPER_ADMIN));
  }
  assert.throws(() => assertRoleAssignmentAllowed({ role: ROLES.SUPER_ADMIN }, "ROOT"), (error) => error.code === "ROLE_NOT_ASSIGNABLE");
});

test("last active Super Admin cannot be demoted or deactivated", { concurrency: false }, async () => {
  const target = userDocument({ _id: IDS.superAdmin, id: IDS.superAdmin, email: "super@example.com", role: ROLES.SUPER_ADMIN });
  const restoreFind = patchMethod(User, "findById", () => queryFor(target));
  const restoreCount = patchMethod(User, "countDocuments", async () => 1);
  const restoreAudit = patchMethod(auditService, "recordAuditEvent", async () => ({}));
  try {
    await assert.rejects(userAdministrationService.updateRole({ targetUserId: IDS.superAdmin, requestedRole: ROLES.AGENT, actor: { _id: IDS.otherSuperAdmin, role: ROLES.SUPER_ADMIN } }), (error) => error.code === "LAST_SUPER_ADMIN_PROTECTED");
    await assert.rejects(userAdministrationService.updateStatus({ targetUserId: IDS.superAdmin, isActive: false, actor: { _id: IDS.otherSuperAdmin, role: ROLES.SUPER_ADMIN } }), (error) => error.code === "LAST_SUPER_ADMIN_PROTECTED");
  } finally { restoreAudit(); restoreCount(); restoreFind(); }
});

test("explicit user status is idempotent and role request injection is rejected", { concurrency: false }, async () => {
  const actor = userDocument({ _id: IDS.superAdmin, id: IDS.superAdmin, role: ROLES.SUPER_ADMIN });
  const target = userDocument({ isActive: true });
  const restoreFind = patchMethod(User, "findById", (id) => queryFor(String(id) === IDS.superAdmin ? actor : target));
  const restoreAudit = patchMethod(auditService, "recordAuditEvent", async () => ({}));
  const token = jwt.sign({ id: IDS.superAdmin }, process.env.JWT_SECRET);
  const server = await listen();
  try {
    const explicit = await fetch(`http://127.0.0.1:${server.address().port}/users/${IDS.target}/status`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ isActive: true }) });
    assert.equal(explicit.status, 200); assert.equal(target.isActive, true);
    const missing = await fetch(`http://127.0.0.1:${server.address().port}/users/${IDS.target}/status`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{}" });
    assert.equal(missing.status, 400);
    const injection = await fetch(`http://127.0.0.1:${server.address().port}/users/${IDS.target}/role`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ role: ROLES.AGENT, isActive: false, permissions: ["SECURITY_ADMIN"] }) });
    assert.equal(injection.status, 400);
  } finally { await close(server); restoreAudit(); restoreFind(); }
});

test("Super Admin can deactivate and reactivate an eligible user with persisted boolean state", { concurrency: false }, async () => {
  const target = userDocument({ isActive: true });
  let saves = 0;
  target.save = async () => { saves += 1; return target; };
  const restoreFind = patchMethod(User, "findById", () => queryFor(target));
  const restoreAudit = patchMethod(auditService, "recordAuditEvent", async () => ({}));
  try {
    const actor = { _id: IDS.superAdmin, role: ROLES.SUPER_ADMIN };
    const inactive = await userAdministrationService.updateStatus({ targetUserId: IDS.target, isActive: false, actor });
    assert.equal(inactive.isActive, false);
    const active = await userAdministrationService.updateStatus({ targetUserId: IDS.target, isActive: true, actor });
    assert.equal(active.isActive, true);
    assert.equal(saves, 2);
  } finally { restoreAudit(); restoreFind(); }
});

test("customer cannot use the protected user status API", { concurrency: false }, async () => {
  const customer = userDocument({ _id: IDS.auditor, id: IDS.auditor, role: ROLES.CUSTOMER });
  const restoreFind = patchMethod(User, "findById", () => queryFor(customer));
  const token = jwt.sign({ id: IDS.auditor }, process.env.JWT_SECRET);
  const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/users/${IDS.target}/status`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ isActive: false }) });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "FORBIDDEN");
  } finally { await close(server); restoreFind(); }
});

test("a Super Admin cannot deactivate their own account", { concurrency: false }, async () => {
  const actor = userDocument({ _id: IDS.superAdmin, id: IDS.superAdmin, role: ROLES.SUPER_ADMIN });
  const restoreFind = patchMethod(User, "findById", () => queryFor(actor));
  const restoreAudit = patchMethod(auditService, "recordAuditEvent", async () => ({}));
  try {
    await assert.rejects(userAdministrationService.updateStatus({ targetUserId: IDS.superAdmin, isActive: false, actor }), (error) => error.code === "SELF_DEACTIVATION_FORBIDDEN");
    assert.equal(actor.isActive, true);
  } finally { restoreAudit(); restoreFind(); }
});

test("role directory is safe and only exposes Super Admin as assignable to Super Admin", () => {
  const superDirectory = userAdministrationService.getRoleDirectory({ role: ROLES.SUPER_ADMIN });
  assert.equal(superDirectory.find(({ role }) => role === ROLES.SUPER_ADMIN).assignable, true);
  assert.equal(superDirectory.find(({ role }) => role === ROLES.ADMIN).transitional, true);
  assert.equal(superDirectory.find(({ role }) => role === ROLES.ADMIN).assignable, false);
  const legacyDirectory = userAdministrationService.getRoleDirectory({ role: ROLES.ADMIN });
  assert.ok(legacyDirectory.every(({ assignable }) => assignable === false));
  assert.ok(superDirectory.every((entry) => !Object.hasOwn(entry, "permissions")));
});

test("bootstrap plan is non-mutating and application preserves identity/status with role-only update", { concurrency: false }, async () => {
  const candidate = userDocument({ _id: IDS.target, role: "Admin", isActive: true });
  let update;
  const restoreCount = patchMethod(User, "countDocuments", async () => 0);
  const restoreFind = patchMethod(User, "find", () => queryFor([candidate]));
  const restoreUpdate = patchMethod(User, "findOneAndUpdate", (filter, change) => { update = { filter, change }; return queryFor({ ...candidate, role: ROLES.SUPER_ADMIN }); });
  const restoreAudit = patchMethod(auditService, "recordAuditEvent", async () => ({}));
  try {
    const plan = await migrationService.planSuperAdminBootstrap();
    assert.equal(plan.dryRun, true); assert.equal(plan.userId, IDS.target);
    const result = await migrationService.applySuperAdminBootstrap(plan, plan.confirmation);
    assert.deepEqual(update.change, { role: ROLES.SUPER_ADMIN });
    assert.equal(String(result._id), IDS.target); assert.equal(result.isActive, true); assert.equal(result.password, "preserved-hash");
    User.countDocuments = async () => 1;
    await assert.rejects(migrationService.applySuperAdminBootstrap(plan, plan.confirmation), (error) => error.code === "SUPER_ADMIN_ALREADY_EXISTS");
  } finally { restoreAudit(); restoreUpdate(); restoreFind(); restoreCount(); }
});

test("organization mutations audit safe changes without altering role or access", { concurrency: false }, async () => {
  const employee = { _id: IDS.employee, user: IDS.target, employeeNumber: "EMP-1", department: IDS.department, jobTitle: "Agent", reportsTo: null, employmentType: "FULL_TIME", startDate: new Date("2026-01-01"), endDate: null, employmentStatus: "ACTIVE", $session() {}, save: async () => employee };
  const audits = [];
  const restoreSession = patchMethod(mongoose, "startSession", async () => ({ withTransaction: async (work) => work(), endSession: async () => {} }));
  const restoreCreate = patchMethod(employeeProfileService, "createEmployeeProfileTransactional", async () => { audits.push({ action: "EMPLOYEE_PROFILE_CREATED" }); return { employee }; });
  const restoreFind = patchMethod(EmployeeProfile, "findById", () => queryFor(employee));
  const restoreUser = patchMethod(User, "findById", () => queryFor({ _id: IDS.superAdmin, role: ROLES.SUPER_ADMIN, isActive: true }));
  const restoreAudit = patchMethod(auditService, "recordAuditEvent", async (event) => { audits.push(event); });
  try {
    await organizationService.createEmployee(employee, { actor: { _id: IDS.superAdmin, role: ROLES.SUPER_ADMIN }, request: { correlationId: "organization-create-123" } });
    await organizationService.updateEmployee(IDS.employee, { reportsTo: IDS.audit, employmentStatus: "TERMINATED" }, { actor: { _id: IDS.superAdmin, role: ROLES.SUPER_ADMIN }, request: { correlationId: "organization-change-123" } });
    assert.deepEqual(audits.map(({ action }) => action), ["EMPLOYEE_PROFILE_CREATED", "REPORTING_LINE_CHANGED"]);
    assert.equal(employee.role, undefined); assert.equal(employee.isActive, undefined);
    assert.equal(audits[1].after.employmentStatus, "TERMINATED");
  } finally { restoreAudit(); restoreUser(); restoreFind(); restoreCreate(); restoreSession(); }
});

test("Department create/update and manager changes produce controlled audit events", { concurrency: false }, async () => {
  const department = { _id: IDS.department, code: "OPERATIONS", name: "Operations", parentDepartment: null, manager: null, active: true, save: async () => department };
  const actions = [];
  const restoreCreate = patchMethod(Department, "create", async (data) => Object.assign(department, data));
  const restoreFind = patchMethod(Department, "findById", () => queryFor(department));
  const restoreAudit = patchMethod(auditService, "recordAuditEventSafely", async (event) => { actions.push(event); });
  try {
    await organizationService.createDepartment({ code: "OPERATIONS", name: "Operations" }, { actor: { _id: IDS.superAdmin, role: ROLES.SUPER_ADMIN } });
    await organizationService.updateDepartment(IDS.department, { manager: IDS.target }, { actor: { _id: IDS.superAdmin, role: ROLES.SUPER_ADMIN } });
    assert.deepEqual(actions.map(({ action }) => action), ["DEPARTMENT_CREATED", "DEPARTMENT_MANAGER_CHANGED"]);
    assert.deepEqual(actions[1].before.manager, null); assert.equal(actions[1].after.manager, IDS.target);
  } finally { restoreAudit(); restoreFind(); restoreCreate(); }
});

test("Auditor can read audit events, external roles cannot, and no mutation route exists", { concurrency: false }, async () => {
  const restoreUser = patchMethod(User, "findById", (id) => queryFor({ _id: id, role: String(id) === IDS.auditor ? ROLES.AUDITOR : ROLES.CUSTOMER, isActive: true }));
  const restoreFind = patchMethod(AuditEvent, "find", () => queryFor([{ _id: IDS.audit, action: "USER_ROLE_CHANGED" }]));
  const restoreCount = patchMethod(AuditEvent, "countDocuments", async () => 1);
  const server = await listen();
  try {
    const auditorToken = jwt.sign({ id: IDS.auditor }, process.env.JWT_SECRET);
    const allowed = await fetch(`http://127.0.0.1:${server.address().port}/audit/events?page=1&limit=20`, { headers: { authorization: `Bearer ${auditorToken}` } });
    assert.equal(allowed.status, 200); assert.equal((await allowed.json()).data.length, 1);
    const customerToken = jwt.sign({ id: IDS.target }, process.env.JWT_SECRET);
    const denied = await fetch(`http://127.0.0.1:${server.address().port}/audit/events`, { headers: { authorization: `Bearer ${customerToken}` } });
    assert.equal(denied.status, 403);
    const mutation = await fetch(`http://127.0.0.1:${server.address().port}/audit/events/${IDS.audit}`, { method: "DELETE", headers: { authorization: `Bearer ${auditorToken}` } });
    assert.equal(mutation.status, 404);
  } finally { await close(server); restoreCount(); restoreFind(); restoreUser(); }
});

test("audit list applies safe filters, pagination, and sort", { concurrency: false }, async () => {
  let filter; let sort;
  const restoreFind = patchMethod(AuditEvent, "find", (value) => { filter = value; const query = queryFor([]); query.sort = (value2) => { sort = value2; return query; }; return query; });
  const restoreCount = patchMethod(AuditEvent, "countDocuments", async () => 0);
  try {
    const result = await auditService.listAuditEvents({ actor: IDS.auditor, action: "USER_ROLE_CHANGED", outcome: "SUCCESS", from: "2026-01-01", to: "2026-12-31", page: 2, limit: 10, sort: "asc" });
    assert.equal(filter.actor, IDS.auditor); assert.equal(filter.outcome, "SUCCESS");
    assert.equal(sort.createdAt, 1); assert.equal(result.pagination.page, 2);
  } finally { restoreCount(); restoreFind(); }
});

test("canonical Agent and Super Admin remain compatible with legacy route gates", async () => {
  const { authorize } = require("../middleware/authMiddleware");
  for (const role of [ROLES.AGENT, ROLES.SUPER_ADMIN]) {
    let passed = false;
    authorize("Agent")({ user: { role } }, { status: () => ({ json: () => {} }) }, () => { passed = true; });
    assert.equal(passed, true);
  }
});
