const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "frontend-blocker-test-secret";

const app = require("../app");
const User = require("../models/User");
const Property = require("../models/Property");
const Case = require("../models/Case");
const Inspection = require("../models/Inspection");
const ListingDraft = require("../models/ListingDraft");
const propertyService = require("../services/propertyService");
const caseService = require("../services/caseService");
const inspectionService = require("../services/inspectionService");
const listingDraftService = require("../services/listingDraftService");
const organizationService = require("../services/organizationService");

const IDS = {
  admin: "65e000000000000000000001",
  agent: "65e000000000000000000002",
  owner: "65e000000000000000000003",
  customer: "65e000000000000000000004",
  resource: "65e000000000000000000005",
};

const patchMethod = (target, method, replacement) => {
  const original = target[method];
  target[method] = replacement;
  return () => { target[method] = original; };
};
const queryFor = (value) => {
  const query = {
    select: () => query,
    populate: () => query,
    sort: () => query,
    skip: () => query,
    limit: () => query,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};
const listen = () => new Promise((resolve) => {
  const server = app.listen(0, "127.0.0.1", () => resolve(server));
});
const close = (server) => new Promise((resolve) => server.close(resolve));

test("GET /auth/me rejects unauthenticated requests", async () => {
  const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/me`);
    assert.equal(response.status, 401);
  } finally { await close(server); }
});

test("GET /auth/me returns current database role/status without password", { concurrency: false }, async () => {
  const databaseUser = new User({
    _id: IDS.agent, name: "Current Agent", email: "agent@example.com",
    password: "hashed-secret", role: "Agent", isActive: true,
  });
  const restoreUser = patchMethod(User, "findById", () => queryFor(databaseUser));
  const restoreEmployee = patchMethod(organizationService, "getEmployeeProfileForUser", async () => null);
  const token = jwt.sign({ id: IDS.agent, role: "Customer" }, process.env.JWT_SECRET);
  const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.role, "Agent");
    assert.equal(body.data.isActive, true);
    assert.equal(body.data.password, undefined);
  } finally { await close(server); restoreEmployee(); restoreUser(); }
});

test("Property management list exposes non-public inventory to Admin with pagination and filters", { concurrency: false }, async () => {
  let filter;
  const restoreFind = patchMethod(Property, "find", (value) => { filter = value; return queryFor([{ verificationStatus: "Draft" }]); });
  const restoreCount = patchMethod(Property, "countDocuments", async () => 23);
  try {
    const result = await propertyService.getManagementProperties(
      { page: 2, limit: 10, verificationStatus: "Draft", isArchived: true, sortBy: "title", sortOrder: "asc" },
      { _id: IDS.admin, role: "Admin" }
    );
    assert.equal(filter.verificationStatus, "Draft");
    assert.equal(filter.isArchived, true);
    assert.equal(result.properties[0].verificationStatus, "Draft");
    assert.equal(result.pagination.totalPages, 3);
    assert.equal(result.pagination.hasPreviousPage, true);
  } finally { restoreCount(); restoreFind(); }
});

test("Agent Property inventory is database-scoped to created or assigned Properties", { concurrency: false }, async () => {
  let filter;
  const restoreFind = patchMethod(Property, "find", (value) => { filter = value; return queryFor([]); });
  const restoreCount = patchMethod(Property, "countDocuments", async () => 0);
  try {
    await propertyService.getManagementProperties(
      { assignedAgent: IDS.admin },
      { _id: IDS.agent, role: "Agent" }
    );
    assert.deepEqual(filter.$or, [{ createdBy: IDS.agent }, { assignedAgent: IDS.agent }]);
    assert.equal(filter.assignedAgent, undefined);
  } finally { restoreCount(); restoreFind(); }
});

test("Customer cannot access Property management inventory", { concurrency: false }, async () => {
  const customer = new User({
    _id: IDS.customer, name: "Customer", email: "customer@example.com",
    password: "hash", role: "Customer", isActive: true,
  });
  const restoreUser = patchMethod(User, "findById", () => queryFor(customer));
  const token = jwt.sign({ id: IDS.customer, role: "Admin" }, process.env.JWT_SECRET);
  const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/properties/manage`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 403);
  } finally { await close(server); restoreUser(); }
});

test("Case list scopes Admin, Agent, and Owner correctly", { concurrency: false }, async () => {
  let filter;
  const restoreFind = patchMethod(Case, "find", (value) => { filter = value; return queryFor([]); });
  const restoreCount = patchMethod(Case, "countDocuments", async () => 0);
  try {
    await caseService.listCases({ status: "New Lead" }, { _id: IDS.admin, role: "Admin" });
    assert.equal(filter.assignedAgent, undefined);
    await caseService.listCases({ assignedAgent: IDS.admin }, { _id: IDS.agent, role: "Agent" });
    assert.equal(filter.assignedAgent, IDS.agent);
    await caseService.listCases({ owner: IDS.admin }, { _id: IDS.owner, role: "Owner" });
    assert.equal(filter.owner, IDS.owner);
  } finally { restoreCount(); restoreFind(); }
});

test("Customer is rejected from GET /cases", { concurrency: false }, async () => {
  const customer = new User({
    _id: IDS.customer, name: "Customer", email: "customer@example.com",
    password: "hash", role: "Customer", isActive: true,
  });
  const restoreUser = patchMethod(User, "findById", () => queryFor(customer));
  const token = jwt.sign({ id: IDS.customer }, process.env.JWT_SECRET);
  const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/cases`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 403);
  } finally { await close(server); restoreUser(); }
});

test("Inspection list gives Admin all records and scopes Agent to its ownership field", { concurrency: false }, async () => {
  let filter;
  const restoreFind = patchMethod(Inspection, "find", (value) => { filter = value; return queryFor([]); });
  const restoreCount = patchMethod(Inspection, "countDocuments", async () => 0);
  try {
    await inspectionService.listInspections({ status: "Scheduled" }, { _id: IDS.admin, role: "Admin" });
    assert.equal(filter.agent, undefined);
    await inspectionService.listInspections({ agent: IDS.admin }, { _id: IDS.agent, role: "Agent" });
    assert.equal(filter.agent, IDS.agent);
  } finally { restoreCount(); restoreFind(); }
});

test("Listing Draft list scopes Agent through assigned Case IDs", { concurrency: false }, async () => {
  let caseFilter;
  let draftFilter;
  const restoreDistinct = patchMethod(Case, "distinct", async (field, value) => { caseFilter = value; return [IDS.resource]; });
  const restoreFind = patchMethod(ListingDraft, "find", (value) => { draftFilter = value; return queryFor([]); });
  const restoreCount = patchMethod(ListingDraft, "countDocuments", async () => 0);
  try {
    const result = await listingDraftService.listListingDrafts(
      { status: "Draft", page: 1, limit: 10, sortBy: "headline", sortOrder: "asc" },
      { _id: IDS.agent, role: "Agent" }
    );
    assert.equal(caseFilter.assignedAgent, IDS.agent);
    assert.deepEqual(draftFilter.$and[1], { case: { $in: [IDS.resource] } });
    assert.equal(result.pagination.page, 1);
  } finally { restoreCount(); restoreFind(); restoreDistinct(); }
});

test("Admin Listing Draft list has no Agent ownership constraint", { concurrency: false }, async () => {
  let filter;
  const restoreFind = patchMethod(ListingDraft, "find", (value) => { filter = value; return queryFor([]); });
  const restoreCount = patchMethod(ListingDraft, "countDocuments", async () => 0);
  try {
    await listingDraftService.listListingDrafts({}, { _id: IDS.admin, role: "Admin" });
    assert.deepEqual(filter, {});
  } finally { restoreCount(); restoreFind(); }
});
