const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const User = require("../models/User");
const Department = require("../models/Department");
const EmployeeProfile = require("../models/EmployeeProfile");
const auditService = require("../services/auditService");
const migrationService = require("../services/organizationMigrationService");
const { ROLES } = require("../constants/roleCatalogue");

const IDS = {
  actor: "788000000000000000000001", target: "788000000000000000000002",
  profile: "788000000000000000000003", department: "788000000000000000000004",
  audit: "788000000000000000000005",
};
const actorInput = { _id: IDS.actor, role: ROLES.SUPER_ADMIN };
const request = { correlationId: "legacy-agent-migration-test-123" };
const target = { _id: IDS.target, name: "Stef", email: "stef@example.com", role: "Agent", isActive: true };
const employee = { _id: IDS.profile, user: IDS.target, employeeNumber: "EMP-000002", department: IDS.department, employmentStatus: "ACTIVE" };
const department = { _id: IDS.department, code: "OPERATIONS", active: true, manager: null };
const confirmation = `MIGRATE_AGENT:${IDS.target}`;
const plan = {
  dryRun: true, userId: IDS.target, currentRole: "Agent", targetRole: "AGENT", isActive: true,
  expectedEmployeeProfile: {
    id: IDS.profile, employeeNumber: "EMP-000002", departmentId: IDS.department,
    departmentCode: "OPERATIONS", employmentStatus: "ACTIVE",
  },
  confirmation,
  rollback: { userId: IDS.target, currentRole: "AGENT", targetRole: "Agent", action: "USER_ROLE_CHANGED", requiresSeparateApproval: true },
};

const patchMethod = (object, method, replacement) => {
  const original = object[method]; object[method] = replacement;
  return () => { object[method] = original; };
};
const queryFor = (value, sessions = null) => {
  const query = {
    select: () => query,
    session: (session) => { if (sessions) sessions.push(session); return query; },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

const planHarness = ({ role = "Agent", active = true, userMissing = false, profile = employee, departmentValue = department } = {}) => {
  const restores = [
    patchMethod(User, "findById", () => queryFor(userMissing ? null : { ...target, role, isActive: active })),
    patchMethod(EmployeeProfile, "findOne", () => queryFor(profile)),
    patchMethod(Department, "findById", () => queryFor(departmentValue)),
  ];
  return { restore: () => restores.reverse().forEach((restore) => restore()) };
};

test("targeted plan is deterministic and includes exact confirmation and rollback metadata", { concurrency: false }, async () => {
  const h = planHarness();
  try {
    const result = await migrationService.planTargetedLegacyAgentMigration({ candidateUserId: IDS.target });
    assert.equal(result.dryRun, true);
    assert.equal(result.userId, IDS.target);
    assert.equal(result.currentRole, "Agent");
    assert.equal(result.targetRole, "AGENT");
    assert.equal(result.confirmation, confirmation);
    assert.deepEqual(result.expectedEmployeeProfile, {
      id: IDS.profile, employeeNumber: "EMP-000002", departmentId: IDS.department,
      departmentCode: "OPERATIONS", employmentStatus: "ACTIVE",
    });
    assert.deepEqual(result.rollback, {
      userId: IDS.target, currentRole: "AGENT", targetRole: "Agent",
      action: "USER_ROLE_CHANGED", requiresSeparateApproval: true,
    });
  } finally { h.restore(); }
});

for (const [name, setup, code] of [
  ["canonical AGENT", { role: "AGENT" }, "LEGACY_AGENT_ALREADY_MIGRATED"],
  ["non-Agent", { role: "Customer" }, "INVALID_LEGACY_AGENT_CANDIDATE"],
  ["inactive Agent", { active: false }, "INVALID_LEGACY_AGENT_CANDIDATE"],
  ["missing active profile", { profile: null }, "INVALID_LEGACY_AGENT_PROFILE"],
  ["inactive employment", { profile: { ...employee, employmentStatus: "TERMINATED" } }, "INVALID_LEGACY_AGENT_PROFILE"],
  ["inactive Department", { departmentValue: { ...department, active: false } }, "INVALID_LEGACY_AGENT_DEPARTMENT"],
]) {
  test(`targeted planner rejects ${name}`, { concurrency: false }, async () => {
    const h = planHarness(setup);
    try { await assert.rejects(migrationService.planTargetedLegacyAgentMigration({ candidateUserId: IDS.target }), (error) => error.code === code); }
    finally { h.restore(); }
  });
}

const applyHarness = ({
  actorRole = ROLES.SUPER_ADMIN, actorActive = true, actorMissing = false,
  targetRole = "Agent", targetActive = true, targetMissing = false,
  profileValue = employee, departmentValue = department,
  matchedCount = 1, modifiedCount = 1, auditFailure = false, commitFailure = false,
} = {}) => {
  let storedRole = targetRole;
  let audits = [];
  let updateCalls = 0;
  const sessions = [];
  const session = {
    withTransaction: async (work) => {
      const snapshot = { storedRole, audits: [...audits] };
      try { await work(); if (commitFailure) throw new Error("Commit failed"); }
      catch (error) { storedRole = snapshot.storedRole; audits = snapshot.audits; throw error; }
    },
    endSession: async () => {},
  };
  const currentActor = actorMissing ? null : { _id: IDS.actor, name: "Super", email: "super@example.com", role: actorRole, isActive: actorActive };
  const restores = [
    patchMethod(mongoose, "startSession", async () => session),
    patchMethod(User, "findById", (id) => queryFor(String(id) === IDS.actor ? currentActor : (targetMissing ? null : { ...target, role: storedRole, isActive: targetActive }), sessions)),
    patchMethod(EmployeeProfile, "findOne", () => queryFor(profileValue, sessions)),
    patchMethod(Department, "findById", () => queryFor(departmentValue, sessions)),
    patchMethod(User, "updateOne", async (filter, update, options) => {
      updateCalls += 1;
      assert.deepEqual({ _id: String(filter._id), role: filter.role, isActive: filter.isActive }, { _id: IDS.target, role: "Agent", isActive: true });
      assert.deepEqual(update, { $set: { role: "AGENT" } });
      assert.equal(options.session, session);
      assert.equal(options.runValidators, true);
      if (matchedCount === 1 && modifiedCount === 1) storedRole = "AGENT";
      return { matchedCount, modifiedCount };
    }),
    patchMethod(auditService, "recordAuditEvent", async (event) => {
      assert.equal(event.session, session);
      if (auditFailure) throw new Error("Audit failed");
      const audit = { _id: IDS.audit, ...event }; audits.push(audit); return audit;
    }),
  ];
  return {
    get storedRole() { return storedRole; }, get audits() { return audits; }, get updateCalls() { return updateCalls; }, sessions,
    restore: () => restores.reverse().forEach((restore) => restore()),
  };
};
const execute = (hPlan = plan, hConfirmation = confirmation, context = { actor: actorInput, request }) =>
  migrationService.applyLegacyAgentMigrationTransactional(hPlan, hConfirmation, context);

test("transaction changes only exact legacy role and writes one safe audit in the same session", { concurrency: false }, async () => {
  const h = applyHarness();
  try {
    const result = await execute();
    assert.equal(result.user.role, "AGENT");
    assert.equal(result.user._id, IDS.target);
    assert.equal(result.employee, employee);
    assert.equal(result.department, department);
    assert.equal(h.storedRole, "AGENT");
    assert.equal(h.updateCalls, 1);
    assert.equal(h.audits.length, 1);
    const event = h.audits[0];
    assert.equal(event.actor.role, ROLES.SUPER_ADMIN);
    assert.equal(event.action, "USER_ROLE_CHANGED");
    assert.equal(event.entityType, "User");
    assert.equal(event.entityId, IDS.target);
    assert.equal(event.entityReference, "stef@example.com");
    assert.deepEqual(event.before, { role: "Agent" });
    assert.deepEqual(event.after, { role: "AGENT" });
    assert.equal(event.outcome, "SUCCESS");
    assert.equal(event.request.originalUrl, "/internal/migrations/legacy-agent-role");
    assert.equal(event.request.method, "MIGRATE");
    assert.equal(event.request.correlationId, request.correlationId);
    assert.doesNotMatch(JSON.stringify(event), /password|token|authorization|permissions|secret/i);
    assert.ok(h.sessions.length >= 4);
    assert.ok(h.sessions.every((value) => value === event.session));
  } finally { h.restore(); }
});

for (const actorRole of ["Admin", ROLES.GENERAL_MANAGER, ROLES.HR_MANAGER, "Agent"] ) {
  test(`database actor role ${actorRole} is rejected despite caller spoofing`, { concurrency: false }, async () => {
    const h = applyHarness({ actorRole });
    try {
      await assert.rejects(execute(plan, confirmation, { actor: { ...actorInput, role: ROLES.SUPER_ADMIN }, request }), (error) => error.code === "LEGACY_AGENT_MIGRATION_FORBIDDEN");
      assert.equal(h.updateCalls, 0); assert.equal(h.audits.length, 0); assert.equal(h.storedRole, "Agent");
    } finally { h.restore(); }
  });
}

test("missing or inactive current Super Admin is rejected", { concurrency: false }, async () => {
  for (const setup of [{ actorMissing: true }, { actorActive: false }]) {
    const h = applyHarness(setup);
    try { await assert.rejects(execute(), (error) => error.code === "LEGACY_AGENT_MIGRATION_FORBIDDEN"); assert.equal(h.updateCalls, 0); }
    finally { h.restore(); }
  }
});

for (const [name, setup, code] of [
  ["inactive target", { targetActive: false }, "LEGACY_AGENT_MIGRATION_STALE"],
  ["already migrated target", { targetRole: "AGENT" }, "LEGACY_AGENT_ALREADY_MIGRATED"],
  ["profile number mismatch", { profileValue: { ...employee, employeeNumber: "EMP-000099" } }, "LEGACY_AGENT_PROFILE_CHANGED"],
  ["profile Department mismatch", { profileValue: { ...employee, department: "788000000000000000000099" } }, "LEGACY_AGENT_PROFILE_CHANGED"],
  ["inactive employment", { profileValue: { ...employee, employmentStatus: "TERMINATED" } }, "LEGACY_AGENT_PROFILE_CHANGED"],
  ["inactive Department", { departmentValue: { ...department, active: false } }, "LEGACY_AGENT_DEPARTMENT_CHANGED"],
  ["conditional zero match", { matchedCount: 0, modifiedCount: 0 }, "LEGACY_AGENT_CONDITIONAL_UPDATE_FAILED"],
]) {
  test(`${name} produces no role mutation or success audit`, { concurrency: false }, async () => {
    const h = applyHarness(setup);
    try {
      await assert.rejects(execute(), (error) => error.code === code);
      assert.equal(h.storedRole, setup.targetRole || "Agent");
      assert.equal(h.audits.length, 0);
    } finally { h.restore(); }
  });
}

for (const [name, setup, pattern] of [
  ["audit failure", { auditFailure: true }, /Audit failed/],
  ["commit failure", { commitFailure: true }, /Commit failed/],
]) {
  test(`${name} rolls back role and audit together`, { concurrency: false }, async () => {
    const h = applyHarness(setup);
    try {
      await assert.rejects(execute(), pattern);
      assert.equal(h.storedRole, "Agent");
      assert.equal(h.audits.length, 0);
    } finally { h.restore(); }
  });
}

test("missing, tampered, stale, and wrongly confirmed plans are rejected before mutation", { concurrency: false }, async () => {
  for (const [candidate, suppliedConfirmation] of [
    [null, confirmation],
    [{ ...plan, userId: "788000000000000000000099" }, confirmation],
    [{ ...plan, currentRole: "AGENT" }, confirmation],
    [{ ...plan, targetRole: ROLES.SUPER_ADMIN }, confirmation],
    [plan, "MIGRATE_AGENT:wrong"],
  ]) {
    await assert.rejects(execute(candidate, suppliedConfirmation));
  }
});

test("missing or unsafe trusted request context is rejected before opening a transaction", { concurrency: false }, async () => {
  for (const context of [
    { actor: actorInput, request: {} },
    { actor: actorInput, request: { correlationId: "bad id!" } },
    { actor: null, request },
  ]) {
    await assert.rejects(execute(plan, confirmation, context), (error) => error.code === "LEGACY_AGENT_MIGRATION_CONTEXT_REQUIRED");
  }
});
