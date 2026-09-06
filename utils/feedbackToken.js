const crypto = require("crypto");

const configuredDays = Number(process.env.FEEDBACK_TOKEN_EXPIRES_DAYS);
const expirationDays = Number.isFinite(configuredDays) && configuredDays > 0
  ? configuredDays
  : 7;

const hashFeedbackToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

const createFeedbackToken = () => {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    hash: hashFeedbackToken(token),
    expiresAt: new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000),
  };
};

const feedbackTokensMatch = (token, storedHash) => {
  if (!token || !storedHash) return false;
  const supplied = Buffer.from(hashFeedbackToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return supplied.length === stored.length && crypto.timingSafeEqual(supplied, stored);
};

module.exports = {
  expirationDays,
  hashFeedbackToken,
  createFeedbackToken,
  feedbackTokensMatch,
};
