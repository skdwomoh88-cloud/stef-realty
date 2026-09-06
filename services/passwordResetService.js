const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../models/User");
const PasswordResetToken = require("../models/PasswordResetToken");
const AppError = require("../utils/AppError");
const auditService = require("./auditService");
const emailService = require("./emailService");
const { findUserForLogin } = require("../utils/emailIdentity");

const NEUTRAL_MESSAGE = "If an account exists for this email, we’ll send password reset instructions.";
const TOKEN_BYTES = 32;
const DEFAULT_EXPIRY_MINUTES = 30;
const hashResetToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const expiryMinutes = () => {
  const configured = Number(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MINUTES);
  return Number.isInteger(configured) && configured > 0 && configured <= 120 ? configured : DEFAULT_EXPIRY_MINUTES;
};
const frontendResetUrl = (rawToken) => {
  let origin;
  try {
    const configured = new URL(String(process.env.FRONTEND_URL || ""));
    const localDevelopment = configured.protocol === "http:" && ["localhost", "127.0.0.1"].includes(configured.hostname) && process.env.NODE_ENV !== "production";
    if (configured.username || configured.password || configured.search || configured.hash || (configured.protocol !== "https:" && !localDevelopment)) throw new Error("unsafe frontend URL");
    origin = configured.origin + configured.pathname.replace(/\/$/, "");
  } catch {
    throw new AppError("Transactional password-reset email is not configured.", 503, "TRANSACTIONAL_EMAIL_NOT_CONFIGURED");
  }
  return `${origin}/reset-password?token=${encodeURIComponent(rawToken)}`;
};

const logRequestFailure = ({ error, request, cleanupFailed = false }) => {
  if (process.env.NODE_ENV === "test") return;
  const safeCode = error?.code || "PASSWORD_RESET_REQUEST_FAILED";
  const safeStatus = Number.isInteger(error?.providerStatus) ? ` providerStatus=${error.providerStatus}` : "";
  const cleanup = cleanupFailed ? " cleanup=failed" : "";
  console.error(`[PASSWORD_RESET_DELIVERY] code=${safeCode}${safeStatus}${cleanup} correlationId=${request?.correlationId || "unavailable"}`);
};

const requestPasswordReset = async ({ email, request }) => {
  const user = await findUserForLogin(email);
  if (!user) return { message: NEUTRAL_MESSAGE, deliveryConfigured: emailService.isPasswordResetEmailConfigured() };

  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const expiresAt = new Date(Date.now() + expiryMinutes() * 60 * 1000);
  const tokenHash = hashResetToken(rawToken);
  try {
    await PasswordResetToken.findOneAndUpdate(
      { user: user._id },
      { $set: { tokenHash, expiresAt }, $setOnInsert: { user: user._id } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    logRequestFailure({ error, request });
    return { message: NEUTRAL_MESSAGE, deliveryConfigured: emailService.isPasswordResetEmailConfigured() };
  }
  try {
    await emailService.sendPasswordResetEmail({
      to: user.email,
      resetUrl: frontendResetUrl(rawToken),
      expiresInMinutes: expiryMinutes(),
      correlationId: request?.correlationId,
    });
  } catch (error) {
    let cleanupFailed = false;
    try { await PasswordResetToken.deleteOne({ user: user._id, tokenHash }); } catch { cleanupFailed = true; }
    logRequestFailure({ error, request, cleanupFailed });
  }
  return { message: NEUTRAL_MESSAGE, deliveryConfigured: emailService.isPasswordResetEmailConfigured() };
};

const resetPassword = async ({ token, newPassword, request }) => {
  const tokenHash = hashResetToken(token);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const resetRecord = await PasswordResetToken.findOne({ tokenHash, expiresAt: { $gt: new Date() } }).select("+tokenHash").session(session);
      if (!resetRecord) throw new AppError("This password reset link is invalid or has expired.", 400, "PASSWORD_RESET_INVALID");
      const user = await User.findById(resetRecord.user).select("+password +authVersion").session(session);
      if (!user) throw new AppError("This password reset link is invalid or has expired.", 400, "PASSWORD_RESET_INVALID");
      user.password = await bcrypt.hash(newPassword, 10);
      user.authVersion = Number(user.authVersion || 0) + 1;
      user.$session(session);
      await user.save({ session });
      const deletion = await PasswordResetToken.deleteOne({ _id: resetRecord._id, tokenHash }).session(session);
      if (deletion.deletedCount !== 1) throw new AppError("This password reset link is invalid or has expired.", 400, "PASSWORD_RESET_INVALID");
      await auditService.recordAuditEvent({
        actor: user,
        request,
        action: "PASSWORD_RESET_COMPLETED",
        entityType: "User",
        entityId: user._id,
        outcome: "SUCCESS",
        after: { passwordChanged: true, sessionsInvalidated: true },
        session,
      });
    });
    return { message: "Your password has been reset successfully." };
  } finally {
    await session.endSession();
  }
};

module.exports = { NEUTRAL_MESSAGE, TOKEN_BYTES, hashResetToken, expiryMinutes, frontendResetUrl, logRequestFailure, requestPasswordReset, resetPassword };
