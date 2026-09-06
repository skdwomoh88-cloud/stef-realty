const User = require("../models/User");

const normalizeEmailInput = (value) => typeof value === "string"
  ? value.trim().toLowerCase()
  : value;

const splitEmail = (email) => {
  const normalized = normalizeEmailInput(email);
  if (typeof normalized !== "string") return null;
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) return null;
  return { normalized, local: normalized.slice(0, separator), domain: normalized.slice(separator + 1) };
};

const isGmailDomain = (domain) => domain === "gmail.com" || domain === "googlemail.com";

const gmailDotlessVariant = (email) => {
  const parts = splitEmail(email);
  if (!parts || !isGmailDomain(parts.domain)) return null;
  const dotlessLocal = parts.local.replace(/\./g, "");
  const variant = `${dotlessLocal}@${parts.domain}`;
  return variant === parts.normalized ? null : variant;
};

const normalizeRegistrationEmail = (email) => {
  const normalized = normalizeEmailInput(email);
  const parts = splitEmail(normalized);
  if (!parts || !isGmailDomain(parts.domain)) return normalized;
  return `${parts.local.replace(/\./g, "")}@${parts.domain}`;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const gmailDotEquivalentRegex = (email) => {
  const parts = splitEmail(email);
  if (!parts || !isGmailDomain(parts.domain)) return null;
  const dotlessLocal = parts.local.replace(/\./g, "");
  if (!dotlessLocal) return null;
  const localPattern = [...dotlessLocal].map(escapeRegex).join("\\.*");
  return new RegExp(`^${localPattern}@${escapeRegex(parts.domain)}$`, "i");
};

const findUserForLogin = async (email) => {
  const normalized = normalizeEmailInput(email);
  let user = await User.findOne({ email: normalized }).select("+password +authVersion");
  if (user) return user;
  const fallback = gmailDotlessVariant(normalized);
  if (!fallback) return null;
  user = await User.findOne({ email: fallback }).select("+password +authVersion");
  return user;
};

const findEquivalentRegisteredUser = async (email) => {
  const normalized = normalizeEmailInput(email);
  const exact = await User.findOne({ email: normalized });
  if (exact) return exact;
  const equivalentPattern = gmailDotEquivalentRegex(normalized);
  return equivalentPattern ? User.findOne({ email: equivalentPattern }) : null;
};

module.exports = {
  normalizeEmailInput,
  normalizeRegistrationEmail,
  gmailDotlessVariant,
  gmailDotEquivalentRegex,
  findUserForLogin,
  findEquivalentRegisteredUser,
};
