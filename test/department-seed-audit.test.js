const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const Department = require("../models/Department");
const User = require("../models/User");
const auditService = require("../services/auditService");
const seedService = require("../services/departmentSeedService");
const { ROLES } = require("../constants/roleCatalogue");

const ACTOR_ID = "665000000000000000000001";
const IDS = Array.from({ length: 8 }, (_, index) => `6650000000000000000000${String(index + 10).padStart(2, "0")}`);
const patchMethod = (target, method, replacement) => {
  const original = target[method]; target[method] = replacement;
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
const actor = { _id: ACTOR_ID, name: "Super", email: "super@example.com", role: ROLES.SUPER_ADMIN, isActive: true };
const request = { correlationId: "department-seed-test-123" };
const materializeDefinitions = (definitions = seedService.INITIAL_DEPARTMENTS) =>
  definitions.map((definition, index) => ({
    _id: IDS[index],
    code: definition.code,
    name: definition.name,
    parentDepartment: definition.parentCode ? IDS[0] : null,
    active: definition.active,
    manager: definition.manager,
  }));

const harness = ({ auditFailure = false, departmentFailure = false, initial = [] } = {}) => {
  let departments = [...initial];
  let events = [];
  let saveCalls = 0;
  const session = {
    withTransaction: async (work) => {
      const departmentSnapshot = [...departments];
      const eventSnapshot = [...events];
      try { await work(); } catch (error) {
        departments = departmentSnapshot;
        events = eventSnapshot;
        throw error;
      }
    },
    endSession: async () => {},
  };
  const restores = [
    patchMethod(mongoose, "startSession", async () => session),
    patchMethod(Department, "find", () => queryFor(departments)),
    patchMethod(User, "findById", () => queryFor(actor)),
    patchMethod(Department.prototype, "save", async function save() {
      saveCalls += 1;
      if (departmentFailure && saveCalls === 1) throw new Error("Department insert failed");
      if (!this._id) this._id = IDS[departments.length];
      departments.push(this);
      return this;
    }),
    patchMethod(auditService, "recordAuditEvent", async (event) => {
      if (auditFailure) throw new Error("Audit insert failed");
      events.push(event);
      return event;
    }),
  ];
  return {
    session,
    get departments() { return departments; },
    get events() { return events; },
    restore: () => restores.reverse().forEach((restore) => restore()),
  };
};

test("Department seed dry-run needs no actor and creates neither records nor audits", { concurrency: false }, async () => {
  let mutations = 0;
  const restoreFind = patchMethod(Department, "find", () => queryFor([]));
  const restoreSave = patchMethod(Department.prototype, "save", async () => { mutations += 1; });
  const restoreAudit = patchMethod(auditService, "recordAuditEvent", async () => { mutations += 1; });
  try {
    const result = await seedService.initializeDepartments({ dryRun: true });
    assert.equal(result.creates, 8); assert.equal(result.unchanged, 0); assert.equal(result.conflicts, 0); assert.equal(mutations, 0);
  } finally { restoreAudit(); restoreSave(); restoreFind(); }
});

test("non-dry-run Department seed rejects missing audit context", async () => {
  await assert.rejects(seedService.initializeDepartments({ dryRun: false }), (error) => error.code === "SEED_AUDIT_CONTEXT_REQUIRED");
});

test("non-Super-Admin actor cannot execute Department seed", { concurrency: false }, async () => {
  const h = harness();
  const restoreUser = patchMethod(User, "findById", () => queryFor({ ...actor, role: ROLES.HR_MANAGER }));
  try {
    await assert.rejects(seedService.initializeDepartments({ dryRun: false, actor, request }), (error) => error.code === "DEPARTMENT_SEED_FORBIDDEN");
    assert.equal(h.departments.length, 0); assert.equal(h.events.length, 0);
  } finally { restoreUser(); h.restore(); }
});

test("Super Admin seed creates one safe correlated audit event per Department", { concurrency: false }, async () => {
  const h = harness();
  try {
    const result = await seedService.initializeDepartments({ dryRun: false, actor, request });
    assert.equal(result.creates, 8); assert.equal(result.conflicts, 0); assert.equal(h.departments.length, 8); assert.equal(h.events.length, 8);
    for (const [index, event] of h.events.entries()) {
      const department = h.departments[index];
      assert.equal(event.actor._id, ACTOR_ID);
      assert.equal(event.action, "DEPARTMENT_CREATED"); assert.equal(event.entityType, "Department");
      assert.equal(String(event.entityId), String(department._id)); assert.equal(event.entityReference, department.code);
      assert.equal(event.outcome, "SUCCESS"); assert.equal(event.request.correlationId, request.correlationId);
      assert.equal(event.request.originalUrl, "/internal/seed/departments"); assert.equal(event.request.method, "SEED");
      assert.deepEqual(event.after, { code: department.code, name: department.name, parentDepartment: department.parentDepartment, active: true, manager: null });
      assert.doesNotMatch(JSON.stringify(event), /password|token|secret|authorization/i);
      assert.equal(event.session, h.session);
    }
  } finally { h.restore(); }
});

test("audit insertion failure rolls back the complete Department batch", { concurrency: false }, async () => {
  const h = harness({ auditFailure: true });
  try {
    await assert.rejects(seedService.initializeDepartments({ dryRun: false, actor, request }), /Audit insert failed/);
    assert.equal(h.departments.length, 0); assert.equal(h.events.length, 0);
  } finally { h.restore(); }
});

test("Department insertion failure creates no success AuditEvent", { concurrency: false }, async () => {
  const h = harness({ departmentFailure: true });
  try {
    await assert.rejects(seedService.initializeDepartments({ dryRun: false, actor, request }), /Department insert failed/);
    assert.equal(h.departments.length, 0); assert.equal(h.events.length, 0);
  } finally { h.restore(); }
});

test("repeated controlled seed remains idempotent and creates no fake audits", { concurrency: false }, async () => {
  const existing = materializeDefinitions();
  const h = harness({ initial: existing });
  try {
    const result = await seedService.initializeDepartments({ dryRun: false, actor, request });
    assert.equal(result.creates, 0); assert.equal(result.unchanged, 8); assert.equal(result.conflicts, 0);
    assert.equal(h.departments.length, 8); assert.equal(h.events.length, 0);
    assert.deepEqual(h.departments, existing);
  } finally { h.restore(); }
});

test("approved definitions retain the original seven and append active unmanaged TRANSPORT", () => {
  assert.deepEqual(seedService.INITIAL_DEPARTMENTS, [
    { code: "EXECUTIVE", name: "Executive", parentCode: null, active: true, manager: null },
    { code: "OPERATIONS", name: "Operations", parentCode: "EXECUTIVE", active: true, manager: null },
    { code: "CUSTOMER_RELATIONS", name: "Customer Relations", parentCode: "EXECUTIVE", active: true, manager: null },
    { code: "FINANCE", name: "Finance", parentCode: "EXECUTIVE", active: true, manager: null },
    { code: "MARKETING", name: "Marketing", parentCode: "EXECUTIVE", active: true, manager: null },
    { code: "HUMAN_RESOURCES", name: "Human Resources", parentCode: "EXECUTIVE", active: true, manager: null },
    { code: "AUDIT", name: "Audit", parentCode: "EXECUTIVE", active: true, manager: null },
    { code: "TRANSPORT", name: "Transport", parentCode: "EXECUTIVE", active: true, manager: null },
  ]);
});

test("seven-Department dry-run proposes only TRANSPORT and remains mutation-free", { concurrency: false }, async () => {
  const existing = materializeDefinitions(seedService.INITIAL_DEPARTMENTS.slice(0, 7));
  existing[0].manager = ACTOR_ID;
  const h = harness({ initial: existing });
  try {
    const result = await seedService.initializeDepartments({ dryRun: true });
    assert.equal(result.creates, 1); assert.equal(result.unchanged, 7); assert.equal(result.conflicts, 0);
    assert.deepEqual(result.actions.filter(({ action }) => action === "create"), [{
      action: "create", code: "TRANSPORT", name: "Transport", parentCode: "EXECUTIVE", active: true, manager: null,
    }]);
    assert.deepEqual(h.departments, existing); assert.equal(h.events.length, 0);
  } finally { h.restore(); }
});

test("future TRANSPORT creation and its one audit share the Department transaction", { concurrency: false }, async () => {
  const existing = materializeDefinitions(seedService.INITIAL_DEPARTMENTS.slice(0, 7));
  const h = harness({ initial: existing });
  try {
    const result = await seedService.initializeDepartments({ dryRun: false, actor, request });
    assert.equal(result.creates, 1); assert.equal(result.unchanged, 7); assert.equal(result.conflicts, 0);
    assert.equal(h.departments.length, 8); assert.equal(h.events.length, 1);
    const transport = h.departments[7]; const event = h.events[0];
    assert.equal(transport.code, "TRANSPORT"); assert.equal(transport.name, "Transport");
    assert.equal(String(transport.parentDepartment), IDS[0]); assert.equal(transport.active, true); assert.equal(transport.manager, null);
    assert.equal(event.action, "DEPARTMENT_CREATED"); assert.equal(event.entityReference, "TRANSPORT");
    assert.equal(String(event.entityId), String(transport._id)); assert.equal(event.session, h.session);
  } finally { h.restore(); }
});

test("TRANSPORT audit failure rolls back its Department and sequence remains idempotent", { concurrency: false }, async () => {
  const existing = materializeDefinitions(seedService.INITIAL_DEPARTMENTS.slice(0, 7));
  const h = harness({ initial: existing, auditFailure: true });
  try {
    await assert.rejects(seedService.initializeDepartments({ dryRun: false, actor, request }), /Audit insert failed/);
    assert.deepEqual(h.departments, existing); assert.equal(h.events.length, 0);
  } finally { h.restore(); }
});
