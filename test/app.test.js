const test = require("node:test");
const assert = require("node:assert/strict");

const app = require("../app");

const withServer = async (callback) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address();
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
};

test("GET /health reports API readiness", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { success: true, status: "ok" });
    assert.equal(response.headers.get("x-powered-by"), null);
  });
});

test("unknown routes return the standard error envelope", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/does-not-exist`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "NOT_FOUND");
  });
});

test("protected routes reject requests without a token", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/dashboard/stats`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "UNAUTHORIZED");
  });
});

test("registration rejects malformed input before database access", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "A", email: "bad", password: "short" }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.errors.length >= 3);
  });
});
