const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");

process.env.JWT_SECRET = process.env.JWT_SECRET || "security-middleware-secret";

const app = require("../app");
const User = require("../models/User");
const {
  loginRateLimiter,
  registerRateLimiter,
} = require("../middleware/authRateLimit");

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

const resetLimiters = () => {
  loginRateLimiter.resetKey("127.0.0.1");
  registerRateLimiter.resetKey("127.0.0.1");
};

test("Helmet applies API security headers without a restrictive CSP", { concurrency: false }, async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.ok(response.headers.get("x-frame-options"));
    assert.ok(response.headers.get("referrer-policy"));
    assert.equal(response.headers.get("content-security-policy"), null);
    assert.equal(
      response.headers.get("cross-origin-resource-policy"),
      "cross-origin"
    );
  });
});

test("Helmet preserves configured CORS behavior", { concurrency: false }, async () => {
  const previousOrigins = process.env.CORS_ORIGINS;
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.CORS_ORIGINS = "https://app.example.com";

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`, {
        headers: { origin: "https://app.example.com" },
      });
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get("access-control-allow-origin"),
        "https://app.example.com"
      );
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    });
  } finally {
    if (previousOrigins === undefined) delete process.env.CORS_ORIGINS;
    else process.env.CORS_ORIGINS = previousOrigins;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  }
});

test("login succeeds normally below its rate limit", { concurrency: false }, async () => {
  resetLimiters();
  const password = "correct-password";
  const passwordHash = await bcrypt.hash(password, 4);
  const restoreUser = patchMethod(User, "findOne", () => ({
    select: async () => ({
      _id: "68b000000000000000000001",
      name: "Admin",
      email: "admin@example.com",
      password: passwordHash,
      role: "Admin",
      isActive: true,
    }),
  }));

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password }),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.success, true);
      assert.ok(body.data.token);
      assert.ok(
        response.headers.get("ratelimit") ||
        response.headers.get("ratelimit-limit")
      );
    });
  } finally {
    restoreUser();
  }
});

test("repeated login attempts receive safe JSON and standard 429 headers", { concurrency: false }, async () => {
  resetLimiters();

  await withServer(async (baseUrl) => {
    let response;
    for (let attempt = 0; attempt <= 10; attempt += 1) {
      response = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "invalid", password: "wrong" }),
      });
    }

    const body = await response.json();
    assert.equal(response.status, 429);
    assert.deepEqual(body, {
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many login attempts. Please try again later.",
      },
    });
    assert.ok(response.headers.get("ratelimit"));
    assert.ok(response.headers.get("ratelimit-policy"));
    assert.ok(response.headers.get("retry-after"));
    assert.doesNotMatch(JSON.stringify(body), /email|account exists|user/i);
  });
});

test("registration has an independent rate limit", { concurrency: false }, async () => {
  resetLimiters();

  await withServer(async (baseUrl) => {
    let response;
    for (let attempt = 0; attempt <= 5; attempt += 1) {
      response = await fetch(`${baseUrl}/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "A", email: "invalid", password: "x" }),
      });
    }

    const body = await response.json();
    assert.equal(response.status, 429);
    assert.equal(body.error.code, "RATE_LIMIT_EXCEEDED");
    assert.match(body.error.message, /registration attempts/i);
    assert.ok(response.headers.get("ratelimit"));

    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "invalid", password: "wrong" }),
    });
    assert.notEqual(loginResponse.status, 429);
  });
});

test("Helmet does not block direct static upload serving", { concurrency: false }, async () => {
  const uploadsDirectory = path.join(__dirname, "..", "uploads");
  const fixturePath = path.join(uploadsDirectory, "helmet-static-test.txt");
  const directoryAlreadyExisted = fs.existsSync(uploadsDirectory);

  fs.mkdirSync(uploadsDirectory, { recursive: true });
  fs.writeFileSync(fixturePath, "static upload works", "utf8");

  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/uploads/helmet-static-test.txt`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "static upload works");
      assert.equal(
        response.headers.get("cross-origin-resource-policy"),
        "cross-origin"
      );
    });
  } finally {
    fs.rmSync(fixturePath);
    if (!directoryAlreadyExisted) {
      fs.rmdirSync(uploadsDirectory);
    }
  }
});

test("health endpoint remains available with Helmet enabled", { concurrency: false }, async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, status: "ok" });
  });
});
