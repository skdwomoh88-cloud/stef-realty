const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const PropertySubmission = require("../models/PropertySubmission");
const ViewingRequest = require("../models/ViewingRequest");
const Property = require("../models/Property");
const Location = require("../models/Location");
const Settings = require("../models/Settings");
const PropertyRequest = require("../models/PropertyRequest");
const User = require("../models/User");
const Sequence = require("../models/Sequence");
const Notification = require("../models/Notification");
const notificationService = require("../services/notificationService");
const propertySubmissionService = require("../services/propertySubmissionService");
const viewingRequestService = require("../services/viewingRequestService");
const propertyService = require("../services/propertyService");
const propertyRequestService = require("../services/propertyRequestService");
const submissionValidator = require("../validators/propertySubmissionValidator");
const { createViewingRequestValidator } = require("../validators/viewingRequestValidator");
const propertyRequestValidator = require("../validators/propertyRequestValidator");
const { propertyQueryValidator } = require("../validators/queryValidator");
const settingsValidator = require("../validators/settingsValidator");
const validate = require("../middleware/validationMiddleware");

const IDS = {
  admin: "660000000000000000000001", agent: "660000000000000000000002",
  otherAgent: "660000000000000000000003", property1: "660000000000000000000004",
  property2: "660000000000000000000005", location: "660000000000000000000006",
  viewing: "660000000000000000000007", request: "660000000000000000000008",
};
const patchMethod = (target, method, replacement) => {
  const original = target[method]; target[method] = replacement;
  return () => { target[method] = original; };
};
const queryFor = (value) => {
  const query = {
    select: () => query, populate: () => query, sort: () => query,
    skip: () => query, limit: () => query, session: () => query,
    distinct: async () => value,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};
const validateRequest = async (validators, body = {}, query = "") => {
  const app = express(); app.use(express.json());
  app.all("/", validators, validate, (req, res) => res.json({ success: true, data: req.body }));
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  try {
    return await fetch(`http://127.0.0.1:${server.address().port}/${query}`, {
      method: query ? "GET" : "POST", headers: { "content-type": "application/json" },
      ...(query ? {} : { body: JSON.stringify(body) }),
    });
  } finally { await new Promise((resolve) => server.close(resolve)); }
};

const validSubmission = {
  ownerName: "Public Owner", phone: "+233200000000", email: "owner@example.com",
  title: "Family House", description: "Well maintained", askingPrice: 500000,
  listingType: "Sale", category: "Residential", propertyType: "House",
  region: "Greater Accra", city: "Accra", area: "East Legon",
  exactLocation: "12 Boundary Road, near the East Legon Police Station",
};

test("public Property Submission supports predefined and explicitly unlisted locations", async () => {
  const predefined = await validateRequest(submissionValidator, { ...validSubmission, locationNotListed: false });
  assert.equal(predefined.status, 200);
  assert.equal((await validateRequest(submissionValidator, { ...validSubmission, locationNotListed: false, area: "" })).status, 400);

  const alternative = await validateRequest(submissionValidator, {
    ...validSubmission,
    locationNotListed: true,
    region: undefined,
    city: undefined,
    area: undefined,
    exactLocation: "Lakeside Estates, Lakeside.",
  });
  assert.equal(alternative.status, 200);
  assert.equal((await alternative.json()).data.locationNotListed, true);
  assert.equal((await validateRequest(submissionValidator, {
    ...validSubmission,
    locationNotListed: true,
    region: undefined,
    city: undefined,
    area: undefined,
    exactLocation: " ",
  })).status, 400);
});

test("public Property Submission validates exact location and retains workflow protections", async () => {
  const validResponse = await validateRequest(submissionValidator, validSubmission);
  assert.equal(validResponse.status, 200);
  assert.equal((await validResponse.json()).data.exactLocation, validSubmission.exactLocation);
  assert.equal((await validateRequest(submissionValidator, { ...validSubmission, exactLocation: undefined })).status, 400);
  assert.equal((await validateRequest(submissionValidator, { ...validSubmission, exactLocation: "   " })).status, 400);
  assert.equal((await validateRequest(submissionValidator, { ...validSubmission, exactLocation: "x".repeat(501) })).status, 400);
  assert.equal((await validateRequest(submissionValidator, { ...validSubmission, status: "Approved" })).status, 400);
  assert.equal((await validateRequest(submissionValidator, { ...validSubmission, propertyType: "Castle" })).status, 400);
});

test("public Property Submission retains strict invalid field validation", async () => {
  for (const body of [
    { ...validSubmission, ownerName: "A" },
    { ...validSubmission, phone: "123" },
    { ...validSubmission, title: "Hi" },
    { ...validSubmission, askingPrice: 0 },
    { ...validSubmission, askingPrice: -1 },
    { ...validSubmission, askingPrice: "not-a-number" },
    { ...validSubmission, email: "not-an-email" },
    { ...validSubmission, area: "" },
    { ...validSubmission, locationNotListed: "not-a-boolean" },
    { ...validSubmission, submissionReference: "SR-PS-2026-CHOSEN" },
  ]) assert.equal((await validateRequest(submissionValidator, body)).status, 400);
});

test("Property Submission references are public-safe, unique candidates with immutable sparse indexing", () => {
  const first = propertySubmissionService.generateSubmissionReference(new Date("2026-08-15T00:00:00Z"));
  const second = propertySubmissionService.generateSubmissionReference(new Date("2026-08-15T00:00:00Z"));
  assert.match(first, /^SR-PS-2026-[A-Z0-9]{6}$/);
  assert.match(second, /^SR-PS-2026-[A-Z0-9]{6}$/);
  assert.notEqual(first, second);
  const field = PropertySubmission.schema.path("submissionReference");
  assert.equal(field.options.unique, true);
  assert.equal(field.options.sparse, true);
  assert.equal(field.options.immutable, true);
  assert.doesNotMatch(first, new RegExp(IDS.request, "i"));
});

test("Property Submission service applies an explicit public allowlist", { concurrency: false }, async () => {
  let created;
  const restores = [
    patchMethod(PropertySubmission, "create", async (data) => { created = data; return { _id: IDS.request, ...data }; }),
    patchMethod(User, "find", () => queryFor([])),
  ];
  try {
    await propertySubmissionService.createSubmission(
      { ...validSubmission, images: ["https://attacker.example/fake.jpg"], status: "Approved", internalNotes: "spoof", submissionReference: "SR-PS-2026-CHOSEN" },
      ["http://localhost/uploads/property-submissions/server-generated.jpg"]
    );
    assert.equal(created.exactLocation, validSubmission.exactLocation);
    assert.deepEqual(created.images, ["http://localhost/uploads/property-submissions/server-generated.jpg"]);
    assert.equal(created.status, undefined); assert.equal(created.internalNotes, undefined);
    assert.notEqual(created.submissionReference, "SR-PS-2026-CHOSEN");
    assert.match(created.submissionReference, /^SR-PS-\d{4}-[A-Z0-9]{6}$/);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("Property Submission generation retries an unlikely unique-reference collision", { concurrency: false }, async () => {
  let attempts = 0;
  const references = [];
  const restores = [
    patchMethod(PropertySubmission, "create", async (data) => {
      attempts += 1;
      references.push(data.submissionReference);
      if (attempts === 1) {
        const error = new Error("duplicate reference");
        error.code = 11000;
        error.keyPattern = { submissionReference: 1 };
        throw error;
      }
      return { _id: IDS.request, ...data };
    }),
    patchMethod(User, "find", () => queryFor([])),
  ];
  try {
    const result = await propertySubmissionService.createSubmission(
      validSubmission,
      ["http://localhost/one.jpg", "http://localhost/two.jpg", "http://localhost/three.jpg"]
    );
    assert.equal(attempts, 2);
    assert.notEqual(references[0], references[1]);
    assert.equal(result.submissionReference, references[1]);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("Property Submission service persists location mode and clears stale predefined values", { concurrency: false }, async () => {
  let created;
  const restores = [
    patchMethod(PropertySubmission, "create", async (data) => { created = data; return { _id: IDS.request, ...data }; }),
    patchMethod(User, "find", () => queryFor([])),
  ];
  try {
    await propertySubmissionService.createSubmission({
      ...validSubmission,
      locationNotListed: true,
      exactLocation: "Lakeside Estates, Lakeside.",
    }, ["http://localhost/uploads/property-submissions/one.jpg", "http://localhost/uploads/property-submissions/two.jpg", "http://localhost/uploads/property-submissions/three.jpg"]);
    assert.equal(created.locationNotListed, true);
    assert.equal(created.region, null);
    assert.equal(created.city, null);
    assert.equal(created.area, null);
    assert.equal(created.exactLocation, "Lakeside Estates, Lakeside.");
  } finally { restores.reverse().forEach((restore) => restore()); }
});

const setupViewingCreate = (availableProperties, settings = { viewingFee: null, viewingFeeCurrency: null, defaultCurrency: "GHS" }) => {
  const captured = { viewing: null, notifications: [] };
  const restores = [
    patchMethod(Property, "find", () => queryFor(availableProperties)),
    patchMethod(Settings, "findOne", () => queryFor(settings)),
    patchMethod(ViewingRequest, "create", async (data) => { captured.viewing = data; return { _id: IDS.viewing, ...data }; }),
    patchMethod(ViewingRequest, "findById", () => queryFor({ _id: IDS.viewing, ...captured.viewing })),
    patchMethod(User, "find", () => queryFor([{ _id: IDS.admin }])),
    patchMethod(notificationService, "createNotification", async (data) => { captured.notifications.push(data); return data; }),
  ];
  return { captured, restore: () => restores.reverse().forEach((restore) => restore()) };
};
const viewingData = { fullName: "Client", email: "client@example.com", phone: "0200000000", preferredDate: "2026-09-01", preferredTime: "10:00", message: "Morning" };

test("Viewing Request accepts one or multiple Properties and deduplicates IDs", { concurrency: false }, async () => {
  const properties = [{ _id: IDS.property1, title: "One" }, { _id: IDS.property2, title: "Two" }];
  const setup = setupViewingCreate(properties);
  try {
    const result = await viewingRequestService.createViewingRequest({ ...viewingData, properties: [IDS.property1, IDS.property1, IDS.property2] });
    assert.deepEqual(setup.captured.viewing.properties, [IDS.property1, IDS.property2]);
    assert.equal(setup.captured.viewing.property, IDS.property1);
    assert.equal(result.properties.length, 2);
    assert.match(setup.captured.notifications[0].message, /2 properties/);
  } finally { setup.restore(); }
});

test("Viewing Request supports the legacy property input and normalizes historical records", { concurrency: false }, async () => {
  const setup = setupViewingCreate([{ _id: IDS.property1, title: "One" }]);
  try {
    const result = await viewingRequestService.createViewingRequest({ ...viewingData, property: IDS.property1 });
    assert.equal(result.property, IDS.property1); assert.deepEqual(result.properties, [IDS.property1]);
    const legacy = { property: { _id: IDS.property1, title: "One" } };
    assert.deepEqual(viewingRequestService.normalizeViewingProperties(legacy).properties, [legacy.property]);
  } finally { setup.restore(); }
});

test("Viewing Request rejects unavailable selections and public payment-field spoofing", { concurrency: false }, async () => {
  const setup = setupViewingCreate([{ _id: IDS.property1, title: "One" }]);
  try {
    await assert.rejects(
      viewingRequestService.createViewingRequest({ ...viewingData, properties: [IDS.property1, IDS.property2] }),
      (error) => error.code === "PROPERTY_NOT_PUBLIC"
    );
  } finally { setup.restore(); }
  assert.equal((await validateRequest(createViewingRequestValidator, { ...viewingData, property: "bad" })).status, 400);
  assert.equal((await validateRequest(createViewingRequestValidator, { ...viewingData, property: IDS.property1, paymentStatus: "Paid", amountDue: 1 })).status, 400);
});

test("Viewing fee is captured once by the server and payment starts Pending", { concurrency: false }, async () => {
  const setup = setupViewingCreate([{ _id: IDS.property1, title: "One" }], { viewingFee: 150, viewingFeeCurrency: "USD", defaultCurrency: "GHS" });
  try {
    await viewingRequestService.createViewingRequest({ ...viewingData, property: IDS.property1, amountDue: 1, paymentStatus: "Paid" });
    assert.equal(setup.captured.viewing.amountDue, 150);
    assert.equal(setup.captured.viewing.currency, "USD");
    assert.equal(setup.captured.viewing.paymentStatus, "Pending");
    assert.equal(setup.captured.viewing.paidAt, undefined);
  } finally { setup.restore(); }
});

test("Viewing and Settings schemas preserve disabled-fee defaults and validate configured values", async () => {
  const viewing = new ViewingRequest({ property: IDS.property1, fullName: "Client", email: "c@example.com", phone: "1234567", preferredDate: new Date(), preferredTime: "10:00" });
  await viewing.validate();
  assert.deepEqual(viewing.properties.map(String), [IDS.property1]); assert.equal(viewing.paymentStatus, "Pending"); assert.equal(viewing.amountDue, null);
  const settings = new Settings(); assert.equal(settings.viewingFee, null); assert.equal(settings.viewingFeeCurrency, null);
  assert.equal((await validateRequest(settingsValidator, { viewingFee: -1, viewingFeeCurrency: "GH" })).status, 400);
  assert.equal((await validateRequest(settingsValidator, { viewingFee: 100, viewingFeeCurrency: "gbp" })).status, 200);
});

test("public Property filtering uses active Location IDs and retains visibility constraints", { concurrency: false }, async () => {
  let propertyFilter; let locationFilter;
  const restores = [
    patchMethod(Location, "findOne", (filter) => { locationFilter = filter; return queryFor({ _id: IDS.location }); }),
    patchMethod(Property, "countDocuments", async (filter) => { propertyFilter = filter; return 1; }),
    patchMethod(Property, "find", (filter) => { propertyFilter = filter; return queryFor([{ _id: IDS.property1 }]); }),
  ];
  try {
    const result = await propertyService.getPublicProperties({ location: IDS.location });
    assert.equal(locationFilter.active, true); assert.equal(propertyFilter.location, IDS.location);
    assert.equal(propertyFilter.status, "Available"); assert.equal(propertyFilter.verificationStatus, "Verified"); assert.equal(propertyFilter.isArchived, false);
    assert.equal(result.properties.length, 1);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("public Property filtering supports Location hierarchy and rejects inactive IDs", { concurrency: false }, async () => {
  let hierarchyFilter;
  const restores = [
    patchMethod(Location, "find", (filter) => { hierarchyFilter = filter; return queryFor([IDS.location]); }),
    patchMethod(Property, "countDocuments", async () => 0),
    patchMethod(Property, "find", () => queryFor([])),
  ];
  try {
    await propertyService.getPublicProperties({ region: "Greater Accra", city: "Accra" });
    assert.deepEqual(hierarchyFilter, { active: true, region: "Greater Accra", city: "Accra" });
  } finally { restores.reverse().forEach((restore) => restore()); }
  const restoreLocation = patchMethod(Location, "findOne", () => queryFor(null));
  try { await assert.rejects(propertyService.getPublicProperties({ location: IDS.location }), (error) => error.code === "INVALID_LOCATION_FILTER"); }
  finally { restoreLocation(); }
});

const validPropertyRequest = { fullName: "Buyer", email: "buyer@example.com", phone: "0200000000", preferredContactMethod: "Phone", listingType: "Sale", category: "Residential", propertyType: "House", minBudget: 100000, maxBudget: 500000, currency: "GHS", requirements: "Three bedrooms" };

test("Property Request public validation accepts valid data and rejects protected fields or reversed budgets", async () => {
  assert.equal((await validateRequest(propertyRequestValidator.publicCreate, validPropertyRequest)).status, 200);
  assert.equal((await validateRequest(propertyRequestValidator.publicCreate, { ...validPropertyRequest, status: "Completed" })).status, 400);
  assert.equal((await validateRequest(propertyRequestValidator.publicCreate, { ...validPropertyRequest, minBudget: 600000 })).status, 400);
});

test("Property Request creation generates PREQ reference and notifies active Admins", { concurrency: false }, async () => {
  let created; let notification;
  const restores = [
    patchMethod(Sequence, "findOneAndUpdate", async () => ({ value: 1 })),
    patchMethod(PropertyRequest, "create", async (data) => { created = { _id: IDS.request, ...data }; return created; }),
    patchMethod(User, "find", () => queryFor([{ _id: IDS.admin }])),
    patchMethod(notificationService, "createNotification", async (data) => { notification = data; return data; }),
  ];
  try {
    await propertyRequestService.create({ ...validPropertyRequest, priority: "High", internalNotes: "spoof" });
    assert.match(created.requestNumber, /^PREQ-\d{4}-000001$/); assert.equal(created.priority, undefined);
    assert.equal(notification.type, "Property Request"); assert.equal(notification.relatedPropertyRequest, IDS.request);
    await new Notification(notification).validate();
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("Property Request list is paginated and Agent scope cannot be overridden", { concurrency: false }, async () => {
  let filter;
  const restores = [
    patchMethod(PropertyRequest, "find", (value) => { filter = value; return queryFor([]); }),
    patchMethod(PropertyRequest, "countDocuments", async () => 21),
  ];
  try {
    const result = await propertyRequestService.list({ page: 2, limit: 10, assignedAgent: IDS.otherAgent }, { _id: IDS.agent, role: "Agent" });
    assert.equal(filter.assignedAgent, IDS.agent); assert.equal(result.pagination.totalPages, 3);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("Property Request assignment validates Agent and notifies them", { concurrency: false }, async () => {
  const request = { _id: IDS.request, requestNumber: "PREQ-2026-000001", save: async () => request };
  let notification;
  const restores = [
    patchMethod(User, "findById", () => queryFor({ _id: IDS.agent, role: "Agent", isActive: true })),
    patchMethod(PropertyRequest, "findById", () => queryFor(request)),
    patchMethod(notificationService, "createNotification", async (data) => { notification = data; return data; }),
  ];
  try {
    await propertyRequestService.assign(IDS.request, IDS.agent, { _id: IDS.admin, role: "Admin" });
    assert.equal(request.assignedAgent, IDS.agent); assert.equal(notification.recipient, IDS.agent); assert.equal(notification.type, "Property Request");
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("Agent can update own Property Request but not another Agent's", { concurrency: false }, async () => {
  const own = { _id: IDS.request, assignedAgent: IDS.agent, status: "New", save: async () => own };
  const restore = patchMethod(PropertyRequest, "findById", () => queryFor(own));
  try {
    await propertyRequestService.update(IDS.request, { status: "Searching" }, { _id: IDS.agent, role: "Agent" });
    assert.equal(own.status, "Searching");
    own.assignedAgent = IDS.otherAgent;
    await assert.rejects(propertyRequestService.update(IDS.request, { status: "Completed" }, { _id: IDS.agent, role: "Agent" }), (error) => error.code === "FORBIDDEN");
  } finally { restore(); }
});

test("Property Type query validation explicitly accepts real enum values and rejects unknown ones", async () => {
  assert.equal((await validateRequest(propertyQueryValidator, {}, "?propertyType=House")).status, 200);
  assert.equal((await validateRequest(propertyQueryValidator, {}, "?propertyType=Castle")).status, 400);
});
