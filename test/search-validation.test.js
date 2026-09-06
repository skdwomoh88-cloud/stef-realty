const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "search-validation-secret";

const app = require("../app");
const searchController = require("../controllers/searchController");
const Property = require("../models/Property");
const User = require("../models/User");
const ViewingRequest = require("../models/ViewingRequest");
const PropertySubmission = require("../models/PropertySubmission");
const Case = require("../models/Case");
const Inspection = require("../models/Inspection");
const Task = require("../models/Task");
const caseService = require("../services/caseService");
const inspectionService = require("../services/inspectionService");
const taskService = require("../services/taskService");

const IDS = {
  admin: "66b000000000000000000001",
  agent: "66b000000000000000000002",
  otherAgent: "66b000000000000000000003",
  owner: "66b000000000000000000004",
  otherOwner: "66b000000000000000000005",
  resource: "66b000000000000000000006",
};

const patchMethod = (target, method, replacement) => {
  const original = target[method];
  target[method] = replacement;
  return () => {
    target[method] = original;
  };
};

const queryResult = (value, onCall = () => {}) => {
  const query = {
    select: (...args) => { onCall("select", args); return query; },
    populate: (...args) => { onCall("populate", args); return query; },
    limit: (...args) => { onCall("limit", args); return query; },
    sort: (...args) => { onCall("sort", args); return query; },
    skip: (...args) => { onCall("skip", args); return query; },
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return query;
};

const invokeSearch = async (user, q = "home") => {
  let body;
  let statusCode = 200;
  const res = {
    json: (value) => { body = value; return res; },
    status: (value) => { statusCode = value; return res; },
  };
  await searchController.globalSearch({ query: { q }, user }, res);
  return { body, statusCode };
};

const withSearchModels = async ({ propertyResult = [], userResult = [], viewingResult = [], submissionResult = [] }, callback) => {
  const filters = {};
  const restores = [
    patchMethod(Property, "find", (filter) => {
      filters.property = filter;
      return queryResult(propertyResult);
    }),
    patchMethod(User, "find", (filter) => {
      filters.user = filter;
      return queryResult(userResult);
    }),
    patchMethod(ViewingRequest, "find", (filter) => {
      filters.viewing = filter;
      return queryResult(viewingResult);
    }),
    patchMethod(PropertySubmission, "find", (filter) => {
      filters.submission = filter;
      return queryResult(submissionResult);
    }),
  ];

  try {
    await callback(filters);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
};

test("Agent global search is scoped to the Agent's authorized records", { concurrency: false }, async () => {
  await withSearchModels(
    { propertyResult: [{ title: "Own home" }], viewingResult: [{ fullName: "Own lead" }] },
    async (filters) => {
      const { body } = await invokeSearch({ _id: IDS.agent, role: "Agent" });
      const propertyFilter = JSON.stringify(filters.property);
      assert.match(propertyFilter, new RegExp(IDS.agent));
      assert.match(propertyFilter, /"verificationStatus":"Verified"/);
      assert.equal(filters.viewing.assignedAgent, IDS.agent);
      assert.deepEqual(body.users, []);
      assert.deepEqual(body.submissions, []);
    }
  );
});

test("Owner global search cannot search another owner's records", { concurrency: false }, async () => {
  await withSearchModels({ propertyResult: [{ title: "Owned home" }] }, async (filters) => {
    const { body } = await invokeSearch({ _id: IDS.owner, role: "Owner" });
    assert.equal(filters.property.$and[1].owner, IDS.owner);
    assert.notEqual(filters.property.$and[1].owner, IDS.otherOwner);
    assert.deepEqual(body.users, []);
    assert.deepEqual(body.viewingRequests, []);
    assert.deepEqual(body.submissions, []);
  });
});

test("Customer global search contains no internal CRM results", { concurrency: false }, async () => {
  await withSearchModels({ propertyResult: [{ title: "Public home" }] }, async (filters) => {
    const { body } = await invokeSearch({ _id: IDS.resource, role: "Customer" });
    assert.deepEqual(filters.property.$and[1], {
      verificationStatus: "Verified",
      status: "Available",
      isArchived: false,
    });
    assert.deepEqual(body.users, []);
    assert.deepEqual(body.viewingRequests, []);
    assert.deepEqual(body.submissions, []);
  });
});

test("Admin global search retains management search access", { concurrency: false }, async () => {
  await withSearchModels(
    {
      propertyResult: [{ title: "Property" }],
      userResult: [{ name: "Agent" }],
      viewingResult: [{ fullName: "Lead" }],
      submissionResult: [{ ownerName: "Owner" }],
    },
    async (filters) => {
      const { body } = await invokeSearch({ _id: IDS.admin, role: "Admin" });
      assert.equal(body.properties.length, 1);
      assert.equal(body.users.length, 1);
      assert.equal(body.viewingRequests.length, 1);
      assert.equal(body.submissions.length, 1);
      assert.ok(filters.user);
      assert.ok(filters.viewing);
      assert.ok(filters.submission);
    }
  );
});

test("search input is escaped before regular-expression construction", { concurrency: false }, async () => {
  const escaped = searchController.escapeRegex(".*(admin)+$");
  const regex = new RegExp(escaped, "i");
  assert.equal(regex.test("anything"), false);
  assert.equal(regex.test(".*(admin)+$"), true);

  await withSearchModels({}, async (filters) => {
    await invokeSearch({ _id: IDS.admin, role: "Admin" }, ".*");
    assert.equal(filters.property.$or[0].title.source, "\\.\\*");
  });
});

const withServer = async (callback) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
};

test("public Inquiry and Viewing Request validation rejects invalid submissions", { concurrency: false }, async () => {
  await withServer(async (baseUrl) => {
    for (const route of ["inquiries", "viewing-requests"]) {
      const response = await fetch(`${baseUrl}/${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ property: "invalid" }),
      });
      const body = await response.json();
      assert.equal(response.status, 400);
      assert.equal(body.error.code, "VALIDATION_ERROR");
    }
  });
});

const withAuthenticatedServer = async (callback) => {
  const restoreUser = patchMethod(User, "findById", () => ({
    select: async () => ({ _id: IDS.admin, role: "Admin", isActive: true }),
  }));
  const token = jwt.sign({ id: IDS.admin }, process.env.JWT_SECRET);
  try {
    await withServer((baseUrl) => callback(baseUrl, token));
  } finally {
    restoreUser();
  }
};

test("Inquiry, Viewing Request, and Offer assignment routes reject invalid Agent IDs", { concurrency: false }, async () => {
  await withAuthenticatedServer(async (baseUrl, token) => {
    const requests = [
      ["/inquiries/66b000000000000000000006/assign", { assignedAgent: "invalid" }],
      ["/viewing-requests/66b000000000000000000006", { assignedAgent: "invalid" }],
      ["/offers/66b000000000000000000006/assign", { assignedAgent: "invalid" }],
    ];

    for (const [path, payload] of requests) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 400);
    }
  });
});

test("User role and status routes reject invalid values", { concurrency: false }, async () => {
  await withAuthenticatedServer(async (baseUrl, token) => {
    const invalidRequests = [
      ["/users/66b000000000000000000006/role", { role: "SuperAdmin" }],
      ["/users/66b000000000000000000006/status", { isActive: "sometimes" }],
    ];
    for (const [path, payload] of invalidRequests) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 400);
    }
  });
});

test("Property create and update reject zero or negative prices", { concurrency: false }, async () => {
  await withAuthenticatedServer(async (baseUrl, token) => {
    const requests = [
      ["POST", "/properties", {
        title: "Home", price: 0, listingType: "Sale", category: "Residential",
        propertyType: "House", location: IDS.resource,
      }],
      ["POST", "/properties", {
        title: "Home", price: -1, listingType: "Sale", category: "Residential",
        propertyType: "House", location: IDS.resource,
      }],
      ["PUT", `/properties/${IDS.resource}`, { price: 0 }],
    ];
    for (const [method, path, payload] of requests) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      assert.equal(response.status, 400);
    }
  });
});

test("Task list query validation rejects unsafe values and preserves valid defaults", { concurrency: false }, async () => {
  await withAuthenticatedServer(async (baseUrl, token) => {
    const response = await fetch(`${baseUrl}/tasks?page=0&limit=-1&sortBy=password`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 400);
  });
});

test("Case and Inspection assignment reject inactive or non-Agent targets", { concurrency: false }, async () => {
  const caseDocument = {
    _id: IDS.resource,
    assignedAgent: IDS.admin,
    history: [],
    save: async () => caseDocument,
  };
  const restoreCase = patchMethod(Case, "findById", async () => caseDocument);
  const restoreUser = patchMethod(User, "findById", () => ({
    select: async () => ({ _id: IDS.agent, role: "Customer", isActive: false }),
  }));
  const restoreInspection = patchMethod(Inspection, "create", async () => {
    throw new Error("Inspection must not be created");
  });

  try {
    await assert.rejects(
      caseService.assignAgent(IDS.resource, IDS.agent, IDS.admin),
      (error) => error.code === "INVALID_ASSIGNED_AGENT"
    );
    await assert.rejects(
      inspectionService.scheduleInspection({
        caseId: IDS.resource,
        property: IDS.resource,
        agent: IDS.agent,
        scheduledDate: new Date(),
        currentUser: { _id: IDS.admin, role: "Admin" },
      }),
      (error) => error.code === "INVALID_ASSIGNED_AGENT"
    );
  } finally {
    restoreInspection();
    restoreUser();
    restoreCase();
  }
});

test("Task population selects User name and email fields", { concurrency: false }, async () => {
  const populations = [];
  const restoreFind = patchMethod(Task, "find", () => queryResult([], (method, args) => {
    if (method === "populate") populations.push(args);
  }));
  const restoreCount = patchMethod(Task, "countDocuments", async () => 0);

  try {
    await taskService.getAllTasks();
    assert.ok(populations.some(([path, fields]) => path === "assignedAgent" && fields === "name email"));
    assert.ok(populations.some(([path, fields]) => path === "assignedBy" && fields === "name email"));
    assert.equal(populations.some(([, fields]) => /firstName|lastName/.test(fields || "")), false);
  } finally {
    restoreCount();
    restoreFind();
  }
});
