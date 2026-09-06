const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const User = require("../models/User");
const Department = require("../models/Department");
const EmployeeProfile = require("../models/EmployeeProfile");
const sequenceService = require("../services/sequenceService");
const auditService = require("../services/auditService");
const service = require("../services/employeeProfileBootstrapService");
const { ROLES } = require("../constants/roleCatalogue");

const IDS = {
  actor: "777000000000000000000001",
  target: "777000000000000000000002",
  department: "777000000000000000000003",
  profile: "777000000000000000000004",
  audit: "777000000000000000000005",
};
const request = { correlationId: "employee-general-create-test-123" };
const actorInput = { _id: IDS.actor, role: ROLES.SUPER_ADMIN };
const approvedProfile = {
  jobTitle: "Real Estate Agent",
  reportsTo: null,
  employmentType: "FULL_TIME",
  startDate: new Date("2026-08-14T00:00:00.000Z"),
  endDate: null,
  employmentStatus: "ACTIVE",
};

const patchMethod = (target, method, replacement) => {
  const original = target[method];
  target[method] = replacement;
  return () => { target[method] = original; };
};
const queryFor = (value) => {
  const query = {
    select: () => query,
    session: () => query,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

const harness = ({
  actorRole = ROLES.SUPER_ADMIN,
  actorActive = true,
  actorMissing = false,
  targetRole = "Agent",
  targetActive = true,
  targetMissing = false,
  departmentActive = true,
  departmentMissing = false,
  existingProfile = null,
  sequenceStart = 1,
  sequenceFailure = false,
  validationFailure = false,
  insertFailure = false,
  auditFailure = false,
  commitFailure = false,
} = {}) => {
  let sequence = sequenceStart;
  let profiles = [];
  let audits = [];
  let sequenceCalls = 0;
  let validatedDocument = null;
  const session = {
    withTransaction: async (work) => {
      const snapshot = { sequence, profiles: [...profiles], audits: [...audits] };
      try {
        await work();
        if (commitFailure) throw new Error("Commit failed");
      } catch (error) {
        sequence = snapshot.sequence;
        profiles = snapshot.profiles;
        audits = snapshot.audits;
        throw error;
      }
    },
    endSession: async () => {},
  };
  const currentActor = actorMissing ? null : {
    _id: IDS.actor, name: "Super", email: "super@example.com", role: actorRole, isActive: actorActive,
  };
  const target = targetMissing ? null : {
    _id: IDS.target, name: "Stef", email: "stef@example.com", role: targetRole, isActive: targetActive,
  };
  const department = departmentMissing ? null : {
    _id: IDS.department, code: "OPERATIONS", name: "Operations", active: departmentActive, manager: null,
  };
  const restores = [
    patchMethod(mongoose, "startSession", async () => session),
    patchMethod(User, "findById", (id) => queryFor(String(id) === IDS.actor ? currentActor : target)),
    patchMethod(Department, "findById", () => queryFor(department)),
    patchMethod(EmployeeProfile, "findOne", () => queryFor(existingProfile)),
    patchMethod(EmployeeProfile.prototype, "validate", async function validate() {
      validatedDocument = this;
      if (validationFailure) throw new Error("Schema validation failed");
    }),
    patchMethod(sequenceService, "getNextSequence", async (name, options) => {
      assert.equal(name, "employee");
      assert.equal(options.session, session);
      sequenceCalls += 1;
      if (sequenceFailure) throw new Error("Sequence failed");
      sequence += 1;
      return sequence;
    }),
    patchMethod(EmployeeProfile.prototype, "save", async function save(options) {
      assert.equal(options.session, session);
      if (insertFailure === "duplicate") { const error = new Error("duplicate"); error.code = 11000; throw error; }
      if (insertFailure) throw new Error("Profile insert failed");
      this._id = IDS.profile;
      profiles.push(this);
      return this;
    }),
    patchMethod(auditService, "recordAuditEvent", async (event) => {
      assert.equal(event.session, session);
      if (auditFailure) throw new Error("Audit insert failed");
      const audit = { _id: IDS.audit, ...event };
      audits.push(audit);
      return audit;
    }),
  ];
  return {
    get sequence() { return sequence; },
    get profiles() { return profiles; },
    get audits() { return audits; },
    get sequenceCalls() { return sequenceCalls; },
    get validatedDocument() { return validatedDocument; },
    restore: () => restores.reverse().forEach((restore) => restore()),
  };
};

const execute = (overrides = {}) => service.createEmployeeProfileTransactional({
  actor: actorInput,
  request,
  userId: IDS.target,
  departmentId: IDS.department,
  profile: approvedProfile,
  expectedNextSequenceValue: 2,
  ...overrides,
});
test("employee number formatting supports generalized sequence values", () => {
  assert.equal(service.formatEmployeeNumber(1), "EMP-000001");
  assert.equal(service.formatEmployeeNumber(2), "EMP-000002");
  assert.equal(service.formatEmployeeNumber(42), "EMP-000042");
});

for (const targetRole of ["Agent", ROLES.AGENT]) {
  test(`active ${targetRole} receives EMP-000002 with one safe transactional audit`, { concurrency: false }, async () => {
    const h = harness({ targetRole });
    try {
      const result = await execute();
      assert.equal(result.employee.employeeNumber, "EMP-000002");
      assert.equal(h.sequence, 2);
      assert.equal(h.profiles.length, 1);
      assert.equal(h.audits.length, 1);
      const event = h.audits[0];
      assert.equal(event.action, "EMPLOYEE_PROFILE_CREATED");
      assert.equal(event.entityType, "EmployeeProfile");
      assert.equal(event.entityReference, "EMP-000002");
      assert.equal(event.request.originalUrl, "/internal/organization/employee-profiles");
      assert.equal(event.request.method, "CREATE");
      assert.equal(event.outcome, "SUCCESS");
      assert.deepEqual(Object.keys(event.after), ["user", "employeeNumber", "department", "jobTitle", "reportsTo", "employmentType", "startDate", "endDate", "employmentStatus"]);
      assert.doesNotMatch(JSON.stringify(event), /password|token|permissions|authorization|secret/i);
    } finally { h.restore(); }
  });
}

test("caller-controlled identity, privilege, and timestamp fields are ignored", { concurrency: false }, async () => {
  const h = harness();
  try {
    const injected = {
      ...approvedProfile,
      user: IDS.actor,
      employeeNumber: "EMP-999999",
      department: IDS.actor,
      role: ROLES.SUPER_ADMIN,
      permissions: ["*"],
      password: "secret",
      manager: IDS.actor,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    const { employee } = await execute({ profile: injected });
    assert.equal(String(employee.user), IDS.target);
    assert.equal(String(employee.department), IDS.department);
    assert.equal(employee.employeeNumber, "EMP-000002");
    for (const field of ["role", "permissions", "password", "manager"]) assert.equal(employee[field], undefined);
    assert.notEqual(employee.createdAt?.getTime(), 0);
    assert.notEqual(employee.updatedAt?.getTime(), 0);
  } finally { h.restore(); }
});

for (const actorRole of ["Admin", ROLES.ADMIN, ROLES.GENERAL_MANAGER, ROLES.HR_MANAGER, "Agent", "Owner", "Customer"]) {
  test(`database actor role ${actorRole} cannot create a profile`, { concurrency: false }, async () => {
    const h = harness({ actorRole });
    try {
      await assert.rejects(execute({ actor: { ...actorInput, role: ROLES.SUPER_ADMIN } }), (error) => error.code === "EMPLOYEE_PROFILE_CREATE_FORBIDDEN");
      assert.equal(h.sequenceCalls, 0);
    } finally { h.restore(); }
  });
}

for (const [name, setup, code] of [
  ["missing actor", { actorMissing: true }, "EMPLOYEE_PROFILE_CREATE_FORBIDDEN"],
  ["inactive actor", { actorActive: false }, "EMPLOYEE_PROFILE_CREATE_FORBIDDEN"],
  ["missing target", { targetMissing: true }, "INVALID_EMPLOYEE_USER"],
  ["inactive target", { targetActive: false }, "INVALID_EMPLOYEE_USER"],
  ["Owner target", { targetRole: "Owner" }, "INVALID_EMPLOYEE_USER"],
  ["Customer target", { targetRole: "Customer" }, "INVALID_EMPLOYEE_USER"],
  ["missing Department", { departmentMissing: true }, "INVALID_EMPLOYEE_DEPARTMENT"],
  ["inactive Department", { departmentActive: false }, "INVALID_EMPLOYEE_DEPARTMENT"],
  ["duplicate User profile", { existingProfile: { _id: IDS.profile } }, "EMPLOYEE_PROFILE_ALREADY_EXISTS"],
]) {
  test(`${name} is rejected before sequence mutation`, { concurrency: false }, async () => {
    const h = harness(setup);
    try {
      await assert.rejects(execute(), (error) => error.code === code);
      assert.equal(h.sequenceCalls, 0);
      assert.equal(h.profiles.length, 0);
      assert.equal(h.audits.length, 0);
    } finally { h.restore(); }
  });
}

test("schema validation occurs before the sequence increment", { concurrency: false }, async () => {
  const h = harness({ validationFailure: true });
  try {
    await assert.rejects(execute(), /Schema validation failed/);
    assert.ok(h.validatedDocument);
    assert.equal(h.sequenceCalls, 0);
  } finally { h.restore(); }
});

test("invalid expected sequence guard is rejected before a session starts", { concurrency: false }, async () => {
  await assert.rejects(execute({ expectedNextSequenceValue: 0 }), (error) => error.code === "INVALID_EXPECTED_EMPLOYEE_SEQUENCE");
});

for (const [name, setup, expectedCode] of [
  ["expected sequence mismatch", { sequenceStart: 2 }, "EMPLOYEE_SEQUENCE_MISMATCH"],
  ["sequence failure", { sequenceFailure: true }, null],
  ["profile insertion failure", { insertFailure: true }, null],
  ["audit insertion failure", { auditFailure: true }, null],
  ["commit failure", { commitFailure: true }, null],
]) {
  test(`${name} rolls back sequence, profile, and audit state`, { concurrency: false }, async () => {
    const h = harness(setup);
    const initialSequence = h.sequence;
    try {
      await assert.rejects(execute(), expectedCode ? (error) => error.code === expectedCode : undefined);
      assert.equal(h.sequence, initialSequence);
      assert.equal(h.profiles.length, 0);
      assert.equal(h.audits.length, 0);
    } finally { h.restore(); }
  });
}

test("duplicate-key insertion becomes a controlled application conflict", { concurrency: false }, async () => {
  const h = harness({ insertFailure: "duplicate" });
  try {
    await assert.rejects(execute(), (error) => error.statusCode === 409 && error.code === "EMPLOYEE_PROFILE_DUPLICATE");
    assert.equal(h.sequence, 1);
    assert.equal(h.profiles.length, 0);
    assert.equal(h.audits.length, 0);
  } finally { h.restore(); }
});
