const test = require("node:test");
const assert = require("node:assert/strict");

const CASE_STATUS = require("../constants/caseStatus");
const Notification = require("../models/Notification");
const PropertySubmission = require("../models/PropertySubmission");
const Property = require("../models/Property");
const Location = require("../models/Location");
const User = require("../models/User");
const Inquiry = require("../models/Inquiry");
const ViewingRequest = require("../models/ViewingRequest");
const Offer = require("../models/Offer");
const Task = require("../models/Task");
const Deal = require("../models/Deal");
const Sequence = require("../models/Sequence");

const notificationService = require("../services/notificationService");
const propertySubmissionService = require("../services/propertySubmissionService");
const inquiryService = require("../services/inquiryService");
const viewingRequestService = require("../services/viewingRequestService");
const offerService = require("../services/offerService");
const taskService = require("../services/taskService");
const dealService = require("../services/dealService");

const IDS = {
  admin: "65b000000000000000000001",
  agent: "65b000000000000000000002",
  resource: "65b000000000000000000003",
  property: "65b000000000000000000004",
  location: "65b000000000000000000005",
  offer: "65b000000000000000000006",
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
    sort: () => query,
    select: () => query,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

test("corrected notification entity types validate successfully", { concurrency: false }, async () => {
  const correctedEvents = [
    { type: "Inquiry", title: "New Inquiry" },
    { type: "Inquiry", title: "Inquiry Assigned" },
    { type: "Property", title: "New Property Submission" },
    { type: "Viewing Request", title: "Viewing Status Updated" },
  ];

  for (const event of correctedEvents) {
    const notification = new Notification({
      ...event,
      message: "Valid internal notification",
      recipient: IDS.agent,
    });
    await notification.validate();
  }
});

test("Task reassignment notification stores relatedTask", { concurrency: false }, async () => {
  const task = {
    _id: IDS.resource,
    taskNumber: "TASK-2026-000001",
    assignedAgent: IDS.admin,
    relatedProperty: IDS.property,
    save: async () => task,
  };
  let notificationData;
  const restoreUser = patchMethod(User, "findById", () => ({
    select: async () => ({ _id: IDS.agent, role: "Agent", isActive: true }),
  }));
  const restoreTask = patchMethod(Task, "findById", () => populatedQuery(task));
  const restoreNotification = patchMethod(
    notificationService,
    "createNotification",
    async (data) => {
      notificationData = data;
      return data;
    }
  );

  try {
    await taskService.updateTaskAssignment(
      IDS.resource,
      IDS.agent,
      { _id: IDS.admin, role: "Admin" }
    );

    assert.equal(notificationData.type, "Task");
    assert.equal(notificationData.relatedTask, IDS.resource);

    const notification = new Notification({
      ...notificationData,
      message: notificationData.message,
    });
    await notification.validate();
  } finally {
    restoreNotification();
    restoreTask();
    restoreUser();
  }
});

test("CASE_STATUS contains only status strings", { concurrency: false }, () => {
  const statuses = Object.values(CASE_STATUS);
  assert.ok(statuses.length > 0);
  assert.ok(statuses.every((status) => typeof status === "string"));
  assert.equal(Object.hasOwn(CASE_STATUS, "submitForApproval"), false);
});

test("property submission approval creates a Property compatible with its schema", { concurrency: false }, async () => {
  const submission = {
    _id: IDS.resource,
    ownerName: "Owner",
    title: "Submitted home",
    description: "Description",
    askingPrice: 500000,
    listingType: "Sale",
    category: "Residential",
    propertyType: "House",
    region: "Greater Accra",
    city: "Accra",
    area: "East Legon",
    images: ["https://example.com/home.jpg"],
    status: "Pending Review",
    save: async () => submission,
  };
  let propertyData;
  const restoreSubmission = patchMethod(
    PropertySubmission,
    "findById",
    async () => submission
  );
  const restoreLocation = patchMethod(Location, "findOne", async () => ({
    _id: IDS.location,
    active: true,
  }));
  const restoreProperty = patchMethod(Property, "create", async (data) => {
    propertyData = data;
    return { _id: IDS.property, ...data };
  });

  try {
    const property = await propertySubmissionService.approveSubmission(
      IDS.resource,
      { _id: IDS.admin, role: "Admin" }
    );

    await new Property(propertyData).validate();
    assert.equal(propertyData.location, IDS.location);
    assert.equal(propertyData.createdBy, IDS.admin);
    assert.deepEqual(propertyData.images, [
      { url: "https://example.com/home.jpg" },
    ]);
    assert.equal(Object.hasOwn(propertyData, "region"), false);
    assert.equal(Object.hasOwn(propertyData, "city"), false);
    assert.equal(Object.hasOwn(propertyData, "area"), false);
    assert.equal(submission.status, "Approved");
    assert.equal(submission.approvedProperty, IDS.property);
    assert.equal(property._id, IDS.property);
  } finally {
    restoreProperty();
    restoreLocation();
    restoreSubmission();
  }
});

const invalidAssignmentCases = [
  {
    name: "Inquiry rejects a nonexistent assignment target",
    user: null,
    invoke: () => inquiryService.assignAgent(IDS.resource, IDS.agent, IDS.admin),
    prepare: () => patchMethod(Inquiry, "findById", () =>
      populatedQuery({ _id: IDS.resource, property: { title: "Home" } })
    ),
  },
  {
    name: "Viewing Request rejects an inactive assignment target",
    user: { _id: IDS.agent, role: "Agent", isActive: false },
    invoke: () => viewingRequestService.updateViewingRequest(
      IDS.resource,
      { assignedAgent: IDS.agent },
      { _id: IDS.admin, role: "Admin" }
    ),
    prepare: () => patchMethod(ViewingRequest, "findById", () =>
      populatedQuery({
        _id: IDS.resource,
        property: { _id: IDS.property, title: "Home" },
        assignedAgent: null,
      })
    ),
  },
  {
    name: "Offer rejects a non-Agent assignment target",
    user: { _id: IDS.agent, role: "Customer", isActive: true },
    invoke: () => offerService.assignOffer(IDS.resource, IDS.agent, IDS.admin),
    prepare: () => patchMethod(Offer, "findById", () =>
      populatedQuery({ _id: IDS.resource, property: { title: "Home" } })
    ),
  },
  {
    name: "Task rejects an invalid assignment target",
    invalidId: true,
    invoke: () => taskService.createTask(
      { assignedAgent: "not-an-id" },
      { _id: IDS.admin, role: "Admin" }
    ),
  },
];

for (const assignmentCase of invalidAssignmentCases) {
  test(assignmentCase.name, { concurrency: false }, async () => {
    const restoreUser = patchMethod(User, "findById", () => ({
      select: async () => assignmentCase.user,
    }));
    const restoreResource = assignmentCase.prepare?.();

    try {
      await assert.rejects(
        assignmentCase.invoke(),
        (error) =>
          error.statusCode === 400 &&
          error.code === "INVALID_ASSIGNED_AGENT"
      );
    } finally {
      restoreResource?.();
      restoreUser();
    }
  });
}

test("valid active Agent assignment still works", { concurrency: false }, async () => {
  const inquiry = {
    _id: IDS.resource,
    property: { _id: IDS.property, title: "Home" },
    save: async () => inquiry,
    populate: async () => inquiry,
  };
  const restoreUser = patchMethod(User, "findById", () => ({
    select: async () => ({ _id: IDS.agent, role: "Agent", isActive: true }),
  }));
  const restoreInquiry = patchMethod(
    Inquiry,
    "findById",
    () => populatedQuery(inquiry)
  );
  const restoreNotification = patchMethod(
    notificationService,
    "createNotification",
    async (data) => data
  );

  try {
    const result = await inquiryService.assignAgent(
      IDS.resource,
      IDS.agent,
      IDS.admin
    );
    assert.equal(result.assignedAgent, IDS.agent);
    assert.equal(result.assignedBy, IDS.admin);
  } finally {
    restoreNotification();
    restoreInquiry();
    restoreUser();
  }
});

test("Deal schema and service reject duplicate Deals for the same Offer", { concurrency: false }, async () => {
  const offerUniqueIndex = Deal.schema.indexes().find(
    ([fields, options]) => fields.offer === 1 && options.unique === true
  );
  assert.ok(offerUniqueIndex);

  const offer = {
    _id: IDS.offer,
    status: "Accepted",
    property: { _id: IDS.property },
    fullName: "Buyer",
    email: "buyer@example.com",
    phone: "0123456789",
    currency: "GHS",
    assignedAgent: IDS.agent,
  };
  const restoreOffer = patchMethod(Offer, "findById", () => populatedQuery(offer));
  const restoreFindDeal = patchMethod(Deal, "findOne", async () => null);
  const restoreSequence = patchMethod(Sequence, "findOneAndUpdate", async () => ({
    value: 1,
  }));
  const restoreCreateDeal = patchMethod(Deal, "create", async () => {
    const error = new Error("duplicate offer");
    error.code = 11000;
    error.keyPattern = { offer: 1 };
    throw error;
  });

  try {
    await assert.rejects(
      dealService.createDeal(
        { offer: IDS.offer, salePrice: 500000, termsOfPayment: "Cash" },
        { _id: IDS.admin, role: "Admin" }
      ),
      (error) =>
        error.statusCode === 400 && error.code === "DEAL_ALREADY_EXISTS"
    );
  } finally {
    restoreCreateDeal();
    restoreSequence();
    restoreFindDeal();
    restoreOffer();
  }
});
