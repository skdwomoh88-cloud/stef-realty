const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const express = require("express");

const Document = require("../models/Document");
const Property = require("../models/Property");
const Case = require("../models/Case");
const Sequence = require("../models/Sequence");
const documentService = require("../services/documentService");
const { RELATED_RESOURCES } = require("../utils/documentAuthorization");
const documentController = require("../controllers/documentController");
const { uploadDocument, maxFileSizeMb } = require("../middleware/documentUploadMiddleware");
const { documentRoot, resolveDocumentPath, removeStoredDocument } = require("../utils/documentStorage");
const app = require("../app");

const IDS = {
  admin: "65c000000000000000000001",
  agent: "65c000000000000000000002",
  otherAgent: "65c000000000000000000003",
  property: "65c000000000000000000004",
  document: "65c000000000000000000005",
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

const listen = (expressApp) => new Promise((resolve) => {
  const server = expressApp.listen(0, "127.0.0.1", () => resolve(server));
});
const close = (server) => new Promise((resolve) => server.close(resolve));

const sendUpload = async ({ name, type, bytes }) => {
  const uploadApp = express();
  uploadApp.post("/", uploadDocument, (req, res) => res.json({
    filename: req.file.filename,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  }));
  uploadApp.use((error, req, res, next) => res.status(error.statusCode || 500).json({
    code: error.code,
  }));
  const server = await listen(uploadApp);
  try {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type }), name);
    return await fetch(`http://127.0.0.1:${server.address().port}/`, {
      method: "POST",
      body: form,
    });
  } finally {
    await close(server);
  }
};

test("Document schema centralizes categories, fields, and justified indexes", () => {
  const paths = Document.schema.paths;
  for (const field of [
    "documentNumber", "title", "description", "category", "originalFileName",
    "storedFileName", "mimeType", "fileSize", "uploadedBy", "relatedProperty",
    "relatedInquiry", "relatedViewingRequest", "relatedOffer", "relatedDeal",
    "relatedTask", "relatedCase", "relatedInspection", "relatedListingDraft",
    "isArchived", "createdAt", "updatedAt",
  ]) assert.ok(paths[field], field);
  assert.equal(paths.storedFileName.options.select, false);
  assert.equal(paths.isArchived.options.default, false);
  assert.ok(Document.schema.indexes().some(([keys, options]) => keys.documentNumber === 1 && options.unique));
});

for (const file of [
  { name: "agreement.pdf", type: "application/pdf", bytes: "%PDF-1.4" },
  { name: "photo.jpg", type: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff]) },
  { name: "scan.png", type: "image/png", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
]) {
  test(`private uploader accepts ${file.name}`, async () => {
    const response = await sendUpload(file);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.mimetype, file.type);
    assert.equal(path.dirname(resolveDocumentPath(data.filename)), documentRoot);
    assert.notEqual(data.filename, file.name);
    await removeStoredDocument(data.filename);
  });
}

test("private uploader rejects invalid extension and invalid MIME", async () => {
  const badExtension = await sendUpload({ name: "payload.html", type: "text/html", bytes: "<script>" });
  assert.equal(badExtension.status, 400);
  assert.equal((await badExtension.json()).code, "INVALID_DOCUMENT_TYPE");

  const badMime = await sendUpload({ name: "fake.pdf", type: "text/html", bytes: "%PDF" });
  assert.equal(badMime.status, 400);
  assert.equal((await badMime.json()).code, "INVALID_DOCUMENT_TYPE");
});

test("private uploader rejects an oversized document without waiting", async () => {
  const bytes = new Uint8Array(maxFileSizeMb * 1024 * 1024 + 1);
  const response = await sendUpload({ name: "large.pdf", type: "application/pdf", bytes });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, "DOCUMENT_TOO_LARGE");
});

test("path traversal cannot control the generated storage path", async () => {
  const response = await sendUpload({ name: "../secret.pdf", type: "application/pdf", bytes: "%PDF" });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(path.dirname(resolveDocumentPath(data.filename)), documentRoot);
  assert.throws(() => resolveDocumentPath("../secret.pdf"), /Invalid document storage key/);
  await removeStoredDocument(data.filename);
});

test("Admin upload generates DOC reference and cannot spoof uploadedBy", { concurrency: false }, async () => {
  let created;
  const restoreSequence = patchMethod(Sequence, "findOneAndUpdate", async () => ({ value: 1 }));
  const restoreCreate = patchMethod(Document, "create", async (data) => { created = data; return { _id: IDS.document }; });
  const restoreFind = patchMethod(Document, "findById", () => queryFor({ _id: IDS.document }));
  try {
    await documentService.createDocument(
      { title: "Agreement", category: "Sale Agreement", uploadedBy: IDS.otherAgent },
      { originalname: "agreement.pdf", filename: "generated.pdf", mimetype: "application/pdf", size: 100 },
      { _id: IDS.admin, role: "Admin" }
    );
    assert.match(created.documentNumber, /^DOC-\d{4}-000001$/);
    assert.equal(created.uploadedBy, IDS.admin);
    assert.equal(created.storedFileName, "generated.pdf");
  } finally { restoreFind(); restoreCreate(); restoreSequence(); }
});

test("Agent can upload for an authorized Property", { concurrency: false }, async () => {
  const restoreProperty = patchMethod(Property, "findById", async () => ({ _id: IDS.property, assignedAgent: IDS.agent }));
  const restoreSequence = patchMethod(Sequence, "findOneAndUpdate", async () => ({ value: 2 }));
  const restoreCreate = patchMethod(Document, "create", async (data) => ({ _id: IDS.document, ...data }));
  const restoreFind = patchMethod(Document, "findById", () => queryFor({ _id: IDS.document }));
  try {
    await assert.doesNotReject(() => documentService.createDocument(
      { title: "Plan", category: "Site Plan", relatedProperty: IDS.property },
      { originalname: "plan.pdf", filename: "generated.pdf", mimetype: "application/pdf", size: 50 },
      { _id: IDS.agent, role: "Agent" }
    ));
  } finally { restoreFind(); restoreCreate(); restoreSequence(); restoreProperty(); }
});

test("Agent cannot upload for another Agent's restricted record", { concurrency: false }, async () => {
  const restoreProperty = patchMethod(Property, "findById", async () => ({ _id: IDS.property, assignedAgent: IDS.otherAgent }));
  try {
    await assert.rejects(
      documentService.createDocument(
        { title: "Plan", category: "Site Plan", relatedProperty: IDS.property },
        { originalname: "plan.pdf", filename: "generated.pdf", mimetype: "application/pdf", size: 50 },
        { _id: IDS.agent, role: "Agent" }
      ),
      (error) => error.code === "DOCUMENT_FORBIDDEN" && error.statusCode === 403
    );
  } finally { restoreProperty(); }
});

test("invalid and missing related IDs are rejected", { concurrency: false }, async () => {
  const validator = require("../validators/documentValidator").documentCreateValidator;
  const validationApp = express();
  validationApp.use(express.json());
  validationApp.post("/", validator, require("../middleware/validationMiddleware"), (req, res) => res.json({ success: true }));
  const server = await listen(validationApp);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Doc", category: "Other", relatedProperty: "bad-id" }),
    });
    assert.equal(response.status, 400);
  } finally { await close(server); }

  const restoreProperty = patchMethod(Property, "findById", async () => null);
  try {
    await assert.rejects(
      documentService.createDocument(
        { title: "Doc", category: "Other", relatedProperty: IDS.property },
        { originalname: "doc.pdf", filename: "generated.pdf", mimetype: "application/pdf", size: 1 },
        { _id: IDS.admin, role: "Admin" }
      ),
      (error) => error.code === "RELATED_RECORD_NOT_FOUND"
    );
  } finally { restoreProperty(); }
});

test("Agent cannot retrieve or download another Agent's document while Admin can", { concurrency: false }, async () => {
  const document = {
    _id: IDS.document,
    relatedProperty: IDS.property,
    storedFileName: "missing.pdf",
    originalFileName: "agreement.pdf",
    mimeType: "application/pdf",
  };
  const restoreDocument = patchMethod(Document, "findById", () => queryFor(document));
  const restoreProperty = patchMethod(Property, "findById", async () => ({ assignedAgent: IDS.otherAgent }));
  try {
    await assert.rejects(
      documentService.getDocumentById(IDS.document, { _id: IDS.agent, role: "Agent" }),
      (error) => error.code === "DOCUMENT_FORBIDDEN"
    );
    await assert.rejects(
      documentService.getDocumentFile(IDS.document, { _id: IDS.agent, role: "Agent" }),
      (error) => error.code === "DOCUMENT_FORBIDDEN"
    );
    await assert.doesNotReject(() =>
      documentService.getDocumentById(IDS.document, { _id: IDS.admin, role: "Admin" })
    );
  } finally { restoreProperty(); restoreDocument(); }
});

test("authenticated download resolves a private file and missing files use a controlled error", { concurrency: false }, async () => {
  const storedFileName = `test-${Date.now()}.pdf`;
  const absolutePath = resolveDocumentPath(storedFileName);
  await fs.promises.writeFile(absolutePath, "%PDF");
  const document = { storedFileName, originalFileName: "agreement.pdf", mimeType: "application/pdf" };
  const restoreDocument = patchMethod(Document, "findById", () => queryFor(document));
  try {
    const file = await documentService.getDocumentFile(IDS.document, { _id: IDS.admin, role: "Admin" });
    assert.equal(file.absolutePath, absolutePath);
    await removeStoredDocument(storedFileName);
    await assert.rejects(
      documentService.getDocumentFile(IDS.document, { _id: IDS.admin, role: "Admin" }),
      (error) => error.code === "DOCUMENT_FILE_NOT_FOUND" && !error.message.includes(documentRoot)
    );
  } finally { restoreDocument(); await removeStoredDocument(storedFileName); }
});

test("metadata update protects storage and ownership fields", { concurrency: false }, async () => {
  const document = {
    title: "Old", storedFileName: "private.pdf", uploadedBy: IDS.admin,
    save: async () => document,
  };
  const restoreDocument = patchMethod(Document, "findById", () => queryFor(document));
  try {
    const result = await documentService.updateDocument(
      IDS.document,
      { title: "New", storedFileName: "attacker.pdf", uploadedBy: IDS.otherAgent, mimeType: "text/html", fileSize: 1 },
      { _id: IDS.admin, role: "Admin" }
    );
    assert.equal(result.title, "New");
    assert.equal(document.uploadedBy, IDS.admin);
    assert.equal(document.mimeType, undefined);
  } finally { restoreDocument(); }
});

test("archive requires relationship authorization and performs a soft delete", { concurrency: false }, async () => {
  const document = {
    relatedProperty: IDS.property, isArchived: false, storedFileName: "private.pdf",
    save: async () => document,
  };
  const restoreDocument = patchMethod(Document, "findById", () => queryFor(document));
  const restoreProperty = patchMethod(Property, "findById", async () => ({ assignedAgent: IDS.agent }));
  try {
    await documentService.archiveDocument(IDS.document, { _id: IDS.agent, role: "Agent" });
    assert.equal(document.isArchived, true);
  } finally { restoreProperty(); restoreDocument(); }
});

test("failed creation cleans up the newly uploaded private file", { concurrency: false }, async () => {
  const storedFileName = `cleanup-${Date.now()}.pdf`;
  const absolutePath = resolveDocumentPath(storedFileName);
  await fs.promises.writeFile(absolutePath, "%PDF");
  const restoreCreate = patchMethod(documentService, "createDocument", async () => {
    throw Object.assign(new Error("failed"), { statusCode: 400 });
  });
  try {
    await new Promise((resolve) => {
      documentController.createDocument(
        { body: {}, file: { filename: storedFileName }, user: { _id: IDS.admin, role: "Admin" } },
        {},
        () => resolve()
      );
    });
    assert.equal(fs.existsSync(absolutePath), false);
  } finally { restoreCreate(); await removeStoredDocument(storedFileName); }
});

test("private documents are not exposed through the public /uploads route", async () => {
  const storedFileName = `private-${Date.now()}.pdf`;
  await fs.promises.writeFile(resolveDocumentPath(storedFileName), "%PDF");
  const server = await listen(app);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/uploads/${storedFileName}`);
    assert.equal(response.status, 404);
  } finally { await close(server); await removeStoredDocument(storedFileName); }
});

test("document routes include paginated listing, my scope, archive, and protected file download", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "routes", "documentRoutes.js"), "utf8");
  assert.match(source, /router\.get\("\/my"/);
  assert.match(source, /router\.get\("\/:id\/file"/);
  assert.match(source, /router\.delete\("\/:id"/);
  assert.match(source, /documentListValidator/);
  assert.match(source, /router\.use\(protect, authorize\(ROLES\.ADMIN, ROLES\.AGENT\)\)/);
});

test("document listing applies pagination and supported filters", { concurrency: false }, async () => {
  let capturedFilter;
  const restoreFind = patchMethod(Document, "find", (filter) => {
    capturedFilter = filter;
    return queryFor([{ _id: IDS.document }]);
  });
  const restoreCount = patchMethod(Document, "countDocuments", async () => 41);
  try {
    const result = await documentService.listDocuments(
      {
        page: 2,
        limit: 20,
        category: "Legal Document",
        relatedProperty: IDS.property,
        sortBy: "title",
        sortOrder: "asc",
      },
      { _id: IDS.admin, role: "Admin" }
    );
    assert.equal(capturedFilter.category, "Legal Document");
    assert.equal(capturedFilter.relatedProperty, IDS.property);
    assert.deepEqual(result.pagination, {
      total: 41,
      page: 2,
      limit: 20,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
  } finally { restoreCount(); restoreFind(); }
});

test("Agent listing is relationship-scoped and excludes archived documents by default", { concurrency: false }, async () => {
  const models = new Set(Object.values(RELATED_RESOURCES).map((config) => config.model));
  models.add(Case);
  const restores = [...models].map((model) => patchMethod(model, "distinct", async () => [IDS.property]));
  let capturedFilter;
  const restoreFind = patchMethod(Document, "find", (filter) => {
    capturedFilter = filter;
    return queryFor([]);
  });
  const restoreCount = patchMethod(Document, "countDocuments", async () => 0);
  try {
    await documentService.listDocuments({}, { _id: IDS.agent, role: "Agent" });
    assert.equal(capturedFilter.isArchived, false);
    assert.ok(Array.isArray(capturedFilter.$and));

    await documentService.listDocuments(
      { isArchived: true },
      { _id: IDS.agent, role: "Agent" }
    );
    assert.equal(capturedFilter.isArchived, true);
  } finally {
    restoreCount();
    restoreFind();
    restores.reverse().forEach((restore) => restore());
  }
});

test("/documents/my derives ownership from the authenticated user", { concurrency: false }, async () => {
  let serviceArguments;
  const restoreList = patchMethod(documentService, "listDocuments", async (...args) => {
    serviceArguments = args;
    return { documents: [], pagination: { total: 0 } };
  });
  try {
    await new Promise((resolve, reject) => {
      documentController.getMyDocuments(
        { query: { uploadedBy: IDS.otherAgent }, user: { _id: IDS.agent, role: "Agent" } },
        { status: () => ({ json: () => resolve() }) },
        reject
      );
    });
    assert.equal(serviceArguments[1]._id, IDS.agent);
    assert.equal(serviceArguments[2], true);
  } finally { restoreList(); }
});
