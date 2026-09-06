const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "organization-test-secret";

const app = require("../app");
const Department = require("../models/Department");
const EmployeeProfile = require("../models/EmployeeProfile");
const User = require("../models/User");
const EMPLOYMENT_STATUS = require("../constants/employmentStatus");
const EMPLOYMENT_TYPE = require("../constants/employmentType");
const DEPARTMENT_CODES = require("../constants/departmentCodes");
const { isInternalStaffRole, hasPermission } = require("../utils/rbac");
const { PERMISSIONS } = require("../constants/permissions");
const { ROLES } = require("../constants/roleCatalogue");
const organizationService = require("../services/organizationService");
const migrationService = require("../services/organizationMigrationService");
const seedService = require("../services/departmentSeedService");
const { SCOPE_LEVELS, getConceptualScope, getOrganizationScopeContext } = require("../utils/scopePolicy");
const { canAccessSystem, getOffboardingRecommendation } = require("../utils/employmentPolicy");

const IDS = {
  executive: "662000000000000000000001", operations: "662000000000000000000002",
  finance: "662000000000000000000003", employee: "662000000000000000000004",
  managerProfile: "662000000000000000000005", employeeProfile: "662000000000000000000006",
  thirdProfile: "662000000000000000000007", owner: "662000000000000000000008",
};
const patchMethod = (target, method, replacement) => {
  const original = target[method]; target[method] = replacement;
  return () => { target[method] = original; };
};
const queryFor = (value) => {
  const query = {
    select: () => query, populate: () => query, sort: () => query,
    skip: () => query, limit: () => query,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};
const listen = () => new Promise((resolve) => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
const close = (server) => new Promise((resolve) => server.close(resolve));

test("Department schema normalizes unique codes and defines justified indexes", async () => {
  const department = new Department({ code: "operations", name: "Operations" });
  await department.validate();
  assert.equal(department.code, "OPERATIONS"); assert.equal(department.active, true);
  const indexes = Department.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.code === 1 && options.unique));
  assert.ok(indexes.some(([fields]) => fields.parentDepartment === 1));
  assert.ok(indexes.some(([fields]) => fields.active === 1));
});

test("Department prevents self-parenting and indirect hierarchy cycles", { concurrency: false }, async () => {
  const self = new Department({ _id: IDS.operations, code: "OPS", name: "Operations", parentDepartment: IDS.operations });
  await assert.rejects(self.validate(), /cannot be its own parent/);
  const restoreTwoLevel = patchMethod(Department, "findById", () => queryFor({ _id: IDS.finance, parentDepartment: IDS.operations }));
  try {
    const twoLevel = new Department({ _id: IDS.operations, code: "OPS", name: "Operations", parentDepartment: IDS.finance });
    await assert.rejects(twoLevel.validate(), /cannot contain a cycle/);
  } finally { restoreTwoLevel(); }
  const restore = patchMethod(Department, "findById", (id) => queryFor(
    id.toString() === IDS.finance ? { _id: IDS.finance, parentDepartment: IDS.executive }
      : { _id: IDS.executive, parentDepartment: IDS.operations }
  ));
  try {
    const cyclic = new Department({ _id: IDS.operations, code: "OPS", name: "Operations", parentDepartment: IDS.finance });
    await assert.rejects(cyclic.validate(), /cannot contain a cycle/);
  } finally { restore(); }
});

test("Department rejects missing parents but retains inactive records", { concurrency: false }, async () => {
  const restoreFindId = patchMethod(Department, "findById", () => queryFor(null));
  try {
    const invalid = new Department({ code: "CHILD", name: "Child", parentDepartment: IDS.executive });
    await assert.rejects(invalid.validate(), /does not exist/);
  } finally { restoreFindId(); }
  let filter;
  const restoreFind = patchMethod(Department, "find", (value) => { filter = value; return queryFor([{ code: "OLD", active: false }]); });
  try {
    const rows = await organizationService.listDepartments({});
    assert.deepEqual(filter, {}); assert.equal(rows[0].active, false);
  } finally { restoreFind(); }
});

test("Department manager must be an internal staff User", { concurrency: false }, async () => {
  const restore = patchMethod(User, "findById", () => queryFor({ _id: IDS.owner, role: "Owner", isActive: true }));
  try {
    await assert.rejects(new Department({ code: "OPS", name: "Operations", manager: IDS.owner }).validate(), /internal staff/);
  } finally { restore(); }
});

const employeeData = (overrides = {}) => ({
  user: IDS.employee, employeeNumber: "EMP-001", department: IDS.operations,
  jobTitle: "Agent", employmentType: EMPLOYMENT_TYPE.FULL_TIME,
  startDate: new Date("2026-01-01"), employmentStatus: EMPLOYMENT_STATUS.ACTIVE,
  ...overrides,
});
const validEmployeeReferences = () => [
  patchMethod(User, "findById", () => queryFor({ _id: IDS.employee, role: "Agent", isActive: true })),
  patchMethod(Department, "findById", () => queryFor({ _id: IDS.operations, active: true })),
];

test("EmployeeProfile accepts internal staff and defines uniqueness and reporting indexes", { concurrency: false }, async () => {
  const restores = validEmployeeReferences();
  try { await new EmployeeProfile(employeeData()).validate(); }
  finally { restores.reverse().forEach((restore) => restore()); }
  const indexes = EmployeeProfile.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.user === 1 && options.unique));
  assert.ok(indexes.some(([fields, options]) => fields.employeeNumber === 1 && options.unique));
  assert.ok(indexes.some(([fields]) => fields.department === 1 && fields.employmentStatus === 1));
  assert.ok(indexes.some(([fields]) => fields.reportsTo === 1 && fields.employmentStatus === 1));
});

for (const externalRole of ["Owner", "Customer"]) {
  test(`${externalRole} cannot receive an EmployeeProfile`, { concurrency: false }, async () => {
    const restores = [
      patchMethod(User, "findById", () => queryFor({ _id: IDS.owner, role: externalRole, isActive: true })),
      patchMethod(Department, "findById", () => queryFor({ _id: IDS.operations, active: true })),
    ];
    try { await assert.rejects(new EmployeeProfile(employeeData({ user: IDS.owner })).validate(), /internal staff/); }
    finally { restores.reverse().forEach((restore) => restore()); }
  });
}

test("EmployeeProfile rejects invalid or inactive Department for active employment", { concurrency: false }, async () => {
  const restoreUser = patchMethod(User, "findById", () => queryFor({ role: "Agent", isActive: true }));
  const restoreDepartment = patchMethod(Department, "findById", () => queryFor(null));
  try { await assert.rejects(new EmployeeProfile(employeeData()).validate(), /does not exist/); }
  finally { restoreDepartment(); restoreUser(); }
  const restores = [
    patchMethod(User, "findById", () => queryFor({ role: "Agent", isActive: true })),
    patchMethod(Department, "findById", () => queryFor({ active: false })),
  ];
  try { await assert.rejects(new EmployeeProfile(employeeData()).validate(), /active Department/); }
  finally { restores.reverse().forEach((restore) => restore()); }
});

test("terminated employment remains historically valid with inactive User and Department", { concurrency: false }, async () => {
  const restores = [
    patchMethod(User, "findById", () => queryFor({ role: "Agent", isActive: false })),
    patchMethod(Department, "findById", () => queryFor({ active: false })),
  ];
  try { await new EmployeeProfile(employeeData({ employmentStatus: EMPLOYMENT_STATUS.TERMINATED })).validate(); }
  finally { restores.reverse().forEach((restore) => restore()); }
});

test("EmployeeProfile prevents self and multi-level reporting cycles", { concurrency: false }, async () => {
  const restores = validEmployeeReferences();
  try {
    const self = new EmployeeProfile({ _id: IDS.employeeProfile, ...employeeData({ reportsTo: IDS.employeeProfile }) });
    await assert.rejects(self.validate(), /report to themselves/);
    const restoreTwoLevel = patchMethod(EmployeeProfile, "findById", () => queryFor({ _id: IDS.managerProfile, reportsTo: IDS.employeeProfile }));
    try {
      const twoLevel = new EmployeeProfile({ _id: IDS.employeeProfile, ...employeeData({ reportsTo: IDS.managerProfile }) });
      await assert.rejects(twoLevel.validate(), /cannot contain a cycle/);
    } finally { restoreTwoLevel(); }
    const restoreFind = patchMethod(EmployeeProfile, "findById", (id) => queryFor(
      id.toString() === IDS.managerProfile ? { _id: IDS.managerProfile, reportsTo: IDS.thirdProfile }
        : { _id: IDS.thirdProfile, reportsTo: IDS.employeeProfile }
    ));
    try {
      const cyclic = new EmployeeProfile({ _id: IDS.employeeProfile, ...employeeData({ reportsTo: IDS.managerProfile }) });
      await assert.rejects(cyclic.validate(), /cannot contain a cycle/);
    } finally { restoreFind(); }
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("employment constants are centralized and complete", () => {
  assert.deepEqual(Object.values(EMPLOYMENT_STATUS), ["ACTIVE", "ON_LEAVE", "SUSPENDED", "TERMINATED"]);
  assert.deepEqual(Object.values(EMPLOYMENT_TYPE), ["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERN"]);
});

test("employment status remains separate from authentication access", () => {
  assert.equal(canAccessSystem({ isActive: true }), true);
  assert.equal(canAccessSystem({ isActive: false }), false);
  assert.deepEqual(
    getOffboardingRecommendation({ employmentStatus: EMPLOYMENT_STATUS.TERMINATED }, { isActive: true }),
    { employmentStatus: EMPLOYMENT_STATUS.TERMINATED, currentSystemAccess: true, reviewAccessDeactivation: true }
  );
});

test("internal-staff detection separates external roles", () => {
  for (const role of ["Admin", "Agent", ROLES.SUPER_ADMIN, ROLES.GENERAL_MANAGER, ROLES.AUDITOR]) assert.equal(isInternalStaffRole(role), true);
  assert.equal(isInternalStaffRole("Owner"), false); assert.equal(isInternalStaffRole("Customer"), false);
});

test("organization helpers return direct and descendant reports without cycles", { concurrency: false }, async () => {
  let findCalls = 0;
  const restoreOne = patchMethod(EmployeeProfile, "findOne", () => queryFor({ _id: IDS.managerProfile, user: IDS.employee }));
  const restoreFind = patchMethod(EmployeeProfile, "find", () => {
    findCalls += 1;
    if (findCalls === 1) return queryFor([{ _id: IDS.employeeProfile, user: IDS.owner }]);
    if (findCalls === 2) return queryFor([{ _id: IDS.thirdProfile, user: IDS.executive }]);
    return queryFor([]);
  });
  try {
    findCalls = 0; const direct = await organizationService.getDirectReports(IDS.employee); assert.equal(direct.length, 1);
    findCalls = 0; const managed = await organizationService.getManagedUserIds(IDS.employee); assert.deepEqual(managed.map(String), [IDS.owner, IDS.executive]);
    findCalls = 0; assert.equal(await organizationService.isManagerOf(IDS.employee, IDS.executive), true);
  } finally { restoreFind(); restoreOne(); }
});

test("organization helpers deny safely for unknown Users and resolve Department", { concurrency: false }, async () => {
  const restoreUnknown = patchMethod(EmployeeProfile, "findOne", () => queryFor(null));
  try {
    assert.deepEqual(await organizationService.getDirectReports(IDS.employee), []);
    assert.deepEqual(await organizationService.getManagedUserIds(IDS.employee), []);
    assert.equal(await organizationService.isManagerOf(IDS.employee, IDS.owner), false);
    assert.equal(await organizationService.getDepartmentForUser(IDS.employee), null);
  } finally { restoreUnknown(); }
});

test("conceptual scope does not grant permissions by hierarchy alone", { concurrency: false }, async () => {
  assert.equal(getConceptualScope(ROLES.SUPER_ADMIN), SCOPE_LEVELS.ALL);
  assert.equal(getConceptualScope(ROLES.OPERATIONS_MANAGER), SCOPE_LEVELS.DEPARTMENT);
  assert.equal(getConceptualScope("Agent"), SCOPE_LEVELS.OWN);
  const restoreDepartment = patchMethod(organizationService, "getDepartmentForUser", async () => ({ code: "OPERATIONS" }));
  const restoreManaged = patchMethod(organizationService, "getManagedUserIds", async () => [IDS.owner]);
  try {
    const context = await getOrganizationScopeContext({ _id: IDS.employee, role: ROLES.OPERATIONS_MANAGER });
    assert.equal(context.level, SCOPE_LEVELS.DEPARTMENT); assert.deepEqual(context.managedUserIds, [IDS.owner]);
    assert.equal(hasPermission(ROLES.OPERATIONS_MANAGER, PERMISSIONS.SECURITY_ADMIN), false);
  } finally { restoreManaged(); restoreDepartment(); }
});

test("organization routes require permissions and external users cannot access directory", { concurrency: false }, async () => {
  const restoreUser = patchMethod(User, "findById", () => queryFor({ _id: IDS.owner, role: "Owner", isActive: true }));
  const token = jwt.sign({ id: IDS.owner, role: "SUPER_ADMIN" }, process.env.JWT_SECRET);
  const server = await listen();
  try {
    for (const path of ["/organization/departments", "/organization/employees"]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: { authorization: `Bearer ${token}` } });
      assert.equal(response.status, 403);
    }
  } finally { await close(server); restoreUser(); }
});

test("HR Employee management cannot change User role, permissions, or access status", { concurrency: false }, async () => {
  const restoreUser = patchMethod(User, "findById", () => queryFor({ _id: IDS.employee, role: ROLES.HR_MANAGER, isActive: true }));
  const token = jwt.sign({ id: IDS.employee }, process.env.JWT_SECRET);
  const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/organization/employees/${IDS.employeeProfile}`, {
      method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ role: "SUPER_ADMIN", permissions: [PERMISSIONS.SECURITY_ADMIN], isActive: false }),
    });
    assert.equal(response.status, 400);
    assert.equal(hasPermission(ROLES.HR_MANAGER, PERMISSIONS.USER_ROLE_MANAGE), false);
  } finally { await close(server); restoreUser(); }
});

test("/auth/me returns safe optional organization projection", { concurrency: false }, async () => {
  const user = new User({ _id: IDS.employee, name: "Staff", email: "staff-org@example.com", password: "hash", role: ROLES.HR_MANAGER, isActive: true });
  const profile = { employeeNumber: "EMP-001", jobTitle: "HR Manager", employmentStatus: "ACTIVE", department: { _id: IDS.operations, code: "HUMAN_RESOURCES", name: "Human Resources" } };
  const restoreUser = patchMethod(User, "findById", () => queryFor(user));
  const restoreProfile = patchMethod(organizationService, "getEmployeeProfileForUser", async () => profile);
  const token = jwt.sign({ id: IDS.employee }, process.env.JWT_SECRET); const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/me`, { headers: { authorization: `Bearer ${token}` } });
    const body = await response.json(); assert.equal(response.status, 200);
    assert.deepEqual(body.data.department, { _id: IDS.operations, code: "HUMAN_RESOURCES", name: "Human Resources" });
    assert.deepEqual(body.data.employee, { employeeNumber: "EMP-001", jobTitle: "HR Manager", employmentStatus: "ACTIVE" });
    assert.equal(body.data.password, undefined); assert.equal(body.data.reportsTo, undefined);
  } finally { await close(server); restoreProfile(); restoreUser(); }
});

test("/auth/me remains compatible for staff without profiles and external users", { concurrency: false }, async () => {
  for (const role of ["Agent", "Owner", "Customer"]) {
    const user = new User({ _id: IDS.employee, name: role, email: `${role.toLowerCase()}-org@example.com`, password: "hash", role, isActive: true });
    const restoreUser = patchMethod(User, "findById", () => queryFor(user));
    const restoreProfile = patchMethod(organizationService, "getEmployeeProfileForUser", async () => null);
    const token = jwt.sign({ id: IDS.employee }, process.env.JWT_SECRET); const server = await listen();
    try {
      const body = await (await fetch(`http://127.0.0.1:${server.address().port}/auth/me`, { headers: { authorization: `Bearer ${token}` } })).json();
      assert.equal(body.data.department, undefined); assert.equal(body.data.employee, undefined); assert.equal(body.data.password, undefined);
    } finally { await close(server); restoreProfile(); restoreUser(); }
  }
});

test("Super Admin bootstrap dry-run is non-mutating, rejects ambiguity, and is deterministic", { concurrency: false }, async () => {
  let updates = 0;
  const admins = [{ _id: IDS.employee, role: "Admin", isActive: true }, { _id: IDS.owner, role: "Admin", isActive: true }];
  const restoreCount = patchMethod(User, "countDocuments", async () => 0);
  const restoreFind = patchMethod(User, "find", () => queryFor(admins));
  const restoreUpdate = patchMethod(User, "findOneAndUpdate", () => { updates += 1; return queryFor(null); });
  try {
    await assert.rejects(migrationService.planSuperAdminBootstrap(), (error) => error.code === "SUPER_ADMIN_SELECTION_AMBIGUOUS");
    const first = await migrationService.planSuperAdminBootstrap({ candidateUserId: IDS.employee });
    const second = await migrationService.planSuperAdminBootstrap({ candidateUserId: IDS.employee });
    assert.deepEqual(first, second); assert.equal(first.dryRun, true); assert.equal(updates, 0);
    assert.deepEqual(first.rollback, { userId: IDS.employee, fromRole: "SUPER_ADMIN", toRole: "Admin" });
  } finally { restoreUpdate(); restoreFind(); restoreCount(); }
});

test("legacy Admin and Agent migration plans require explicit classification and preserve references", { concurrency: false }, async () => {
  const restoreFind = patchMethod(User, "find", (filter) => queryFor(
    filter.role === "Agent" ? [{ _id: IDS.employee, role: "Agent" }] : [{ _id: IDS.employee, role: "Admin" }]
  ));
  try {
    const admins = await migrationService.planLegacyAdminClassification([{ userId: IDS.employee, targetRole: ROLES.OPERATIONS_MANAGER }]);
    assert.deepEqual(admins[0], { userId: IDS.employee, fromRole: "Admin", toRole: ROLES.OPERATIONS_MANAGER });
    const agents = await migrationService.planLegacyAgentMigration();
    assert.equal(agents[0].toRole, ROLES.AGENT); assert.equal(agents[0].referencedRecordsUnchanged, true);
  } finally { restoreFind(); }
});

test("initial Department seed planning is idempotent and non-destructive", { concurrency: false }, async () => {
  let existing = [];
  const restoreFind = patchMethod(Department, "find", () => queryFor(existing));
  try {
    const dry = await seedService.initializeDepartments({ dryRun: true });
    assert.equal(dry.creates, Object.values(DEPARTMENT_CODES).length); assert.equal(existing.length, 0);
    const departmentIds = seedService.INITIAL_DEPARTMENTS.map((definition, index) =>
      `${IDS.executive.slice(0, 22)}${String(index + 1).padStart(2, "0")}`
    );
    existing = seedService.INITIAL_DEPARTMENTS.map((definition, index) => ({
      _id: departmentIds[index],
      code: definition.code,
      name: definition.name,
      parentDepartment: definition.parentCode ? departmentIds[0] : null,
      active: definition.active,
      manager: definition.manager,
    }));
    const repeated = await seedService.initializeDepartments({ dryRun: true });
    assert.equal(repeated.creates, 0); assert.equal(repeated.unchanged, Object.values(DEPARTMENT_CODES).length); assert.equal(repeated.conflicts, 0);
    assert.deepEqual(existing.map(({ code }) => code), Object.values(DEPARTMENT_CODES));
  } finally { restoreFind(); }
});
