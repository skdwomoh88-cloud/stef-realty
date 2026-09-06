const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");

const ViewingRequest = require("../models/ViewingRequest");
const Feedback = require("../models/Feedback");
const User = require("../models/User");
const Sequence = require("../models/Sequence");
const Notification = require("../models/Notification");
const viewingRequestService = require("../services/viewingRequestService");
const feedbackService = require("../services/feedbackService");
const notificationService = require("../services/notificationService");
const { hashFeedbackToken } = require("../utils/feedbackToken");
const { feedbackSubmissionValidator } = require("../validators/feedbackValidator");
const validate = require("../middleware/validationMiddleware");

const IDS = {
  admin: "65d000000000000000000001",
  agent: "65d000000000000000000002",
  viewing: "65d000000000000000000003",
  property: "65d000000000000000000004",
  feedback: "65d000000000000000000005",
};
const TOKEN = "a".repeat(64);

const patchMethod = (target, method, replacement) => {
  const original = target[method];
  target[method] = replacement;
  return () => { target[method] = original; };
};

const queryFor = (value) => {
  const query = {
    select: () => query,
    session: () => query,
    populate: () => query,
    sort: () => query,
    skip: () => query,
    limit: () => query,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

const fakeSession = () => ({
  startTransaction() {},
  commitTransaction: async () => {},
  abortTransaction: async () => {},
  endSession: async () => {},
});

const baseViewing = (overrides = {}) => {
  const viewing = {
    _id: IDS.viewing,
    status: "Completed",
    assignedAgent: IDS.agent,
    property: IDS.property,
    fullName: "Client Name",
    email: "client@example.com",
    feedbackTokenHash: hashFeedbackToken(TOKEN),
    feedbackTokenExpiresAt: new Date(Date.now() + 60_000),
    feedbackTokenUsedAt: null,
    save: async () => viewing,
    ...overrides,
  };
  return viewing;
};

const setupFeedbackCreation = (viewing = baseViewing()) => {
  const captured = { notifications: [], feedback: null };
  const restores = [
    patchMethod(mongoose, "startSession", async () => fakeSession()),
    patchMethod(ViewingRequest, "findById", () => queryFor(viewing)),
    patchMethod(Feedback, "findOne", () => queryFor(null)),
    patchMethod(Feedback, "create", async ([data]) => {
      captured.feedback = data;
      return [{ _id: IDS.feedback, feedbackNumber: "FDBK-2026-000001", ...data }];
    }),
    patchMethod(Feedback, "findById", () => queryFor({ _id: IDS.feedback })),
    patchMethod(Sequence, "findOneAndUpdate", async () => ({ value: 1 })),
    patchMethod(User, "find", () => queryFor([{ _id: IDS.admin, role: "Admin" }])),
    patchMethod(notificationService, "createNotification", async (data) => {
      captured.notifications.push(data);
      return data;
    }),
  ];
  return { captured, restore: () => restores.reverse().forEach((fn) => fn()) };
};

test("completing a Viewing Request creates one raw token and stores only its hash", { concurrency: false }, async () => {
  const viewing = baseViewing({
    status: "Confirmed",
    feedbackTokenHash: null,
    feedbackTokenExpiresAt: null,
    assignedAgent: IDS.agent,
  });
  const restoreViewing = patchMethod(ViewingRequest, "findById", () => queryFor(viewing));
  const restoreNotification = patchMethod(notificationService, "createNotification", async () => ({}));
  try {
    const result = await viewingRequestService.updateViewingStatus(
      IDS.viewing, "Completed", { _id: IDS.agent, role: "Agent" }
    );
    const token = result.$locals.feedbackToken;
    assert.equal(typeof token, "string");
    assert.equal(token.length, 64);
    assert.notEqual(viewing.feedbackTokenHash, token);
    assert.equal(viewing.feedbackTokenHash, hashFeedbackToken(token));
    assert.ok(viewing.feedbackTokenExpiresAt > new Date());

    const serialized = new ViewingRequest(viewing).toJSON();
    assert.equal(serialized.feedbackTokenHash, undefined);
    assert.equal(serialized.feedbackTokenExpiresAt, undefined);
    assert.equal(serialized.feedbackTokenUsedAt, undefined);
  } finally { restoreNotification(); restoreViewing(); }
});

test("re-completing a viewing does not regenerate an existing or used token", { concurrency: false }, async () => {
  const viewing = baseViewing({ status: "Confirmed", feedbackTokenUsedAt: new Date() });
  const originalHash = viewing.feedbackTokenHash;
  const restoreViewing = patchMethod(ViewingRequest, "findById", () => queryFor(viewing));
  const restoreNotification = patchMethod(notificationService, "createNotification", async () => ({}));
  try {
    const result = await viewingRequestService.updateViewingStatus(
      IDS.viewing, "Completed", { _id: IDS.agent, role: "Agent" }
    );
    assert.equal(result.$locals.feedbackToken, null);
    assert.equal(viewing.feedbackTokenHash, originalHash);
  } finally { restoreNotification(); restoreViewing(); }
});

test("valid token creates Feedback from Viewing Request data and consumes token", { concurrency: false }, async () => {
  const viewing = baseViewing();
  const setup = setupFeedbackCreation(viewing);
  try {
    await feedbackService.createFeedback({
      viewingRequest: IDS.viewing,
      feedbackToken: TOKEN,
      rating: 5,
      agent: IDS.admin,
      property: IDS.admin,
      clientName: "Spoof",
      clientEmail: "spoof@example.com",
    });
    assert.equal(setup.captured.feedback.agent, IDS.agent);
    assert.equal(setup.captured.feedback.property, IDS.property);
    assert.equal(setup.captured.feedback.clientName, "Client Name");
    assert.equal(setup.captured.feedback.clientEmail, "client@example.com");
    assert.ok(viewing.feedbackTokenUsedAt instanceof Date);
    assert.match(setup.captured.feedback.feedbackNumber, /^FDBK-2026-000001$/);
  } finally { setup.restore(); }
});

test("multi-property Viewing creates one Feedback using its compatibility Property", { concurrency: false }, async () => {
  const secondProperty = "65d000000000000000000006";
  const viewing = baseViewing({ property: null, properties: [IDS.property, secondProperty] });
  const setup = setupFeedbackCreation(viewing);
  try {
    await feedbackService.createFeedback({ viewingRequest: IDS.viewing, feedbackToken: TOKEN, rating: 5 });
    assert.equal(setup.captured.feedback.viewingRequest, IDS.viewing);
    assert.equal(setup.captured.feedback.property, IDS.property);
  } finally { setup.restore(); }
});

const rejectionCases = [
  {
    name: "invalid feedback token is rejected",
    viewing: () => baseViewing(), token: "b".repeat(64), code: "FEEDBACK_TOKEN_INVALID",
  },
  {
    name: "expired feedback token is rejected",
    viewing: () => baseViewing({ feedbackTokenExpiresAt: new Date(Date.now() - 1000) }),
    token: TOKEN, code: "FEEDBACK_TOKEN_EXPIRED",
  },
  {
    name: "used feedback token is rejected",
    viewing: () => baseViewing({ feedbackTokenUsedAt: new Date() }), token: TOKEN,
    code: "FEEDBACK_TOKEN_USED",
  },
  {
    name: "feedback before completed viewing is rejected",
    viewing: () => baseViewing({ status: "Confirmed" }), token: TOKEN,
    code: "VIEWING_NOT_COMPLETED",
  },
];

for (const item of rejectionCases) {
  test(item.name, { concurrency: false }, async () => {
    const setup = setupFeedbackCreation(item.viewing());
    try {
      await assert.rejects(
        feedbackService.createFeedback({ viewingRequest: IDS.viewing, feedbackToken: item.token, rating: 5 }),
        (error) => error.code === item.code
      );
      assert.equal(setup.captured.feedback, null);
    } finally { setup.restore(); }
  });
}

test("duplicate Feedback is rejected before token consumption", { concurrency: false }, async () => {
  const viewing = baseViewing();
  const setup = setupFeedbackCreation(viewing);
  const restoreExisting = patchMethod(Feedback, "findOne", () => queryFor({ _id: IDS.feedback }));
  try {
    await assert.rejects(
      feedbackService.createFeedback({ viewingRequest: IDS.viewing, feedbackToken: TOKEN, rating: 5 }),
      (error) => error.code === "FEEDBACK_ALREADY_SUBMITTED"
    );
    assert.equal(viewing.feedbackTokenUsedAt, null);
  } finally { restoreExisting(); setup.restore(); }
});

test("successful Feedback notifies active Admins only using the valid Feedback type", { concurrency: false }, async () => {
  const setup = setupFeedbackCreation();
  try {
    await feedbackService.createFeedback({ viewingRequest: IDS.viewing, feedbackToken: TOKEN, rating: 4 });
    assert.equal(setup.captured.notifications.length, 1);
    assert.equal(setup.captured.notifications[0].recipient, IDS.admin);
    assert.notEqual(setup.captured.notifications[0].recipient, IDS.agent);
    assert.equal(setup.captured.notifications[0].type, "Feedback");
    assert.equal(setup.captured.notifications[0].relatedFeedback, IDS.feedback);
    await new Notification({ ...setup.captured.notifications[0] }).validate();
  } finally { setup.restore(); }
});

test("rating and protected-field submission validation is enforced", async () => {
  const validationApp = express();
  validationApp.use(express.json());
  validationApp.post("/", feedbackSubmissionValidator, validate, (req, res) => res.json({ success: true }));
  const server = await new Promise((resolve) => {
    const instance = validationApp.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const submit = (body) => fetch(`http://127.0.0.1:${server.address().port}/`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  try {
    for (const body of [
      { viewingRequest: IDS.viewing, feedbackToken: TOKEN, rating: 0 },
      { viewingRequest: IDS.viewing, feedbackToken: TOKEN, rating: 6 },
      { viewingRequest: IDS.viewing, feedbackToken: TOKEN, rating: 4, communicationRating: 7 },
      { viewingRequest: IDS.viewing, feedbackToken: TOKEN, rating: 4, adminNotes: "spoof" },
    ]) assert.equal((await submit(body)).status, 400);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("Feedback schema enforces one record per Viewing Request and useful indexes", () => {
  const indexes = Feedback.schema.indexes();
  assert.ok(indexes.some(([keys, options]) => keys.viewingRequest === 1 && options.unique));
  assert.ok(indexes.some(([keys]) => keys.agent === 1 && keys.status === 1));
  assert.ok(indexes.some(([keys]) => keys.property === 1));
  assert.ok(indexes.some(([keys]) => keys.rating === 1));
  assert.ok(indexes.some(([keys]) => keys.createdAt === 1));
});

test("Admin list supports Agent, rating, status filters and pagination", { concurrency: false }, async () => {
  let filter;
  const restoreFind = patchMethod(Feedback, "find", (value) => { filter = value; return queryFor([]); });
  const restoreCount = patchMethod(Feedback, "countDocuments", async () => 21);
  try {
    const result = await feedbackService.listFeedback({
      page: 2, limit: 10, agent: IDS.agent, rating: 5, status: "Reviewed",
    });
    assert.equal(filter.agent, IDS.agent);
    assert.equal(filter.rating, 5);
    assert.equal(filter.status, "Reviewed");
    assert.equal(result.pagination.totalPages, 3);
    assert.equal(result.pagination.hasNextPage, true);
  } finally { restoreCount(); restoreFind(); }
});

test("Admin can retrieve, review, annotate, and archive Feedback", { concurrency: false }, async () => {
  const feedback = { _id: IDS.feedback, status: "New", adminNotes: "", save: async () => feedback };
  const restoreFind = patchMethod(Feedback, "findById", () => queryFor(feedback));
  try {
    assert.equal(await feedbackService.getFeedbackById(IDS.feedback), feedback);
    await feedbackService.updateFeedbackStatus(IDS.feedback, "Reviewed", { _id: IDS.admin });
    assert.equal(feedback.status, "Reviewed");
    assert.equal(feedback.reviewedBy, IDS.admin);
    assert.ok(feedback.reviewedAt instanceof Date);
    await feedbackService.updateFeedback(IDS.feedback, { adminNotes: "Reviewed internally" });
    assert.equal(feedback.adminNotes, "Reviewed internally");
    await feedbackService.archiveFeedback(IDS.feedback);
    assert.equal(feedback.status, "Archived");
  } finally { restoreFind(); }
});

test("Agent summary is scoped to authenticated Agent and projects aggregates only", { concurrency: false }, async () => {
  let pipeline;
  const safeSummary = {
    totalFeedback: 3,
    averageRating: 4.5,
    averageProfessionalism: 4,
    averageCommunication: 5,
    averagePunctuality: 4,
    averageKnowledge: 5,
    recommendationPercentage: 100,
  };
  const restoreAggregate = patchMethod(Feedback, "aggregate", async (value) => {
    pipeline = value;
    return [safeSummary];
  });
  try {
    const result = await feedbackService.getAgentSummary(IDS.agent);
    assert.deepEqual(result, safeSummary);
    assert.equal(result.clientEmail, undefined);
    assert.equal(result.review, undefined);
    assert.equal(result.adminNotes, undefined);
    assert.equal(pipeline[0].$match.agent.toString(), IDS.agent);
    assert.equal(pipeline[0].$match.status.$ne, "Archived");
    assert.deepEqual(Object.keys(pipeline.at(-1).$project), ["_id"]);
  } finally { restoreAggregate(); }
});

test("Feedback routes prevent Agents from accessing raw list and ID endpoints", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "routes", "feedbackRoutes.js"), "utf8");
  assert.match(source, /\/my\/summary[\s\S]*authorize\(ROLES\.AGENT\)/);
  assert.match(source, /router\.get\([\s\S]*authorize\(ROLES\.ADMIN\)[\s\S]*controller\.listFeedback/);
  assert.match(source, /"\/:id"[\s\S]*authorize\(ROLES\.ADMIN\)[\s\S]*controller\.getFeedbackById/);
});
