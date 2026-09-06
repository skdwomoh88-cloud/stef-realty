const Inquiry = require("../models/Inquiry");
const Property = require("../models/Property");
const AppError = require("../utils/AppError");
const INQUIRY_STATUS = require("../constants/inquiryStatus");
const notificationService = require("./notificationService");
const { findActivePlatformAdministrators } = require("./adminRecipientService");
const { isPlatformAdministratorRole } = require("../utils/rbac");
const { requireActiveAgent } = require("../utils/assignment");

const createInquiry = async (data) => {
  const property = await Property.findById(data.property);

  if (!property) {
    throw new AppError(
      "Property not found",
      404,
      "PROPERTY_NOT_FOUND"
    );
  }

  const inquiry = await Inquiry.create({
    property: property._id,
    assignedAgent: null,
    status: INQUIRY_STATUS.NEW,
    name: data.name,
    email: data.email,
    phone: data.phone,
    message: data.message,
    preferredContactMethod: data.preferredContactMethod,
  });

  const admins = await findActivePlatformAdministrators();

  for (const admin of admins) {
    await notificationService.createNotification({
      title: "New Inquiry",
      message: `${data.name} submitted an inquiry for "${property.title}".`,
      type: "Inquiry",
      recipient: admin._id,
      relatedInquiry: inquiry._id,
      relatedProperty: property._id,
    });
  }

  return inquiry.populate([
    {
      path: "property",
      select: "title price listingType propertyType",
    },
    {
      path: "assignedAgent",
      select: "name email",
    },
  ]);
};

const getAllInquiries = async () => {
  return Inquiry.find()
    .populate("property", "title price listingType propertyType")
    .populate("assignedAgent", "name email")
    .populate("assignedBy", "name email")
    .sort({ createdAt: -1 });
};

const getAgentInquiries = async (agentId) => {
  return Inquiry.find({ assignedAgent: agentId })
    .populate("property", "title price listingType propertyType")
    .populate("assignedAgent", "name email role")
    .sort({ createdAt: -1 });
};

const getInquiryById = async (id, currentUser) => {
  const inquiry = await Inquiry.findById(id)
    .populate("property")
    .populate("assignedAgent", "name email")
    .populate("assignedBy", "name email");

  if (!inquiry) {
    throw new AppError(
      "Inquiry not found",
      404,
      "INQUIRY_NOT_FOUND"
    );
  }

  // Ownership check
if (!isPlatformAdministratorRole(currentUser.role)) {
  if (
    !inquiry.assignedAgent ||
    inquiry.assignedAgent._id.toString() !== currentUser._id.toString()
  ) {
    throw new AppError(
      "You are not authorized to view this inquiry.",
      403,
      "FORBIDDEN"
    );
  }
}

  return inquiry;
};

const updateInquiryStatus = async (id, status, currentUser) => {
  const inquiry = await Inquiry.findById(id);

  if (!inquiry) {
    throw new AppError(
      "Inquiry not found",
      404,
      "INQUIRY_NOT_FOUND"
    );
  }

  // Ownership check
if (!isPlatformAdministratorRole(currentUser.role)) {
  if (
    !inquiry.assignedAgent ||
    inquiry.assignedAgent.toString() !== currentUser._id.toString()
  ) {
    throw new AppError(
      "You are not authorized to update this inquiry.",
      403,
      "FORBIDDEN"
    );
  }
}

if (!Object.values(INQUIRY_STATUS).includes(status)) {
  throw new AppError(
    "Invalid inquiry status.",
    400,
    "INVALID_INQUIRY_STATUS"
  );
}

  inquiry.status = status;

  await inquiry.save();

  return inquiry.populate([
    {
      path: "property",
      select: "title price",
    },
    {
      path: "assignedAgent",
      select: "name email",
    },
  ]);
};

const assignAgent = async (inquiryId, agentId, assignedBy) => {
  const inquiry = await Inquiry.findById(inquiryId).populate(
    "property",
    "title"
  );

  if (!inquiry) {
    throw new AppError(
      "Inquiry not found.",
      404,
      "INQUIRY_NOT_FOUND"
    );
  }

  await requireActiveAgent(agentId);

  inquiry.assignedAgent = agentId;
  inquiry.assignedBy = assignedBy;
  inquiry.assignedAt = new Date();

  await inquiry.save();

  await notificationService.createNotification({
    title: "Inquiry Assigned",
    message: `You have been assigned a new inquiry for "${inquiry.property.title}".`,
    type: "Inquiry",
    recipient: agentId,
    relatedInquiry: inquiry._id,
    relatedProperty: inquiry.property._id,
  });

  return inquiry.populate([
    { path: "property" },
    { path: "assignedAgent", select: "name email role" },
    { path: "assignedBy", select: "name email" },
  ]);
};

module.exports = {
  createInquiry,
  getAllInquiries,
  getAgentInquiries,
  getInquiryById,
  updateInquiryStatus,
  assignAgent,
};
