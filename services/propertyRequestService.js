const PropertyRequest = require("../models/PropertyRequest");
const { ROLES } = require("../constants/roleCatalogue");
const { isRole } = require("../utils/rbac");
const REFERENCE_PREFIXES = require("../constants/referencePrefixes");
const { generateReferenceNumber } = require("../utils/referenceNumberGenerator");
const { requireActiveAgent } = require("../utils/assignment");
const AppError = require("../utils/AppError");
const notificationService = require("./notificationService");
const { findActivePlatformAdministrators } = require("./adminRecipientService");

const PUBLIC_FIELDS = ["fullName", "email", "phone", "preferredContactMethod", "listingType", "category", "propertyType", "preferredRegion", "preferredCity", "preferredArea", "minBudget", "maxBudget", "currency", "bedrooms", "bathrooms", "timeframe", "requirements"];
const populate = (query) => query.populate("assignedAgent", "name email").populate("assignedBy", "name email");

const create = async (data) => {
  const safeData = Object.fromEntries(PUBLIC_FIELDS.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
  safeData.requestNumber = await generateReferenceNumber(REFERENCE_PREFIXES.PROPERTY_REQUEST, "propertyRequest");
  const request = await PropertyRequest.create(safeData);
  const admins = await findActivePlatformAdministrators();
  for (const admin of admins) {
    await notificationService.createNotification({
      recipient: admin._id, type: "Property Request", title: "New Property Request",
      message: `${request.fullName} submitted property request ${request.requestNumber}.`,
      relatedPropertyRequest: request._id,
    });
  }
  return request;
};

const list = async (query, user) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const filter = {};
  for (const field of ["status", "priority", "assignedAgent", "listingType", "category", "propertyType", "preferredRegion", "preferredCity", "preferredArea"]) {
    if (query[field] !== undefined) filter[field] = query[field];
  }
  if (isRole(user.role, ROLES.AGENT)) filter.assignedAgent = user._id;
  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) filter.createdAt.$lte = new Date(query.dateTo);
  }
  const sortBy = query.sortBy || "createdAt";
  const direction = query.sortOrder === "asc" ? 1 : -1;
  const [requests, total] = await Promise.all([
    populate(PropertyRequest.find(filter)).sort({ [sortBy]: direction }).skip((page - 1) * limit).limit(limit),
    PropertyRequest.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limit);
  return { requests, pagination: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
};

const getById = async (id, user) => {
  const request = await populate(PropertyRequest.findById(id));
  if (!request) throw new AppError("Property request not found.", 404, "PROPERTY_REQUEST_NOT_FOUND");
  if (isRole(user.role, ROLES.AGENT) && request.assignedAgent?._id.toString() !== user._id.toString()) {
    throw new AppError("You are not authorized to access this property request.", 403, "FORBIDDEN");
  }
  return request;
};

const assign = async (id, assignedAgent, user) => {
  const agent = await requireActiveAgent(assignedAgent);
  const request = await PropertyRequest.findById(id);
  if (!request) throw new AppError("Property request not found.", 404, "PROPERTY_REQUEST_NOT_FOUND");
  request.assignedAgent = agent._id;
  request.assignedBy = user._id;
  request.assignedAt = new Date();
  await request.save();
  await notificationService.createNotification({
    recipient: agent._id, type: "Property Request", title: "Property Request Assigned",
    message: `You have been assigned property request ${request.requestNumber}.`, relatedPropertyRequest: request._id,
  });
  return populate(PropertyRequest.findById(request._id));
};

const update = async (id, data, user) => {
  const request = await PropertyRequest.findById(id);
  if (!request) throw new AppError("Property request not found.", 404, "PROPERTY_REQUEST_NOT_FOUND");
  if (isRole(user.role, ROLES.AGENT) && request.assignedAgent?.toString() !== user._id.toString()) {
    throw new AppError("You are not authorized to update this property request.", 403, "FORBIDDEN");
  }
  for (const field of ["status", "priority", "internalNotes", "nextFollowUpAt"]) {
    if (data[field] !== undefined) request[field] = data[field];
  }
  await request.save();
  return populate(PropertyRequest.findById(request._id));
};

module.exports = { create, list, getById, assign, update };
