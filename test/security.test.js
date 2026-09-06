const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "security-test-secret";

const app = require("../app");
const User = require("../models/User");
const Property = require("../models/Property");
const Notification = require("../models/Notification");
const Case = require("../models/Case");
const Inspection = require("../models/Inspection");
const ListingDraft = require("../models/ListingDraft");
const notificationService = require("../services/notificationService");
const caseService = require("../services/caseService");
const inspectionService = require("../services/inspectionService");
const listingDraftService = require("../services/listingDraftService");

const IDS = {
  admin: "64b000000000000000000001",
  agent: "64b000000000000000000002",
  otherAgent: "64b000000000000000000003",
  publicProperty: "64b000000000000000000004",
  privateProperty: "64b000000000000000000005",
  resource: "64b000000000000000000006",
};

const withServer = async (callback) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
};

const patchMethod = (target, method, replacement) => {
  const original = target[method];
  target[method] = replacement;
  return () => {
    target[method] = original;
  };
};

const populatedQuery = (value) => {
  const query = {
    populate: () => query,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

test("public property detail hides non-public records and returns eligible records", { concurrency: false }, async () => {
  const seenFilters = [];
  const restore = patchMethod(Property, "findOne", (filter) => ({
    select: async () => {
      seenFilters.push(filter);
      if (filter._id === IDS.publicProperty) {
        return { _id: IDS.publicProperty, title: "Public home", status: "Available" };
      }
      return null;
    },
  }));

  try {
    await withServer(async (baseUrl) => {
      const privateResponse = await fetch(`${baseUrl}/properties/${IDS.privateProperty}`);
      assert.equal(privateResponse.status, 404);

      const publicResponse = await fetch(`${baseUrl}/properties/${IDS.publicProperty}`);
      const publicBody = await publicResponse.json();
      assert.equal(publicResponse.status, 200);
      assert.equal(publicBody.data.title, "Public home");
    });

    for (const filter of seenFilters) {
      assert.equal(filter.verificationStatus, "Verified");
      assert.equal(filter.status, "Available");
      assert.equal(filter.isArchived, false);
    }
  } finally {
    restore();
  }
});

test("agent cannot create an arbitrary notification through HTTP", { concurrency: false }, async () => {
  let createCalls = 0;
  const restoreUser = patchMethod(User, "findById", () => ({
    select: async () => ({
      _id: IDS.agent,
      role: "Agent",
      isActive: true,
    }),
  }));
  const restoreNotification = patchMethod(Notification, "create", async () => {
    createCalls += 1;
    return {};
  });
  const token = jwt.sign({ id: IDS.agent }, process.env.JWT_SECRET);

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/notifications`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          title: "Forged",
          message: "Forged system message",
          type: "System",
          recipient: IDS.otherAgent,
        }),
      });

      assert.equal(response.status, 403);
      assert.equal(createCalls, 0);
    });
  } finally {
    restoreNotification();
    restoreUser();
  }
});

test("internal notification service creation remains available", { concurrency: false }, async () => {
  const expected = { _id: IDS.resource, title: "Internal notification" };
  const restore = patchMethod(Notification, "create", async (data) => ({
    ...expected,
    ...data,
  }));

  try {
    const notification = await notificationService.createNotification({
      title: expected.title,
      message: "Created by another service",
      type: "Task",
      recipient: IDS.agent,
    });
    assert.equal(notification.title, expected.title);
    assert.equal(notification.recipient, IDS.agent);
  } finally {
    restore();
  }
});

test("user documents exclude password from management-style JSON responses", { concurrency: false }, () => {
  assert.equal(User.schema.path("password").options.select, false);

  const user = new User({
    name: "Admin",
    email: "admin@example.com",
    password: "hashed-password",
    role: "Admin",
  });
  const responseBody = JSON.parse(JSON.stringify({ user }));

  assert.equal(Object.hasOwn(responseBody.user, "password"), false);
});

test("agent cannot access another agent's case while admin retains access", { concurrency: false }, async () => {
  const caseDocument = {
    _id: IDS.resource,
    assignedAgent: { _id: IDS.otherAgent },
    owner: { _id: IDS.otherAgent },
  };
  const restore = patchMethod(Case, "findById", () => populatedQuery(caseDocument));

  try {
    await assert.rejects(
      caseService.getCase(IDS.resource, { _id: IDS.agent, role: "Agent" }),
      (error) => error.statusCode === 403
    );

    const result = await caseService.getCase(
      IDS.resource,
      { _id: IDS.admin, role: "Admin" }
    );
    assert.equal(result, caseDocument);
  } finally {
    restore();
  }
});

test("agent cannot complete another agent's inspection while admin can", { concurrency: false }, async () => {
  const inspection = {
    _id: IDS.resource,
    case: IDS.resource,
    agent: IDS.otherAgent,
    status: "Scheduled",
    save: async () => inspection,
  };
  const caseDocument = {
    _id: IDS.resource,
    status: "Inspection Scheduled",
    history: [],
    save: async () => caseDocument,
  };
  const restoreInspection = patchMethod(Inspection, "findById", async () => inspection);
  const restoreCase = patchMethod(Case, "findById", async () => caseDocument);

  try {
    await assert.rejects(
      inspectionService.completeInspection(
        IDS.resource,
        "Unauthorized completion",
        { _id: IDS.agent, role: "Agent" }
      ),
      (error) => error.statusCode === 403
    );
    assert.equal(inspection.status, "Scheduled");

    await inspectionService.completeInspection(
      IDS.resource,
      "Admin completion",
      { _id: IDS.admin, role: "Admin" }
    );
    assert.equal(inspection.status, "Completed");
  } finally {
    restoreCase();
    restoreInspection();
  }
});

test("agent cannot read or submit another agent's listing draft while admin can read it", { concurrency: false }, async () => {
  const caseDocument = {
    _id: IDS.resource,
    assignedAgent: { _id: IDS.otherAgent },
    status: "Listing Draft",
    history: [],
  };
  const draft = {
    _id: IDS.resource,
    case: caseDocument,
    status: "Draft",
    save: async () => draft,
  };
  const restoreDraft = patchMethod(ListingDraft, "findById", () => populatedQuery(draft));
  const restoreCase = patchMethod(Case, "findById", async () => caseDocument);

  try {
    await assert.rejects(
      listingDraftService.getListingDraft(
        IDS.resource,
        { _id: IDS.agent, role: "Agent" }
      ),
      (error) => error.statusCode === 403
    );

    await assert.rejects(
      listingDraftService.submitForApproval(
        IDS.resource,
        { _id: IDS.agent, role: "Agent" }
      ),
      (error) => error.statusCode === 403
    );

    const result = await listingDraftService.getListingDraft(
      IDS.resource,
      { _id: IDS.admin, role: "Admin" }
    );
    assert.equal(result, draft);
  } finally {
    restoreCase();
    restoreDraft();
  }
});
