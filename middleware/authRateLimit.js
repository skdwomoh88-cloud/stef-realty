const { rateLimit } = require("express-rate-limit");

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const rateLimitResponse = (message) => (req, res) => {
  res.status(429).json({
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message,
    },
  });
};

const commonOptions = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
};

const loginRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: positiveInteger(
    process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS,
    15 * 60 * 1000
  ),
  limit: positiveInteger(
    process.env.AUTH_LOGIN_RATE_LIMIT_MAX,
    10
  ),
  handler: rateLimitResponse(
    "Too many login attempts. Please try again later."
  ),
});

const registerRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: positiveInteger(
    process.env.AUTH_REGISTER_RATE_LIMIT_WINDOW_MS,
    60 * 60 * 1000
  ),
  limit: positiveInteger(
    process.env.AUTH_REGISTER_RATE_LIMIT_MAX,
    5
  ),
  handler: rateLimitResponse(
    "Too many registration attempts. Please try again later."
  ),
});

const forgotPasswordRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: positiveInteger(process.env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS, 60 * 60 * 1000),
  limit: positiveInteger(process.env.AUTH_FORGOT_PASSWORD_RATE_LIMIT_MAX, 5),
  handler: rateLimitResponse("Too many password reset requests. Please try again later."),
});

const resetPasswordRateLimiter = rateLimit({
  ...commonOptions,
  windowMs: positiveInteger(process.env.AUTH_RESET_PASSWORD_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  limit: positiveInteger(process.env.AUTH_RESET_PASSWORD_RATE_LIMIT_MAX, 10),
  handler: rateLimitResponse("Too many password reset attempts. Please try again later."),
});

module.exports = {
  loginRateLimiter,
  registerRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
};
