const ViewingRequest = require("../models/ViewingRequest");
const Property = require("../models/Property");
const Settings = require("../models/Settings");
const PROPERTY_STATUS = require("../constants/propertyStatus");
const PROPERTY_VERIFICATION_STATUS = require("../constants/propertyVerificationStatus");
const VIEWING_PAYMENT_STATUS = require("../constants/viewingPaymentStatus");

const notificationService = require("./notificationService");
const { findActivePlatformAdministrators } = require("./adminRecipientService");

const AppError = require("../utils/AppError");
const { requireActiveAgent } = require("../utils/assignment");
const { createFeedbackToken } = require("../utils/feedbackToken");
const { isPlatformAdministratorRole } = require("../utils/rbac");

const publicPropertyFilter = {
  status: PROPERTY_STATUS.AVAILABLE,
  verificationStatus: PROPERTY_VERIFICATION_STATUS.VERIFIED,
  isArchived: false,
};

const normalizeViewingProperties = (viewing) => {
  if (viewing && (!viewing.properties || viewing.properties.length === 0) && viewing.property) {
    viewing.properties = [viewing.property];
  }
  return viewing;
};

const populateViewing = (query) => query
  .populate("property", "title location price currency images")
  .populate("properties", "title location price currency images")
  .populate("assignedAgent", "name email")
  .populate("assignedBy", "name email");

const createViewingRequest = async (data) => {
  const requestedIds = [...new Set(
    [
      ...(data.property ? [data.property] : []),
      ...(Array.isArray(data.properties) ? data.properties : []),
    ]
      .map((id) => id.toString())
  )];
  const properties = await Property.find({ _id: { $in: requestedIds }, ...publicPropertyFilter })
    .select("title location price currency images");

  if (properties.length !== requestedIds.length) {
    throw new AppError(
      "One or more selected properties are unavailable for public viewing.",
      400,
      "PROPERTY_NOT_PUBLIC"
    );
  }

  const propertyById = new Map(properties.map((property) => [property._id.toString(), property]));
  const orderedProperties = requestedIds.map((id) => propertyById.get(id));
  const settings = await Settings.findOne().select("viewingFee viewingFeeCurrency defaultCurrency");
  const configuredFee = settings?.viewingFee;
  const amountDue = typeof configuredFee === "number" ? configuredFee : null;
  const currency = amountDue === null
    ? null
    : (settings.viewingFeeCurrency || settings.defaultCurrency || null);

  const viewingRequest = await ViewingRequest.create({
    property: orderedProperties[0]._id,
    properties: orderedProperties.map((property) => property._id),
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    preferredDate: data.preferredDate,
    preferredTime: data.preferredTime,
    message: data.message,
    paymentStatus: VIEWING_PAYMENT_STATUS.PENDING,
    amountDue,
    currency,
  });

  const admins = await findActivePlatformAdministrators();

  for (const admin of admins) {
    await notificationService.createNotification({
      title: "New Viewing Request",
      message: `${viewingRequest.fullName} requested a viewing for ${orderedProperties.length === 1 ? `"${orderedProperties[0].title}"` : `${orderedProperties.length} properties`}.`,
      type: "Viewing Request",
      recipient: admin._id,
      relatedViewingRequest: viewingRequest._id,
      relatedProperty: orderedProperties[0]._id,
    });
  }

  return normalizeViewingProperties(await populateViewing(ViewingRequest.findById(viewingRequest._id)));
};

const getViewingRequests = async (filters = {}) => {
  const query = {};

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.priority) {
    query.priority = filters.priority;
  }

  if (filters.assignedAgent) {
    query.assignedAgent = filters.assignedAgent;
  }

  const viewings = await populateViewing(ViewingRequest.find(query)).sort({ createdAt: -1 });
  return viewings.map(normalizeViewingProperties);
};

const getMyViewingRequests = async (agentId) => {
  const viewings = await populateViewing(ViewingRequest.find({
    assignedAgent: agentId,
  })).sort({ createdAt: -1 });
  return viewings.map(normalizeViewingProperties);
};

const getViewingRequestById = async (id, user) => {
  const viewingRequest = normalizeViewingProperties(
    await populateViewing(ViewingRequest.findById(id))
  );

  if (!viewingRequest) {
    throw new AppError(
      "Viewing request not found.",
      404,
      "VIEWING_REQUEST_NOT_FOUND"
    );
  }

  // Admins can view everything
  if (isPlatformAdministratorRole(user.role)) {
    return viewingRequest;
  }

  // Agents can only view requests assigned to them
  if (
    !viewingRequest.assignedAgent ||
    viewingRequest.assignedAgent._id.toString() !== user._id.toString()
  ) {
    throw new AppError(
      "You are not authorized to view this viewing request.",
      403,
      "FORBIDDEN"
    );
  }

  return normalizeViewingProperties(viewingRequest);
};

const updateViewingStatus = async (id, status, currentUser) => {
  const viewingRequest = await ViewingRequest.findById(id).select(
    "+feedbackTokenHash +feedbackTokenExpiresAt +feedbackTokenUsedAt"
  );

  if (!viewingRequest) {
    throw new AppError(
      "Viewing request not found.",
      404,
      "VIEWING_REQUEST_NOT_FOUND"
    );
  }

  // Ownership check
  if (!isPlatformAdministratorRole(currentUser.role)) {
    if (
      !viewingRequest.assignedAgent ||
      viewingRequest.assignedAgent.toString() !== currentUser._id.toString()
    ) {
      throw new AppError(
        "You are not authorized to update this viewing request.",
        403,
        "FORBIDDEN"
      );
    }
  }

  viewingRequest.status = status;

  let rawFeedbackToken = null;
  if (
    status === "Completed" &&
    !viewingRequest.feedbackTokenHash &&
    !viewingRequest.feedbackTokenUsedAt
  ) {
    const invitation = createFeedbackToken();
    rawFeedbackToken = invitation.token;
    viewingRequest.feedbackTokenHash = invitation.hash;
    viewingRequest.feedbackTokenExpiresAt = invitation.expiresAt;
  }

  await viewingRequest.save();

  viewingRequest.$locals = viewingRequest.$locals || {};
  viewingRequest.$locals.feedbackToken = rawFeedbackToken;

  if (viewingRequest.assignedAgent) {
    await notificationService.createNotification({
      recipient: viewingRequest.assignedAgent,
      type: "Viewing Request",
      title: "Viewing Status Updated",
      message: `Viewing request status changed to "${status}".`,
      relatedViewingRequest: viewingRequest._id,
    });
  }

  return normalizeViewingProperties(viewingRequest);
};

const updateViewingRequest = async (id, data, currentUser) => {
  const viewingRequest = normalizeViewingProperties(
    await populateViewing(ViewingRequest.findById(id))
  );

  if (!viewingRequest) {
    throw new AppError(
      "Viewing request not found.",
      404,
      "VIEWING_REQUEST_NOT_FOUND"
    );
  }

  // Ownership check
if (!isPlatformAdministratorRole(currentUser.role)) {
  if (
    !viewingRequest.assignedAgent ||
    viewingRequest.assignedAgent.toString() !== currentUser._id.toString()
  ) {
    throw new AppError(
      "You are not authorized to update this viewing request.",
      403,
      "FORBIDDEN"
    );
  }
}

  const previousAgent = viewingRequest.assignedAgent
    ? viewingRequest.assignedAgent.toString()
    : null;

  // Basic fields
  if (data.preferredDate !== undefined)
    viewingRequest.preferredDate = data.preferredDate;

  if (data.preferredTime !== undefined)
    viewingRequest.preferredTime = data.preferredTime;

  if (data.message !== undefined)
    viewingRequest.message = data.message;

  if (data.priority !== undefined)
    viewingRequest.priority = data.priority;

  if (data.nextFollowUp !== undefined)
    viewingRequest.nextFollowUp = data.nextFollowUp;

  if (data.internalNotes !== undefined)
    viewingRequest.internalNotes = data.internalNotes;

  if (data.status !== undefined)
    viewingRequest.status = data.status;

  // Only Admins can assign or unassign agents
if (
  !isPlatformAdministratorRole(currentUser.role) &&
  data.assignedAgent !== undefined
) {
  throw new AppError(
    "Only administrators can assign viewing requests.",
    403,
    "FORBIDDEN"
  );
}

  // Assignment
  if (data.assignedAgent !== undefined) {
    if (data.assignedAgent) {
      await requireActiveAgent(data.assignedAgent);
    }

    viewingRequest.assignedAgent = data.assignedAgent || null;

    if (data.assignedAgent) {
      viewingRequest.assignedBy = currentUser._id;
      viewingRequest.assignedAt = new Date();
    } else {
      viewingRequest.assignedBy = null;
      viewingRequest.assignedAt = null;
    }
  }

  await viewingRequest.save();

  // Notify newly assigned agent
  if (
    data.assignedAgent &&
    data.assignedAgent.toString() !== previousAgent
  ) {
    await notificationService.createNotification({
      title: "Viewing Request Assigned",
      message: `You have been assigned a viewing request for ${viewingRequest.properties.length === 1 ? `"${viewingRequest.properties[0].title}"` : `${viewingRequest.properties.length} properties`}.`,
      type: "Viewing Request",
      recipient: data.assignedAgent,
      relatedViewingRequest: viewingRequest._id,
      relatedProperty: viewingRequest.property._id,
    });
  }

  return normalizeViewingProperties(
    await populateViewing(ViewingRequest.findById(viewingRequest._id))
  );
};

module.exports = {
  createViewingRequest,
  getViewingRequests,
  getMyViewingRequests,
  getViewingRequestById,
  updateViewingStatus,
  updateViewingRequest,
  normalizeViewingProperties,
};
