const AppError = require("../utils/AppError");

const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
const SUBJECT = "Reset your Stef Realty password";
const EMAIL_PATTERN = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const senderAddress = (value) => {
  const input = String(value || "").trim();
  const match = input.match(/^(?:[^<>]+\s+<([^<>]+)>|([^<>]+))$/);
  return (match?.[1] || match?.[2] || "").trim();
};

const validatedConfig = () => {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.PASSWORD_RESET_FROM_EMAIL || "").trim();
  if (!apiKey || !from || !EMAIL_PATTERN.test(senderAddress(from))) {
    throw new AppError("Transactional password-reset email is not configured.", 503, "TRANSACTIONAL_EMAIL_NOT_CONFIGURED");
  }
  return { apiKey, from };
};

const isPasswordResetEmailConfigured = () => {
  try { validatedConfig(); return true; } catch { return false; }
};

const htmlEscape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const emailContent = ({ resetUrl, expiresInMinutes }) => ({
  text: `Hello,\n\nWe received a request to reset your Stef Realty password.\n\nReset your password:\n${resetUrl}\n\nThis link expires in ${expiresInMinutes} minutes.\n\nIf you did not request a password reset, you can ignore this email.\n\nStef Realty`,
  html: `<p>Hello,</p><p>We received a request to reset your Stef Realty password.</p><p><a href="${htmlEscape(resetUrl)}" style="display:inline-block;padding:12px 18px;background:#198754;color:#fff;text-decoration:none;border-radius:6px">Reset your password</a></p><p>This link expires in ${expiresInMinutes} minutes.</p><p>If you did not request a password reset, you can ignore this email.</p><p>Stef Realty</p>`,
});

const sendPasswordResetEmail = async ({ to, resetUrl, expiresInMinutes, correlationId }, { fetchImpl = global.fetch } = {}) => {
  const { apiKey, from } = validatedConfig();
  if (!EMAIL_PATTERN.test(String(to || "").trim()) || typeof resetUrl !== "string" || !resetUrl) {
    throw new AppError("Password-reset email request is invalid.", 500, "TRANSACTIONAL_EMAIL_INVALID");
  }
  if (typeof fetchImpl !== "function") throw new AppError("Transactional email transport is unavailable.", 503, "TRANSACTIONAL_EMAIL_UNAVAILABLE");
  const content = emailContent({ resetUrl, expiresInMinutes });
  let response;
  try {
    response = await fetchImpl(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "stef-realty-api/1.0",
        ...(correlationId ? { "Idempotency-Key": `password-reset-${correlationId}` } : {}),
      },
      body: JSON.stringify({ from, to: [to], subject: SUBJECT, text: content.text, html: content.html }),
    });
  } catch {
    throw new AppError("Transactional email delivery failed.", 502, "TRANSACTIONAL_EMAIL_DELIVERY_FAILED");
  }
  let providerBody = {};
  try { providerBody = await response.json(); } catch { providerBody = {}; }
  if (!response.ok || typeof providerBody.id !== "string" || !providerBody.id) {
    const error = new AppError("Transactional email delivery failed.", 502, "TRANSACTIONAL_EMAIL_DELIVERY_FAILED");
    error.providerStatus = response.status;
    throw error;
  }
  return { delivered: true, provider: "resend", messageId: providerBody.id };
};

module.exports = { RESEND_EMAILS_ENDPOINT, SUBJECT, senderAddress, validatedConfig, isPasswordResetEmailConfigured, emailContent, sendPasswordResetEmail };
