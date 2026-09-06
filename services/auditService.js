const crypto = require("crypto");
const mongoose = require("mongoose");
const AuditEvent = require("../models/AuditEvent");
const EmployeeProfile = require("../models/EmployeeProfile");
const AppError = require("../utils/AppError");
const { normalizeRole } = require("../utils/rbac");
const { SAFE_CORRELATION_ID } = require("../middleware/correlationId");

const SENSITIVE_KEY = /(password|passcode|token|authorization|cookie|secret|api[-_]?key|cvv|card(number)?|private(file)?content)/i;

const sanitizeAuditValue = (value, seen = new WeakSet()) => {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (mongoose.isValidObjectId(value) && typeof value?.toHexString === "function") return value.toString();
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditValue(item, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const source = typeof value.toObject === "function" ? value.toObject() : value;
    const safe = {};
    for (const [key, item] of Object.entries(source)) {
      safe[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeAuditValue(item, seen);
    }
    return safe;
  }
  return String(value);
};

const requestSnapshot = (request) => ({
  correlationId: request?.correlationId && SAFE_CORRELATION_ID.test(request.correlationId)
    ? request.correlationId
    : crypto.randomUUID(),
  route: request?.originalUrl || request?.route?.path || null,
  method: request?.method || null,
});

const recordAuditEvent = async ({ actor, request, action, entityType, entityId = null, entityReference = null, before = null, after = null, metadata = null, outcome = "SUCCESS", session = null }) => {
  if (!action || !entityType) throw new AppError("Audit action and entity type are required.", 500, "AUDIT_EVENT_INVALID");
  const authenticatedActor = actor?._id || actor?.id ? actor : null;
  let actorDepartment = null;
  if (authenticatedActor) {
    const profileQuery = EmployeeProfile.findOne({ user: authenticatedActor._id || authenticatedActor.id }).select("department");
    if (session) profileQuery.session(session);
    const profile = await profileQuery;
    actorDepartment = profile?.department || null;
  }
  const requestData = requestSnapshot(request);
  const eventData = {
    actor: authenticatedActor?._id || authenticatedActor?.id || null,
    actorRole: authenticatedActor ? normalizeRole(authenticatedActor.role) : null,
    actorDepartment,
    action,
    entityType,
    entityId,
    entityReference,
    before: sanitizeAuditValue(before),
    after: sanitizeAuditValue(after),
    metadata: sanitizeAuditValue(metadata),
    outcome,
    ...requestData,
  };
  if (session) {
    const [event] = await AuditEvent.create([eventData], { session });
    return event;
  }
  return AuditEvent.create(eventData);
};

const recordAuditEventSafely = async (event) => {
  try {
    return await recordAuditEvent(event);
  } catch (error) {
    if (process.env.NODE_ENV !== "test") console.error(`Audit recording failed: ${error.message}`);
    return null;
  }
};

const listAuditEvents = async (query = {}) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const filter = {};
  for (const field of ["actor", "action", "entityType", "entityId", "outcome"]) if (query[field] !== undefined) filter[field] = query[field];
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  const direction = query.sort === "asc" ? 1 : -1;
  const [events, total] = await Promise.all([
    AuditEvent.find(filter).sort({ createdAt: direction }).skip((page - 1) * limit).limit(limit).lean(),
    AuditEvent.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limit);
  return { events, pagination: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
};

const getAuditEventById = async (id) => {
  const event = await AuditEvent.findById(id).lean();
  if (!event) throw new AppError("Audit event not found.", 404, "AUDIT_EVENT_NOT_FOUND");
  return event;
};

module.exports = { sanitizeAuditValue, recordAuditEvent, recordAuditEventSafely, listAuditEvents, getAuditEventById };
