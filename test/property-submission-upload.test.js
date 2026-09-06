const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const express = require("express");

const Property = require("../models/Property");
const PropertySubmission = require("../models/PropertySubmission");
const propertySubmissionService = require("../services/propertySubmissionService");
const {
  minPropertySubmissionImages,
  maxPropertySubmissionImages,
  maxPropertySubmissionImageSizeMb,
  propertySubmissionUploadRoot,
} = require("../middleware/propertySubmissionUploadMiddleware");

const patchMethod = (target, method, replacement) => {
  const original = target[method]; target[method] = replacement;
  return () => { target[method] = original; };
};
const validFields = {
  ownerName: "Public Owner", phone: "+233200000000", email: "owner@example.com",
  title: "Family House", description: "Well maintained", askingPrice: "500000",
  listingType: "Sale", category: "Residential", propertyType: "House",
  region: "Greater Accra", city: "Accra", area: "East Legon",
  exactLocation: "12 Boundary Road, near the police station",
};
const appendFields = (form, fields = validFields) => Object.entries(fields).filter(([, value]) => value !== undefined).forEach(([key, value]) => form.append(key, value));
const imageBlob = (size = 16, type = "image/jpeg") => new Blob([Buffer.alloc(size, 1)], { type });
const directoryState = () => fs.existsSync(propertySubmissionUploadRoot)
  ? fs.readdirSync(propertySubmissionUploadRoot).sort()
  : [];

const withServer = async (createSubmission, work) => {
  const restore = patchMethod(propertySubmissionService, "createSubmission", createSubmission);
  const app = express();
  delete require.cache[require.resolve("../routes/propertySubmissionRoutes")];
  app.use("/property-submissions", require("../routes/propertySubmissionRoutes"));
  app.use(require("../middleware/errorMiddleware"));
  const server = await new Promise((resolve) => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  try { return await work(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); restore(); }
};

test("public multipart Property Submission accepts 3 through 10 ordered images", { concurrency: false }, async () => {
  for (const count of [minPropertySubmissionImages, maxPropertySubmissionImages]) {
    let captured;
    const before = directoryState();
    await withServer(async (body, images) => {
      captured = { body, images }; return { _id: "submission", submissionReference: "SR-PS-2026-A7K4P2", ...body, images };
    }, async (baseUrl) => {
      const form = new FormData(); appendFields(form);
      for (let index = 0; index < count; index += 1) form.append("images", imageBlob(), `photo-${index}.jpg`);
      const response = await fetch(`${baseUrl}/property-submissions`, { method: "POST", body: form });
      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), { submissionReference: "SR-PS-2026-A7K4P2" });
      assert.equal(captured.images.length, count);
      assert.ok(captured.images.every((url) => /\/uploads\/property-submissions\/[^/]+\.jpg$/.test(url)));
      assert.equal(captured.body.exactLocation, validFields.exactLocation);
      assert.equal(captured.body.status, undefined);
    });
    const created = directoryState().filter((name) => !before.includes(name));
    await Promise.all(created.map((name) => fs.promises.unlink(`${propertySubmissionUploadRoot}/${name}`)));
  }
});

test("public multipart Property Submission accepts an explicitly unlisted location", { concurrency: false }, async () => {
  let captured;
  const before = directoryState();
  await withServer(async (body, images) => {
    captured = { body, images }; return { _id: "submission", ...body, images };
  }, async (baseUrl) => {
    const form = new FormData();
    appendFields(form, {
      ...validFields,
      locationNotListed: "true",
      region: undefined,
      city: undefined,
      area: undefined,
      exactLocation: "Lakeside Estates, Lakeside.",
    });
    for (let index = 0; index < minPropertySubmissionImages; index += 1) form.append("images", imageBlob(), `photo-${index}.jpg`);
    const response = await fetch(`${baseUrl}/property-submissions`, { method: "POST", body: form });
    assert.equal(response.status, 201);
    assert.equal(captured.body.locationNotListed, true);
    assert.equal(captured.body.region, undefined);
    assert.equal(captured.body.city, undefined);
    assert.equal(captured.body.area, undefined);
  });
  const created = directoryState().filter((name) => !before.includes(name));
  await Promise.all(created.map((name) => fs.promises.unlink(`${propertySubmissionUploadRoot}/${name}`)));
});

test("exact browser multipart values populate req.body, sanitize types, and validate a submission", { concurrency: false }, async () => {
  let captured;
  const before = directoryState();
  await withServer(async (body, images) => {
    captured = { body, images };
    const submission = new PropertySubmission({ ...body, images });
    await submission.validate();
    return submission.toObject();
  }, async (baseUrl) => {
    const form = new FormData();
    appendFields(form, {
      ownerName: "Hetty Obenewaa Dwomoh-Kesse",
      phone: "0201234567",
      email: "hetty@email.com",
      title: "4 bedroom house",
      askingPrice: "200000",
      listingType: "Sale",
      category: "Residential",
      propertyType: "House",
      locationNotListed: "false",
      region: "Greater Accra",
      city: "Accra",
      area: "East Legon",
      exactLocation: "Lakeside Estates, Lakeside.",
      description: "Four-bedroom family house.",
    });
    for (let index = 0; index < 3; index += 1) form.append("images", imageBlob(), `hetty-${index}.jpg`);
    const response = await fetch(`${baseUrl}/property-submissions`, { method: "POST", body: form });
    assert.equal(response.status, 201);
    assert.equal(captured.body.ownerName, "Hetty Obenewaa Dwomoh-Kesse");
    assert.equal(captured.body.phone, "0201234567");
    assert.equal(captured.body.title, "4 bedroom house");
    assert.equal(captured.body.askingPrice, 200000);
    assert.equal(captured.body.locationNotListed, false);
    assert.equal(captured.images.length, 3);
  });
  const created = directoryState().filter((name) => !before.includes(name));
  await Promise.all(created.map((name) => fs.promises.unlink(`${propertySubmissionUploadRoot}/${name}`)));
});

test("public multipart Property Submission rejects 0, 1, and 2 images", { concurrency: false }, async () => {
  for (const count of [0, 1, 2]) {
    let called = false;
    const before = directoryState();
    await withServer(async () => { called = true; }, async (baseUrl) => {
      const form = new FormData(); appendFields(form);
      for (let index = 0; index < count; index += 1) form.append("images", imageBlob(), `photo-${index}.jpg`);
      const response = await fetch(`${baseUrl}/property-submissions`, { method: "POST", body: form });
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "PROPERTY_SUBMISSION_IMAGES_REQUIRED");
    });
    assert.equal(called, false);
    assert.deepEqual(directoryState(), before);
  }
});

test("invalid, oversized, and excess images are rejected and cleaned up", { concurrency: false }, async () => {
  for (const setup of [
    (form) => form.append("images", imageBlob(16, "text/plain"), "payload.txt"),
    (form) => form.append("images", imageBlob(maxPropertySubmissionImageSizeMb * 1024 * 1024 + 1), "large.jpg"),
    (form) => { for (let index = 0; index <= maxPropertySubmissionImages; index += 1) form.append("images", imageBlob(), `photo-${index}.jpg`); },
  ]) {
    const before = directoryState();
    await withServer(async () => assert.fail("service must not run"), async (baseUrl) => {
      const form = new FormData(); appendFields(form); setup(form);
      const response = await fetch(`${baseUrl}/property-submissions`, { method: "POST", body: form });
      assert.ok([400, 413].includes(response.status));
    });
    assert.deepEqual(directoryState(), before);
  }
});

test("validation and persistence failures remove only newly uploaded images", { concurrency: false }, async () => {
  for (const scenario of [
    { fields: { ...validFields, exactLocation: "   " }, create: async () => assert.fail("service must not run") },
    { fields: validFields, create: async () => { throw new Error("Database creation failed"); } },
  ]) {
    const before = directoryState();
    await withServer(scenario.create, async (baseUrl) => {
      const form = new FormData(); appendFields(form, scenario.fields);
      for (let index = 0; index < minPropertySubmissionImages; index += 1) form.append("images", imageBlob(), `photo-${index}.jpg`);
      const response = await fetch(`${baseUrl}/property-submissions`, { method: "POST", body: form });
      assert.equal(response.status, 400);
    });
    assert.deepEqual(directoryState(), before);
  }
});

test("upload flow never creates a published Property directly", { concurrency: false }, async () => {
  const restoreProperty = patchMethod(Property, "create", async () => assert.fail("Property must not be created"));
  const before = directoryState();
  try {
    await withServer(async (body, images) => ({ _id: "submission", ...body, images }), async (baseUrl) => {
      const form = new FormData(); appendFields(form);
      for (let index = 0; index < minPropertySubmissionImages; index += 1) form.append("images", imageBlob(), `photo-${index}.jpg`);
      assert.equal((await fetch(`${baseUrl}/property-submissions`, { method: "POST", body: form })).status, 201);
    });
  } finally {
    restoreProperty();
    const created = directoryState().filter((name) => !before.includes(name));
    await Promise.all(created.map((name) => fs.promises.unlink(`${propertySubmissionUploadRoot}/${name}`)));
  }
});
