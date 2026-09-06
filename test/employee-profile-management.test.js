const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "employee-management-test";
process.env.NODE_ENV = "test";

const app = require("../app");
const User = require("../models/User");
const EmployeeProfile = require("../models/EmployeeProfile");
const auditService = require("../services/auditService");
const organizationService = require("../services/organizationService");
const { ROLES } = require("../constants/roleCatalogue");

const IDS = { actor: "66d000000000000000000001", employee: "66d000000000000000000002", profile: "66d000000000000000000003", department: "66d000000000000000000004" };
const patch = (target, method, replacement) => { const original = target[method]; target[method] = replacement; return () => { target[method] = original; }; };
const query = (value) => { const q = { select: () => q, session: () => q, populate: () => q, sort: () => q, skip: () => q, limit: () => q, lean: () => q, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) }; return q; };
const listen = () => new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
const close = (server) => new Promise((resolve) => server.close(resolve));

test("EmployeeProfile create and update APIs reject caller-controlled immutable fields", { concurrency: false }, async () => {
  const actor = { _id: IDS.actor, role: ROLES.SUPER_ADMIN, isActive: true };
  const restoreUser = patch(User, "findById", () => query(actor));
  const token = jwt.sign({ id: IDS.actor }, process.env.JWT_SECRET);
  const server = await listen();
  try {
    const create = await fetch(`http://127.0.0.1:${server.address().port}/organization/employees`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ user: IDS.employee, employeeNumber: "EMP-999999", department: IDS.department, jobTitle: "Manager", employmentType: "FULL_TIME", startDate: "2026-08-25", employmentStatus: "ACTIVE" }) });
    assert.equal(create.status, 400);
    const createBody = await create.json();
    assert.deepEqual(createBody.errors, [{ field: "employeeNumber", message: "Employee number is generated automatically and cannot be supplied" }]);
    const update = await fetch(`http://127.0.0.1:${server.address().port}/organization/employees/${IDS.profile}`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ employeeNumber: "EMP-999999", user: IDS.actor }) });
    assert.equal(update.status, 400);
  } finally { await close(server); restoreUser(); }
});

test("EmployeeProfile create API accepts the General Manager form without employeeNumber", { concurrency: false }, async () => {
  const actor = { _id: IDS.actor, role: ROLES.SUPER_ADMIN, isActive: true };
  const restoreUser = patch(User, "findById", () => query(actor));
  let received;
  const restoreCreate = patch(organizationService, "createEmployee", async (data) => {
    received = data;
    return { _id: IDS.profile, ...data, employeeNumber: "EMP-000004" };
  });
  const token = jwt.sign({ id: IDS.actor }, process.env.JWT_SECRET);
  const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/organization/employees`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        user: IDS.employee,
        department: IDS.department,
        jobTitle: "General Manager",
        employmentType: "FULL_TIME",
        employmentStatus: "ACTIVE",
        startDate: "2026-08-25",
        reportsTo: IDS.profile,
        endDate: null,
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.data.employeeNumber, "EMP-000004");
    assert.equal("employeeNumber" in received, false);
    assert.deepEqual(received, {
      user: IDS.employee,
      department: IDS.department,
      jobTitle: "General Manager",
      employmentType: "FULL_TIME",
      employmentStatus: "ACTIVE",
      startDate: "2026-08-25",
      reportsTo: IDS.profile,
      endDate: null,
    });
  } finally { await close(server); restoreCreate(); restoreUser(); }
});

test("active Super Admin updates only supported EmployeeProfile fields with one transactional audit", { concurrency: false }, async () => {
  const actor = { _id: IDS.actor, name: "Super", email: "super@example.test", role: ROLES.SUPER_ADMIN, isActive: true };
  const employee = { _id: IDS.profile, user: IDS.employee, employeeNumber: "EMP-000003", department: IDS.department, jobTitle: "Old title", reportsTo: null, employmentType: "FULL_TIME", startDate: new Date("2026-01-01"), endDate: null, employmentStatus: "ACTIVE", $session() {}, async save() { return this; } };
  let audit; let transactionComplete = false;
  const restores = [
    patch(mongoose, "startSession", async () => ({ withTransaction: async (work) => { await work(); transactionComplete = true; }, endSession: async () => {} })),
    patch(User, "findById", () => query(actor)),
    patch(EmployeeProfile, "findById", () => query(employee)),
    patch(auditService, "recordAuditEvent", async (event) => { audit = event; return event; }),
  ];
  try {
    const result = await organizationService.updateEmployee(IDS.profile, { jobTitle: "Operations Manager", reportsTo: null }, { actor, request: { correlationId: "employee-update-test", originalUrl: `/organization/employees/${IDS.profile}`, method: "PUT" } });
    assert.equal(transactionComplete, true);
    assert.equal(result.jobTitle, "Operations Manager");
    assert.equal(result.employeeNumber, "EMP-000003");
    assert.equal(String(result.user), IDS.employee);
    assert.equal(audit.action, "EMPLOYEE_PROFILE_UPDATED");
    assert.equal(audit.entityReference, "EMP-000003");
    assert.ok(audit.session);
    assert.doesNotMatch(JSON.stringify(audit), /password|authorization|jwt|token|secret/i);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("non-Super-Admin database actor cannot update an EmployeeProfile", { concurrency: false }, async () => {
  const actor = { _id: IDS.actor, role: ROLES.HR_MANAGER, isActive: true };
  let profileQueries = 0;
  const restores = [
    patch(mongoose, "startSession", async () => ({ withTransaction: async (work) => work(), endSession: async () => {} })),
    patch(User, "findById", () => query(actor)),
    patch(EmployeeProfile, "findById", () => { profileQueries += 1; return query(null); }),
  ];
  try {
    await assert.rejects(organizationService.updateEmployee(IDS.profile, { jobTitle: "No" }, { actor, request: { correlationId: "denied" } }), (error) => error.code === "EMPLOYEE_PROFILE_UPDATE_FORBIDDEN");
    assert.equal(profileQueries, 0);
  } finally { restores.reverse().forEach((restore) => restore()); }
});
