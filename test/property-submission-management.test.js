const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const PropertySubmission = require("../models/PropertySubmission");
const User = require("../models/User");
const EmployeeProfile = require("../models/EmployeeProfile");
const Department = require("../models/Department");
const AuditEvent = require("../models/AuditEvent");
const Notification = require("../models/Notification");
const service = require("../services/propertySubmissionService");
const auditService = require("../services/auditService");
const notificationService = require("../services/notificationService");
const { getPermissionsForRole } = require("../utils/rbac");
const { PERMISSIONS } = require("../constants/permissions");

const IDS = { super: "660000000000000000000001", gm: "660000000000000000000002", manager: "660000000000000000000003", otherManager: "660000000000000000000004", agent: "660000000000000000000005", otherAgent: "660000000000000000000006", submission: "660000000000000000000007", department: "660000000000000000000008" };
const patch = (target, method, replacement) => { const original = target[method]; target[method] = replacement; return () => { target[method] = original; }; };
const query = (value) => { const q = { select: () => q, populate: () => q, sort: () => q, skip: () => q, limit: () => q, session: () => q, lean: () => q, then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) }; return q; };

test("Property Submission permissions implement the approved role boundaries", () => {
  const has = (role, permission) => getPermissionsForRole(role).includes(permission);
  assert.equal(has("SUPER_ADMIN", PERMISSIONS.PROPERTY_SUBMISSION_ASSIGN_MANAGER), true);
  assert.equal(has("GENERAL_MANAGER", PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ALL), true);
  assert.equal(has("GENERAL_MANAGER", PERMISSIONS.PROPERTY_SUBMISSION_ASSIGN_MANAGER), true);
  assert.equal(has("OPERATIONS_MANAGER", PERMISSIONS.PROPERTY_SUBMISSION_ASSIGN_AGENT), true);
  assert.equal(has("OPERATIONS_MANAGER", PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ALL), false);
  assert.equal(has("AGENT", PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ASSIGNED), true);
  assert.equal(has("AGENT", PERMISSIONS.PROPERTY_SUBMISSION_ASSIGN_MANAGER), false);
  for (const role of ["OWNER", "Owner", "CUSTOMER", "Customer"]) assert.equal(has(role, PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ASSIGNED), false);
});

test("Property Submission list scopes Manager and Agent while General Manager sees incoming", { concurrency: false }, async () => {
  const filters = [];
  const restores = [patch(PropertySubmission, "find", (filter) => { filters.push(filter); return query([]); }), patch(PropertySubmission, "countDocuments", async () => 0)];
  try {
    await service.getSubmissions({}, { _id: IDS.gm, role: "GENERAL_MANAGER" });
    await service.getSubmissions({}, { _id: IDS.manager, role: "OPERATIONS_MANAGER" });
    await service.getSubmissions({}, { _id: IDS.agent, role: "AGENT" });
    await service.getSubmissions({ incoming: "true" }, { _id: IDS.super, role: "SUPER_ADMIN" });
    assert.deepEqual(filters[0], {});
    assert.equal(String(filters[1].assignedManager), IDS.manager);
    assert.equal(String(filters[2].assignedAgent), IDS.agent);
    assert.equal(filters[3].assignedManager, null);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("eligible Operations Manager assignees require active Users and active Operations profiles", { concurrency: false }, async () => {
  const actor = { _id: IDS.gm, role: "GENERAL_MANAGER", isActive: true };
  let profileFilter;
  const restores = [
    patch(User, "findById", () => query(actor)),
    patch(Department, "findOne", () => query({ _id: IDS.department, code: "OPERATIONS", active: true })),
    patch(EmployeeProfile, "find", (filter) => {
      profileFilter = filter;
      return query([
        { user: { _id: IDS.manager, name: "Eligible", email: "eligible@example.test", role: "OPERATIONS_MANAGER", isActive: true }, department: IDS.department },
        { user: { _id: IDS.otherManager, name: "Inactive", email: "inactive@example.test", role: "OPERATIONS_MANAGER", isActive: false }, department: IDS.department },
        { user: { _id: IDS.agent, name: "Agent", email: "agent@example.test", role: "AGENT", isActive: true }, department: IDS.department },
      ]);
    }),
  ];
  try {
    const assignees = await service.listEligibleAssignees("manager", actor);
    assert.equal(String(profileFilter.department), IDS.department);
    assert.equal(profileFilter.employmentStatus, "ACTIVE");
    assert.deepEqual(assignees.map(({ _id }) => String(_id)), [IDS.manager]);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("manager assignee discovery returns no candidates without an active Operations Department", { concurrency: false }, async () => {
  const actor = { _id: IDS.gm, role: "GENERAL_MANAGER", isActive: true };
  let profileQueries = 0;
  const restores = [
    patch(User, "findById", () => query(actor)),
    patch(Department, "findOne", () => query(null)),
    patch(EmployeeProfile, "find", () => { profileQueries += 1; return query([]); }),
  ];
  try {
    assert.deepEqual(await service.listEligibleAssignees("manager", actor), []);
    assert.equal(profileQueries, 0);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("Agent detail lookup cannot escape assigned scope and external roles are denied", { concurrency: false }, async () => {
  let filter;
  const restore = patch(PropertySubmission, "findOne", (value) => { filter = value; return query(null); });
  try {
    await assert.rejects(service.getSubmissionById(IDS.submission, { _id: IDS.agent, role: "AGENT" }), (error) => error.code === "SUBMISSION_NOT_FOUND");
    assert.equal(String(filter.assignedAgent), IDS.agent);
    await assert.rejects(service.getSubmissions({}, { _id: IDS.agent, role: "Customer" }), (error) => error.code === "FORBIDDEN");
  } finally { restore(); }
});

test("Property Submission schema stores backward-compatible workflow state without publishing", async () => {
  const submission = new PropertySubmission({ ownerName: "Owner", phone: "0200000000", title: "House", askingPrice: 1, listingType: "Sale", category: "Residential", propertyType: "House", locationNotListed: true, exactLocation: "Lakeside", images: ["1.jpg", "2.jpg", "3.jpg"] });
  await submission.validate();
  assert.equal(submission.assignedManager, null); assert.equal(submission.assignedAgent, null); assert.deepEqual(submission.workflowHistory, []); assert.equal(submission.status, "Pending Review"); assert.equal(submission.approvedProperty, null);
});

test("manager assignment is transactional, audited, notified, and clears stale Agent on reassignment", { concurrency: false }, async () => {
  const submission = { _id: IDS.submission, submissionReference: "SR-PS-2026-ABC123", status: "Pending Review", assignedManager: IDS.otherManager, assignedAgent: IDS.otherAgent, managerAssignedAt: null, agentAssignedAt: null, workflowHistory: [], save: async () => submission };
  const users = { [IDS.gm]: { _id: IDS.gm, name: "GM", role: "GENERAL_MANAGER", isActive: true }, [IDS.manager]: { _id: IDS.manager, name: "Manager", role: "OPERATIONS_MANAGER", isActive: true } };
  let audit; let notification; let transactionCompleted = false;
  const restores = [
    patch(mongoose, "startSession", async () => ({ withTransaction: async (work) => { await work(); transactionCompleted = true; }, endSession: async () => {} })),
    patch(User, "findById", (id) => query(users[String(id)] || null)),
    patch(Department, "findOne", () => query({ _id: IDS.department, code: "OPERATIONS", active: true })),
    patch(EmployeeProfile, "findOne", () => query({ user: IDS.manager, department: IDS.department, employmentStatus: "ACTIVE" })),
    patch(PropertySubmission, "findById", () => query(submission)),
    patch(PropertySubmission, "findOne", () => query(submission)),
    patch(auditService, "recordAuditEvent", async (value) => { audit = value; return new AuditEvent({ ...value, correlationId: "test", outcome: "SUCCESS" }); }),
    patch(notificationService, "createNotification", async (value) => { notification = value; return new Notification(value); }),
  ];
  try {
    await service.assignManager(IDS.submission, IDS.manager, users[IDS.gm], { correlationId: "ps-test", originalUrl: "/property-submissions/x/assign-manager", method: "PUT" });
    assert.equal(transactionCompleted, true); assert.equal(String(submission.assignedManager), IDS.manager); assert.equal(submission.assignedAgent, null);
    assert.equal(audit.action, "PROPERTY_SUBMISSION_MANAGER_REASSIGNED"); assert.equal(audit.entityReference, submission.submissionReference); assert.equal(notification.recipient, IDS.manager); assert.equal(notification.relatedPropertySubmission, IDS.submission);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("invalid Manager target and Agent approval attempt fail without audit or notification", { concurrency: false }, async () => {
  const agentSubmission = { _id: IDS.submission, submissionReference: "SR-PS-2026-ABC123", status: "Pending Review", assignedAgent: IDS.agent, assignedManager: IDS.manager, workflowHistory: [], save: async () => agentSubmission };
  let auditCalls = 0; let notificationCalls = 0;
  const restores = [
    patch(mongoose, "startSession", async () => ({ withTransaction: async (work) => work(), endSession: async () => {} })),
    patch(User, "findById", (id) => query(String(id) === IDS.gm ? { _id: IDS.gm, role: "GENERAL_MANAGER", isActive: true } : String(id) === IDS.agent ? { _id: IDS.agent, role: "AGENT", isActive: true } : { _id: IDS.manager, role: "Customer", isActive: true })),
    patch(EmployeeProfile, "findOne", () => query({ user: IDS.agent, department: IDS.department, employmentStatus: "ACTIVE" })),
    patch(PropertySubmission, "findById", () => query(agentSubmission)), patch(PropertySubmission, "findOne", () => query(agentSubmission)),
    patch(auditService, "recordAuditEvent", async () => { auditCalls += 1; }), patch(notificationService, "createNotification", async () => { notificationCalls += 1; }),
  ];
  try {
    await assert.rejects(service.assignManager(IDS.submission, IDS.manager, { _id: IDS.gm }, {}), (error) => error.code === "INVALID_ASSIGNMENT_TARGET");
    await assert.rejects(service.updateWorkflow(IDS.submission, { status: "Approved" }, { _id: IDS.agent }, {}), (error) => error.code === "FORBIDDEN");
    assert.equal(auditCalls, 0); assert.equal(notificationCalls, 0); assert.equal(agentSubmission.status, "Pending Review");
  } finally { restores.reverse().forEach((restore) => restore()); }
});
