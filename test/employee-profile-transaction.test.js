const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Sequence = require("../models/Sequence");
const User = require("../models/User");
const Department = require("../models/Department");
const EmployeeProfile = require("../models/EmployeeProfile");
const sequenceService = require("../services/sequenceService");
const auditService = require("../services/auditService");
const bootstrapService = require("../services/employeeProfileBootstrapService");
const { ROLES } = require("../constants/roleCatalogue");

const IDS = {
  actor: "666000000000000000000001", target: "666000000000000000000002",
  department: "666000000000000000000003", profile: "666000000000000000000004",
  manager: "666000000000000000000005", audit: "666000000000000000000006",
};
const patchMethod = (target, method, replacement) => {
  const original = target[method]; target[method] = replacement;
  return () => { target[method] = original; };
};
const queryFor = (value, sessions = null) => {
  const query = {
    select: () => query,
    session: (session) => { if (sessions) sessions.push(session); return query; },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};
const actor = { _id: IDS.actor, name: "Super", email: "super@example.com", role: ROLES.SUPER_ADMIN, isActive: true };
const target = { _id: IDS.target, name: "Founder", email: "founder@example.com", role: ROLES.SUPER_ADMIN, isActive: true };
const department = { _id: IDS.department, code: "EXECUTIVE", name: "Executive", active: true };
const request = { correlationId: "employee-bootstrap-test-123" };
const profile = {
  jobTitle: "Founder & Chief Executive Officer", reportsTo: null,
  employmentType: "FULL_TIME", startDate: new Date("2026-08-11T00:00:00.000Z"),
  endDate: null, employmentStatus: "ACTIVE",
};

test("sequence service preserves existing callers and passes optional sessions atomically", { concurrency: false }, async () => {
  let value = 0; const calls = [];
  const restore = patchMethod(Sequence, "findOneAndUpdate", async (filter, update, options) => {
    calls.push({ filter, update, options }); value += update.$inc.value; return { value };
  });
  const session = { id: "transaction" };
  try {
    for (const name of ["deal", "document", "feedback", "offer", "propertyRequest", "task"]) {
      await sequenceService.getNextSequence(name);
    }
    const withSession = await sequenceService.getNextSequence("employee", { session });
    assert.equal(withSession, 7);
    assert.ok(calls.slice(0, 6).every(({ options }) => options.session === undefined));
    assert.equal(calls[6].options.session, session);
    assert.deepEqual(calls[6].update, { $inc: { value: 1 } });
    assert.ok(calls.every(({ options }) => options.new === true && options.upsert === true));
  } finally { restore(); }
});

test("EmployeeProfile validation uses its document session for every reference lookup", { concurrency: false }, async () => {
  const session = { id: "profile-session" }; const sessions = [];
  const restores = [
    patchMethod(User, "findById", () => queryFor({ role: ROLES.SUPER_ADMIN, isActive: true }, sessions)),
    patchMethod(Department, "findById", () => queryFor({ active: true }, sessions)),
    patchMethod(EmployeeProfile, "findById", () => queryFor({ _id: IDS.manager, reportsTo: null }, sessions)),
  ];
  try {
    const employee = new EmployeeProfile({ user: IDS.target, employeeNumber: "EMP-000001", department: IDS.department, jobTitle: "Founder", reportsTo: IDS.manager, employmentType: "FULL_TIME", startDate: new Date("2026-08-11"), employmentStatus: "ACTIVE" });
    employee.$session(session);
    await employee.validate();
    assert.equal(sessions.length, 3);
    assert.ok(sessions.every((value) => value === session));
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("EmployeeProfile validation remains unchanged without a session", { concurrency: false }, async () => {
  const sessions = [];
  const restores = [
    patchMethod(User, "findById", () => queryFor({ role: "Agent", isActive: true }, sessions)),
    patchMethod(Department, "findById", () => queryFor({ active: true }, sessions)),
  ];
  try {
    await new EmployeeProfile({ user: IDS.target, employeeNumber: "EMP-000001", department: IDS.department, jobTitle: "Agent", employmentType: "FULL_TIME", startDate: new Date("2026-08-11"), employmentStatus: "ACTIVE" }).validate();
    assert.equal(sessions.length, 0);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

const transactionHarness = ({ actorRole = ROLES.SUPER_ADMIN, sequenceStart = 0, existingUserProfile = null, existingNumberProfile = null, sequenceFailure = false, profileValidationFailure = false, profileFailure = false, auditFailure = false, commitFailure = false } = {}) => {
  let sequence = sequenceStart; let employees = []; let audits = []; let sequenceCalls = 0;
  const session = {
    withTransaction: async (work) => {
      const snapshot = { sequence, employees: [...employees], audits: [...audits] };
      try { await work(); if (commitFailure) throw new Error("Commit failed"); }
      catch (error) { sequence = snapshot.sequence; employees = snapshot.employees; audits = snapshot.audits; throw error; }
    },
    endSession: async () => {},
  };
  let profileLookups = 0;
  const restores = [
    patchMethod(mongoose, "startSession", async () => session),
    patchMethod(User, "findById", (id) => queryFor(String(id) === IDS.actor ? { ...actor, role: actorRole } : target)),
    patchMethod(Department, "findById", () => queryFor(department)),
    patchMethod(EmployeeProfile, "findOne", () => {
      profileLookups += 1;
      return queryFor(profileLookups % 2 === 1 ? existingUserProfile : existingNumberProfile);
    }),
    patchMethod(sequenceService, "getNextSequence", async (name, options) => {
      sequenceCalls += 1; assert.equal(name, "employee"); assert.equal(options.session, session);
      if (sequenceFailure) throw new Error("Sequence update failed");
      sequence += 1; return sequence;
    }),
    patchMethod(EmployeeProfile.prototype, "save", async function save(options) {
      assert.equal(options.session, session);
      if (profileValidationFailure) throw new Error("EmployeeProfile validation failed");
      if (profileFailure) throw new Error("Profile insert failed");
      this._id = IDS.profile; employees.push(this); return this;
    }),
    patchMethod(auditService, "recordAuditEvent", async (event) => {
      assert.equal(event.session, session); if (auditFailure) throw new Error("Audit insert failed");
      const audit = { _id: IDS.audit, ...event }; audits.push(audit); return audit;
    }),
  ];
  return {
    session,
    get sequence() { return sequence; }, get employees() { return employees; }, get audits() { return audits; }, get sequenceCalls() { return sequenceCalls; },
    restore: () => restores.reverse().forEach((restore) => restore()),
  };
};

const execute = () => bootstrapService.createFirstEmployeeProfile({ actor, request, userId: IDS.target, departmentId: IDS.department, profile });

test("active Super Admin transaction creates exact approved profile and safe audit", { concurrency: false }, async () => {
  const h = transactionHarness();
  try {
    const result = await execute();
    assert.equal(h.sequence, 1); assert.equal(h.employees.length, 1); assert.equal(h.audits.length, 1);
    assert.equal(result.employee.employeeNumber, "EMP-000001"); assert.equal(result.employee.jobTitle, profile.jobTitle);
    assert.equal(result.employee.employmentType, "FULL_TIME"); assert.equal(result.employee.employmentStatus, "ACTIVE");
    assert.equal(result.employee.reportsTo, null); assert.equal(result.employee.startDate.toISOString(), "2026-08-11T00:00:00.000Z");
    const event = h.audits[0];
    assert.equal(event.actor.role, ROLES.SUPER_ADMIN); assert.equal(event.action, "EMPLOYEE_PROFILE_CREATED");
    assert.equal(event.entityType, "EmployeeProfile"); assert.equal(String(event.entityId), IDS.profile); assert.equal(event.entityReference, "EMP-000001");
    assert.equal(event.outcome, "SUCCESS"); assert.equal(event.request.correlationId, request.correlationId);
    assert.equal(event.request.originalUrl, "/internal/bootstrap/employee-profiles"); assert.equal(event.request.method, "CREATE");
    assert.deepEqual(Object.keys(event.after), ["user", "employeeNumber", "department", "jobTitle", "reportsTo", "employmentType", "startDate", "endDate", "employmentStatus"]);
    assert.doesNotMatch(JSON.stringify(event), /password|token|permissions|authorization|secret/i);
  } finally { h.restore(); }
});

test("non-Super-Admin actor is rejected before sequence mutation", { concurrency: false }, async () => {
  const h = transactionHarness({ actorRole: ROLES.HR_MANAGER });
  try { await assert.rejects(execute(), (error) => error.code === "EMPLOYEE_BOOTSTRAP_FORBIDDEN"); assert.equal(h.sequenceCalls, 0); assert.equal(h.employees.length, 0); assert.equal(h.audits.length, 0); }
  finally { h.restore(); }
});

test("duplicate User profile and employee number reject before sequence mutation", { concurrency: false }, async () => {
  for (const setup of [{ existingUserProfile: { _id: IDS.profile } }, { existingNumberProfile: { _id: IDS.profile } }]) {
    const h = transactionHarness(setup);
    try { await assert.rejects(execute()); assert.equal(h.sequenceCalls, 0); assert.equal(h.employees.length, 0); assert.equal(h.audits.length, 0); }
    finally { h.restore(); }
  }
});

test("unexpected first sequence value aborts without partial state", { concurrency: false }, async () => {
  const h = transactionHarness({ sequenceStart: 1 });
  try { await assert.rejects(execute(), (error) => error.code === "EMPLOYEE_SEQUENCE_MISMATCH"); assert.equal(h.sequence, 1); assert.equal(h.employees.length, 0); assert.equal(h.audits.length, 0); }
  finally { h.restore(); }
});

for (const [name, setup, message] of [
  ["sequence failure leaves no partial state", { sequenceFailure: true }, /Sequence update failed/],
  ["profile validation failure rolls back sequence", { profileValidationFailure: true }, /EmployeeProfile validation failed/],
  ["profile insertion failure rolls back sequence", { profileFailure: true }, /Profile insert failed/],
  ["audit insertion failure rolls back sequence and profile", { auditFailure: true }, /Audit insert failed/],
  ["commit failure leaves no partial state", { commitFailure: true }, /Commit failed/],
]) {
  test(name, { concurrency: false }, async () => {
    const h = transactionHarness(setup);
    try { await assert.rejects(execute(), message); assert.equal(h.sequence, 0); assert.equal(h.employees.length, 0); assert.equal(h.audits.length, 0); }
    finally { h.restore(); }
  });
}
