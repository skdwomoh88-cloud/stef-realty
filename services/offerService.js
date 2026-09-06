const Offer = require("../models/Offer");
const Property = require("../models/Property");

const AppError = require("../utils/AppError");

const OFFER_STATUS = require("../constants/offerStatus");
const REFERENCE_PREFIXES = require("../constants/referencePrefixes");

const {
  generateReferenceNumber,
} = require("../utils/referenceNumberGenerator");

const notificationService = require("./notificationService");
const { requireActiveAgent } = require("../utils/assignment");
const { findActivePlatformAdministrators } = require("./adminRecipientService");
const { isPlatformAdministratorRole } = require("../utils/rbac");

const createOffer = async (data) => {
  // Verify property exists
  const property = await Property.findById(data.property);

  if (!property) {
    throw new AppError(
      "Property not found.",
      404,
      "PROPERTY_NOT_FOUND"
    );
  }

  // Generate Offer Number
  const offerNumber = await generateReferenceNumber(
    REFERENCE_PREFIXES.OFFER,
    "offer"
  );

  // Create Offer
  const offer = await Offer.create({
    offerNumber,
    property: property._id,
    fullName: data.fullName,
    email: data.email,
    phone: data.phone,
    offerAmount: data.offerAmount,
    currency: data.currency || "GHS",
    termsOfPayment: data.termsOfPayment,
    proposedCompletionDate:
      data.proposedCompletionDate || null,
    offerExpiryDate:
      data.offerExpiryDate || null,
    conditions: data.conditions || "",
    message: data.message || "",
    status: OFFER_STATUS.NEW,
  });

  // Notify all admins
  const admins = await findActivePlatformAdministrators();

  for (const admin of admins) {
    await notificationService.createNotification({
      title: "New Offer",
      message: `${offer.fullName} submitted an offer for "${property.title}".`,
      type: "Offer",
      recipient: admin._id,
      relatedProperty: property._id,
      relatedOffer: offer._id,
    });
  }

  return await Offer.findById(offer._id)
    .populate("property", "title price")
    .populate(
      "assignedAgent",
      "name email"
    );
};

const getAllOffers = async () => {
  return Offer.find()
    .populate("property", "title price")
        .populate("assignedAgent", "name email")
    .populate("assignedBy", "name email")
    .sort({ createdAt: -1 });
};

const getMyOffers = async (agentId) => {
  return Offer.find({ assignedAgent: agentId })
    .populate("property", "title price")
    .populate("assignedAgent", "name email")
    .sort({ createdAt: -1 });
};

const assignOffer = async (offerId, agentId, assignedBy) => {
  const offer = await Offer.findById(offerId).populate(
    "property",
    "title"
  );

  if (!offer) {
    throw new AppError(
      "Offer not found.",
      404,
      "OFFER_NOT_FOUND"
    );
  }

  await requireActiveAgent(agentId);

  offer.assignedAgent = agentId;
  offer.assignedBy = assignedBy;
  offer.assignedAt = new Date();
  offer.status = OFFER_STATUS.ASSIGNED;

  await offer.save();

  await notificationService.createNotification({
    type: "Offer",
    title: "Offer Assigned",
    message: `You have been assigned ${offer.offerNumber} for "${offer.property.title}".`,
    recipient: agentId,
    relatedOffer: offer._id,
    relatedProperty: offer.property._id,
  });

  return await Offer.findById(offer._id)
    .populate("property", "title price")
    .populate("assignedAgent", "name email")
    .populate("assignedBy", "name email");
};

const getOfferById = async (id, currentUser) => {
  const offer = await Offer.findById(id)
    .populate("property", "title price")
    .populate("assignedAgent", "name email")
    .populate("assignedBy", "name email");

  if (!offer) {
    throw new AppError(
      "Offer not found.",
      404,
      "OFFER_NOT_FOUND"
    );
  }

  // Ownership check
  if (!isPlatformAdministratorRole(currentUser.role)) {
    if (
      !offer.assignedAgent ||
      offer.assignedAgent._id.toString() !==
        currentUser._id.toString()
    ) {
      throw new AppError(
        "You are not authorized to view this offer.",
        403,
        "FORBIDDEN"
      );
    }
  }

  return offer;
};

const updateOfferStatus = async (
  id,
  status,
  currentUser
) => {
  const offer = await Offer.findById(id);

  if (!offer) {
    throw new AppError(
      "Offer not found.",
      404,
      "OFFER_NOT_FOUND"
    );
  }

  // Ownership check
  if (!isPlatformAdministratorRole(currentUser.role)) {
    if (
      !offer.assignedAgent ||
      offer.assignedAgent.toString() !== currentUser._id.toString()
    ) {
      throw new AppError(
        "You are not authorized to update this offer.",
        403,
        "FORBIDDEN"
      );
    }
  }

  offer.status = status;

  await offer.save();

  return await Offer.findById(offer._id)
    .populate("property", "title price")
    .populate("assignedAgent", "name email")
    .populate("assignedBy", "name email");
};

const updateOffer = async (id, data, currentUser) => {
  const offer = await Offer.findById(id)
    .populate("property", "title");

  if (!offer) {
    throw new AppError(
      "Offer not found.",
      404,
      "OFFER_NOT_FOUND"
    );
  }

  // Ownership check
  if (!isPlatformAdministratorRole(currentUser.role)) {
    if (
      !offer.assignedAgent ||
      offer.assignedAgent.toString() !== currentUser._id.toString()
    ) {
      throw new AppError(
        "You are not authorized to update this offer.",
        403,
        "FORBIDDEN"
      );
    }
  }

  // Editable fields
  if (data.offerAmount !== undefined)
    offer.offerAmount = data.offerAmount;

  if (data.termsOfPayment !== undefined)
    offer.termsOfPayment = data.termsOfPayment;

  if (data.proposedCompletionDate !== undefined)
    offer.proposedCompletionDate = data.proposedCompletionDate;

  if (data.offerExpiryDate !== undefined)
    offer.offerExpiryDate = data.offerExpiryDate;

  if (data.conditions !== undefined)
    offer.conditions = data.conditions;

  if (data.message !== undefined)
    offer.message = data.message;

  if (data.priority !== undefined)
    offer.priority = data.priority;

  if (data.nextFollowUp !== undefined)
    offer.nextFollowUp = data.nextFollowUp;

  if (data.internalNotes !== undefined)
    offer.internalNotes = data.internalNotes;

  await offer.save();

  return await Offer.findById(offer._id)
    .populate("property", "title price")
    .populate("assignedAgent", "name email")
    .populate("assignedBy", "name email");
};

const deleteOffer = async (id) => {
  const offer = await Offer.findById(id);

  if (!offer) {
    throw new AppError(
      "Offer not found.",
      404,
      "OFFER_NOT_FOUND"
    );
  }

  await offer.deleteOne();

  return;
};

module.exports = {
  createOffer,
  getAllOffers,
  getMyOffers,
  assignOffer,
  getOfferById,
  updateOfferStatus,
  updateOffer,
  deleteOffer,
};
