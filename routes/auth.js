const express = require("express");
const router = express.Router();

const {
  registerUser,
  loginUser,
  getCurrentUser,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { body } = require("express-validator");
const validate = require("../middleware/validationMiddleware");
const {
  loginRateLimiter,
  registerRateLimiter,
  forgotPasswordRateLimiter,
  resetPasswordRateLimiter,
} = require("../middleware/authRateLimit");
const { normalizeEmailInput, normalizeRegistrationEmail } = require("../utils/emailIdentity");

router.post(
  "/register",
  registerRateLimiter,
  [
    body("name").trim().isLength({ min: 2, max: 100 }),
    body("email").trim().isEmail().customSanitizer(normalizeRegistrationEmail),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
  ],
  validate,
  registerUser
);

router.post(
  "/login",
  loginRateLimiter,
  [body("email").trim().isEmail().customSanitizer(normalizeEmailInput), body("password").notEmpty()],
  validate,
  loginUser
);

router.post(
  "/forgot-password",
  forgotPasswordRateLimiter,
  [
    body("email").trim().isEmail().withMessage("Enter a valid email address").customSanitizer(normalizeEmailInput),
    body().custom((value, { req }) => {
      if (Object.keys(req.body || {}).some((key) => key !== "email")) throw new Error("Unexpected request field");
      return true;
    }),
  ],
  validate,
  forgotPassword
);

router.post(
  "/reset-password",
  resetPasswordRateLimiter,
  [
    body("token").isString().matches(/^[a-f0-9]{64}$/i).withMessage("This password reset link is invalid or has expired."),
    body("newPassword").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
    body().custom((value, { req }) => {
      if (Object.keys(req.body || {}).some((key) => !["token", "newPassword"].includes(key))) throw new Error("Unexpected request field");
      return true;
    }),
  ],
  validate,
  resetPassword
);

router.get("/me", protect, getCurrentUser);

module.exports = router;
