const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "production-hardening-secret";

const app = require("../app");
const User = require("../models/User");
const errorHandler = require("../middleware/errorMiddleware");
const safeErrorMessage = require("../utils/safeErrorMessage");

const USER_ID = "67b000000000000000000001";

const patchMethod = (target, method, replacement) => {
  const original = target[method];
  target[method] = replacement;
  return () => {
    target[method] = original;
  };
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

const withEnvironment = async (values, callback) => {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test("CORS allows configured production origins", { concurrency: false }, async () => {
  await withEnvironment(
    { NODE_ENV: "production", CORS_ORIGINS: "https://app.example.com, https://admin.example.com" },
    async () => {
      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/health`, {
          headers: { Origin: "https://app.example.com" },
        });
        assert.equal(response.status, 200);
        assert.equal(
          response.headers.get("access-control-allow-origin"),
          "https://app.example.com"
        );
      });
    }
  );
});

test("CORS rejects unauthorized production browser origins", { concurrency: false }, async () => {
  await withEnvironment(
    { NODE_ENV: "production", CORS_ORIGINS: "https://app.example.com" },
    async () => {
      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/health`, {
          headers: { Origin: "https://evil.example" },
        });
        const body = await response.json();
        assert.equal(response.status, 403);
        assert.equal(body.error.code, "CORS_ORIGIN_DENIED");
      });
    }
  );
});

test("requests without Origin remain usable", { concurrency: false }, async () => {
  await withEnvironment(
    { NODE_ENV: "production", CORS_ORIGINS: "https://app.example.com" },
    async () => {
      await withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/health`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("access-control-allow-origin"), null);
      });
    }
  );
});

test("production errors hide stack traces, paths, and internal messages", { concurrency: false }, async () => {
  await withEnvironment({ NODE_ENV: "production" }, async () => {
    let statusCode;
    let responseBody;
    const restoreConsole = patchMethod(console, "error", () => {});

    try {
      const error = new Error("Database failed at C:\\private\\server\\db.js");
      error.stack = "SECRET STACK TRACE";
      errorHandler(error, {}, {
        status: (status) => {
          statusCode = status;
          return {
            json: (body) => { responseBody = body; },
          };
        },
      }, () => {});

      assert.equal(statusCode, 500);
      assert.equal(responseBody.error.message, "Internal Server Error");
      const serialized = JSON.stringify(responseBody);
      assert.doesNotMatch(serialized, /SECRET|private|db\.js|stack/i);
    } finally {
      restoreConsole();
    }
  });
});

test("legacy controller error messages are sanitized in production", { concurrency: false }, async () => {
  await withEnvironment({ NODE_ENV: "production" }, async () => {
    const message = safeErrorMessage(
      new Error("MongoDB failed at C:\\private\\driver.js"),
      "Internal Server Error"
    );
    assert.equal(message, "Internal Server Error");
  });
});

test("invalid JWT is rejected without JWT internals", { concurrency: false }, async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/dashboard/stats`, {
      headers: { authorization: "Bearer invalid.jwt.value" },
    });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "UNAUTHORIZED");
    assert.doesNotMatch(JSON.stringify(body), /signature|jwt malformed|JsonWebTokenError/i);
  });
});

const authenticatedRequest = async (databaseUser, tokenRole = "Admin") => {
  const restoreUser = patchMethod(User, "findById", () => ({
    select: async () => databaseUser,
  }));
  const token = jwt.sign({ id: USER_ID, role: tokenRole }, process.env.JWT_SECRET);

  try {
    return await new Promise((resolve, reject) => {
      withServer(async (baseUrl) => {
        const response = await fetch(`${baseUrl}/dashboard/stats`, {
          headers: { authorization: `Bearer ${token}` },
        });
        resolve({ response, body: await response.json() });
      }).catch(reject);
    });
  } finally {
    restoreUser();
  }
};

test("JWT for nonexistent user is rejected", { concurrency: false }, async () => {
  const { response, body } = await authenticatedRequest(null);
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("JWT for inactive user is rejected", { concurrency: false }, async () => {
  const { response, body } = await authenticatedRequest({
    _id: USER_ID,
    role: "Admin",
    isActive: false,
  });
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("current database role overrides stale JWT role", { concurrency: false }, async () => {
  const { response, body } = await authenticatedRequest({
    _id: USER_ID,
    role: "Agent",
    isActive: true,
  }, "Admin");
  assert.equal(response.status, 403);
  assert.equal(body.error.code, "FORBIDDEN");
});

test("sensitive User fields are not serialized", { concurrency: false }, () => {
  const user = new User({
    name: "User",
    email: "user@example.com",
    password: "hashed-secret",
  });
  const serialized = JSON.parse(JSON.stringify(user));
  assert.equal(Object.hasOwn(serialized, "password"), false);
  assert.equal(Object.hasOwn(serialized, "passwordResetToken"), false);
});

test("oversized JSON payload receives a safe 413 error", { concurrency: false }, async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "a".repeat(2 * 1024 * 1024),
        password: "password",
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 413);
    assert.equal(body.error.code, "PAYLOAD_TOO_LARGE");
  });
});

test("malformed JSON receives a safe validation-style error", { concurrency: false }, async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"email":',
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.error.code, "MALFORMED_JSON");
  });
});

test("health endpoint remains minimal and contains no sensitive data", { concurrency: false }, async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, { success: true, status: "ok" });
    assert.doesNotMatch(
      JSON.stringify(body),
      /mongo|secret|environment|database|credential|process/i
    );
  });
});
