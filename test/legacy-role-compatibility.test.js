const test = require("node:test");
const assert = require("node:assert/strict");

const User = require("../models/User");
const Property = require("../models/Property");
const Case = require("../models/Case");
const Inspection = require("../models/Inspection");
const ListingDraft = require("../models/ListingDraft");
const Inquiry = require("../models/Inquiry");
const ViewingRequest = require("../models/ViewingRequest");
const Offer = require("../models/Offer");
const Deal = require("../models/Deal");
const PropertyRequest = require("../models/PropertyRequest");
const { ROLES } = require("../constants/roleCatalogue");
const {
  isRole,
  isPlatformAdministratorRole,
  getStoredRoleValuesForCanonicalRole,
  getStoredRoleValuesForCanonicalRoles,
} = require("../utils/rbac");
const { requireActiveAgent } = require("../utils/assignment");
const { authorize } = require("../middleware/authMiddleware");
const { findActivePlatformAdministrators } = require("../services/adminRecipientService");
const propertyService = require("../services/propertyService");
const caseService = require("../services/caseService");
const inspectionService = require("../services/inspectionService");
const listingDraftService = require("../services/listingDraftService");
const inquiryService = require("../services/inquiryService");
const viewingService = require("../services/viewingRequestService");
const offerService = require("../services/offerService");
const dealService = require("../services/dealService");
const dashboardService = require("../services/dashboardService");
const propertyRequestService = require("../services/propertyRequestService");
const searchController = require("../controllers/searchController");
const { requireDocumentRelationshipAccess } = require("../utils/documentAuthorization");

const IDS = {
  agent: "66a000000000000000000001",
  other: "66a000000000000000000002",
  resource: "66a000000000000000000003",
};
const patchMethod = (target, method, replacement) => {
  const original = target[method]; target[method] = replacement;
  return () => { target[method] = original; };
};
const queryFor = (value, capture = null) => {
  const query = {
    select: () => query, populate: () => query, sort: () => query,
    skip: () => query, limit: () => query,
    session: (session) => { if (capture) capture.session = session; return query; },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};
const agent = (role, id = IDS.agent) => ({ _id: id, role, isActive: true });

test("central stored-role helpers include only approved legacy/canonical equivalents", () => {
  assert.deepEqual(new Set(getStoredRoleValuesForCanonicalRole(ROLES.AGENT)), new Set(["Agent", "AGENT"]));
  assert.deepEqual(new Set(getStoredRoleValuesForCanonicalRole(ROLES.ADMIN)), new Set(["Admin", "ADMIN"]));
  assert.deepEqual(
    new Set(getStoredRoleValuesForCanonicalRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN])),
    new Set(["Admin", "ADMIN", "SUPER_ADMIN"])
  );
  for (const role of [ROLES.GENERAL_MANAGER, ROLES.HR_MANAGER, ROLES.AUDITOR, ROLES.OWNER, ROLES.CUSTOMER]) {
    assert.equal(getStoredRoleValuesForCanonicalRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]).includes(role), false);
    assert.equal(isRole(role, ROLES.AGENT), false);
  }
  assert.equal(isPlatformAdministratorRole("Admin"), true);
  assert.equal(isPlatformAdministratorRole(ROLES.SUPER_ADMIN), true);
  assert.equal(isPlatformAdministratorRole(ROLES.AGENT), false);
});

test("assignment accepts active legacy/canonical Agents and rejects every other identity", { concurrency: false }, async () => {
  let current = agent("Agent");
  const restore = patchMethod(User, "findById", () => queryFor(current));
  try {
    assert.equal(await requireActiveAgent(IDS.agent), current);
    current = agent(ROLES.AGENT); assert.equal(await requireActiveAgent(IDS.agent), current);
    current = agent(ROLES.AGENT); current.isActive = false;
    await assert.rejects(requireActiveAgent(IDS.agent), (error) => error.code === "INVALID_ASSIGNED_AGENT");
    for (const role of [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.GENERAL_MANAGER, ROLES.HR_MANAGER, ROLES.AUDITOR, ROLES.OWNER, ROLES.CUSTOMER]) {
      current = agent(role);
      await assert.rejects(requireActiveAgent(IDS.agent), (error) => error.code === "INVALID_ASSIGNED_AGENT");
    }
  } finally { restore(); }
});

test("platform administrator recipients are active, exact, session-aware, and deduplicated", { concurrency: false }, async () => {
  let filter; const capture = {}; const session = { id: "notification-session" };
  const admin = { _id: IDS.agent, role: "Admin" };
  const superAdmin = { _id: IDS.other, role: ROLES.SUPER_ADMIN };
  const restore = patchMethod(User, "find", (value) => { filter = value; return queryFor([admin, superAdmin, admin], capture); });
  try {
    const recipients = await findActivePlatformAdministrators({ session });
    assert.equal(filter.isActive, true); assert.equal(capture.session, session);
    assert.deepEqual(new Set(filter.role.$in), new Set(["Admin", "ADMIN", "SUPER_ADMIN"]));
    assert.deepEqual(recipients.map(({ _id }) => _id), [IDS.agent, IDS.other]);
    for (const role of [ROLES.GENERAL_MANAGER, ROLES.OPERATIONS_MANAGER, ROLES.HR_MANAGER, ROLES.AUDITOR, ROLES.OWNER, ROLES.CUSTOMER]) {
      assert.equal(filter.role.$in.includes(role), false);
    }
  } finally { restore(); }
});

test("Agent route gates accept legacy/canonical Agent, reject unrelated staff, and retain Super Admin override", () => {
  const run = (role) => {
    let passed = false; let status;
    authorize("Agent")({ user: { role } }, { status: (value) => { status = value; return { json: () => {} }; } }, () => { passed = true; });
    return { passed, status };
  };
  assert.equal(run("Agent").passed, true);
  assert.equal(run(ROLES.AGENT).passed, true);
  assert.equal(run(ROLES.SUPER_ADMIN).passed, true);
  for (const role of [ROLES.GENERAL_MANAGER, ROLES.HR_MANAGER, ROLES.AUDITOR, ROLES.OWNER, ROLES.CUSTOMER]) {
    assert.deepEqual(run(role), { passed: false, status: 403 });
  }
});

test("canonical and legacy Agents receive identical Property, Case, Inspection, and Listing Draft list scope", { concurrency: false }, async () => {
  const captures = { property: [], cases: [], inspections: [], drafts: [], caseDistinct: [] };
  const restores = [
    patchMethod(Property, "find", (filter) => { captures.property.push(filter); return queryFor([]); }),
    patchMethod(Property, "countDocuments", async () => 0),
    patchMethod(Case, "find", (filter) => { captures.cases.push(filter); return queryFor([]); }),
    patchMethod(Case, "countDocuments", async () => 0),
    patchMethod(Inspection, "find", (filter) => { captures.inspections.push(filter); return queryFor([]); }),
    patchMethod(Inspection, "countDocuments", async () => 0),
    patchMethod(Case, "distinct", async (field, filter) => { captures.caseDistinct.push(filter); return [IDS.resource]; }),
    patchMethod(ListingDraft, "find", (filter) => { captures.drafts.push(filter); return queryFor([]); }),
    patchMethod(ListingDraft, "countDocuments", async () => 0),
  ];
  try {
    for (const role of ["Agent", ROLES.AGENT]) {
      const user = agent(role);
      await propertyService.getManagementProperties({}, user);
      await caseService.listCases({}, user);
      await inspectionService.listInspections({}, user);
      await listingDraftService.listListingDrafts({}, user);
    }
    assert.deepEqual(captures.property[0], captures.property[1]);
    assert.deepEqual(captures.cases[0], captures.cases[1]);
    assert.deepEqual(captures.inspections[0], captures.inspections[1]);
    assert.deepEqual(captures.caseDistinct[0], captures.caseDistinct[1]);
    assert.deepEqual(captures.drafts[0], captures.drafts[1]);
    assert.deepEqual(captures.property[1].$or, [{ createdBy: IDS.agent }, { assignedAgent: IDS.agent }]);
    assert.equal(captures.cases[1].assignedAgent, IDS.agent);
    assert.equal(captures.inspections[1].agent, IDS.agent);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("canonical Agent access remains own-only across Inquiry, Viewing, Offer, and Deal services", { concurrency: false }, async () => {
  const modelsAndCalls = [
    [Inquiry, inquiryService.getInquiryById],
    [ViewingRequest, viewingService.getViewingRequestById],
    [Offer, offerService.getOfferById],
    [Deal, dealService.getDealById],
  ];
  for (const [Model, call] of modelsAndCalls) {
    let assigned = IDS.agent;
    const record = { _id: IDS.resource, assignedAgent: { _id: assigned, toString: () => assigned } };
    const restore = patchMethod(Model, "findById", () => queryFor(record));
    try {
      for (const role of ["Agent", ROLES.AGENT]) assert.equal(await call(IDS.resource, agent(role)), record);
      assigned = IDS.other;
      record.assignedAgent = { _id: assigned, toString: () => assigned };
      await assert.rejects(call(IDS.resource, agent(ROLES.AGENT)), (error) => error.code === "FORBIDDEN");
    } finally { restore(); }
  }
});

test("canonical Agent document authorization equals legacy Agent and retains cross-Agent denial", { concurrency: false }, async () => {
  let owner = IDS.agent;
  const restore = patchMethod(Property, "findById", () => queryFor({ _id: IDS.resource, assignedAgent: owner }));
  try {
    for (const role of ["Agent", ROLES.AGENT]) {
      assert.ok(await requireDocumentRelationshipAccess({ relatedProperty: IDS.resource }, agent(role)));
    }
    owner = IDS.other;
    await assert.rejects(
      requireDocumentRelationshipAccess({ relatedProperty: IDS.resource }, agent(ROLES.AGENT)),
      (error) => error.code === "DOCUMENT_FORBIDDEN"
    );
  } finally { restore(); }
});

test("canonical Agent Property Request list is scoped exactly like legacy Agent", { concurrency: false }, async () => {
  const filters = [];
  const restores = [
    patchMethod(PropertyRequest, "find", (filter) => { filters.push(filter); return queryFor([]); }),
    patchMethod(PropertyRequest, "countDocuments", async () => 0),
  ];
  try {
    for (const role of ["Agent", ROLES.AGENT]) await propertyRequestService.list({}, agent(role));
    assert.deepEqual(filters[0], filters[1]);
    assert.equal(filters[1].assignedAgent, IDS.agent);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("canonical Agent global search retains the legacy assigned-record scope", { concurrency: false }, async () => {
  const propertyFilters = []; const viewingFilters = [];
  const restores = [
    patchMethod(Property, "find", (filter) => { propertyFilters.push(filter); return queryFor([]); }),
    patchMethod(ViewingRequest, "find", (filter) => { viewingFilters.push(filter); return queryFor([]); }),
  ];
  try {
    for (const role of ["Agent", ROLES.AGENT]) {
      let body;
      await searchController.globalSearch(
        { query: { q: "home" }, user: agent(role) },
        { json: (value) => { body = value; }, status: () => ({ json: (value) => { body = value; } }) }
      );
      assert.deepEqual(body.users, []); assert.deepEqual(body.submissions, []);
    }
    assert.deepEqual(propertyFilters[0], propertyFilters[1]);
    assert.deepEqual(viewingFilters[0], viewingFilters[1]);
    assert.equal(viewingFilters[1].assignedAgent, IDS.agent);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("dashboard Agent count uses one compatibility query for legacy and canonical values", { concurrency: false }, async () => {
  const filters = [];
  const countModels = [Property, Case, Inquiry];
  const restores = countModels.map((Model) => patchMethod(Model, "countDocuments", async () => 0));
  restores.push(patchMethod(User, "countDocuments", async (filter = {}) => { filters.push(filter); return filter.role ? 2 : 10; }));
  try {
    const result = await dashboardService.getAdminDashboard();
    const agentFilter = filters.find((filter) => filter.role?.$in?.includes(ROLES.AGENT));
    assert.deepEqual(new Set(agentFilter.role.$in), new Set(["Agent", "AGENT"]));
    assert.equal(result.users.agents, 2);
  } finally { restores.reverse().forEach((restore) => restore()); }
});
