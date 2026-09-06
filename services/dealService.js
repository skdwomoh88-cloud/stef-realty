const Deal = require("../models/Deal");
const Offer = require("../models/Offer");
const AppError = require("../utils/AppError");
const { isPlatformAdministratorRole } = require("../utils/rbac");
const DEAL_STATUS = require("../constants/dealStatus");
const OFFER_STATUS = require("../constants/offerStatus");
const REFERENCE_PREFIXES = require("../constants/referencePrefixes");
const Property = require("../models/Property");

const {
  generateReferenceNumber,
} = require("../utils/referenceNumberGenerator");

const notificationService = require("./notificationService");

const createDeal = async (data, currentUser) => {
  const offer = await Offer.findById(data.offer)
    .populate("property");

  if (!offer) {
    throw new AppError(
      "Offer not found.",
      404,
      "OFFER_NOT_FOUND"
    );
  }

  const existingDeal = await Deal.findOne({
  offer: offer._id,
});

if (existingDeal) {
  throw new AppError(
    "A deal has already been created for this offer.",
    400,
    "DEAL_ALREADY_EXISTS"
  );
}

  if (offer.status !== OFFER_STATUS.ACCEPTED) {
    throw new AppError(
      "Only accepted offers can be converted into deals.",
      400,
      "OFFER_NOT_ACCEPTED"
    );
  }

  const dealNumber = await generateReferenceNumber(
    REFERENCE_PREFIXES.DEAL,
    "deal"
  );

  let deal;

  try {
    deal = await Deal.create({
      dealNumber,
      offer: offer._id,
      property: offer.property._id,
      customerName: offer.fullName,
      customerEmail: offer.email,
      customerPhone: offer.phone,
      salePrice: data.salePrice,
      currency: offer.currency,
      termsOfPayment: data.termsOfPayment,
      assignedAgent: offer.assignedAgent,
      status: DEAL_STATUS.ACTIVE,
    });
  } catch (error) {
    const isOfferDuplicate =
      error.code === 11000 &&
      (error.keyPattern?.offer || error.keyValue?.offer);

    if (isOfferDuplicate) {
      throw new AppError(
        "A deal has already been created for this offer.",
        400,
        "DEAL_ALREADY_EXISTS"
      );
    }

    throw error;
  }

  await notificationService.createNotification({
    type: "Deal",
    title: "New Deal Created",
    message: `Deal ${deal.dealNumber} has been created.`,
    recipient: currentUser._id,
    relatedDeal: deal._id,
    relatedProperty: deal.property,
  });

  return await Deal.findById(deal._id)
    .populate("offer")
    .populate("property", "title price")
    .populate("assignedAgent", "name email");
};

const getAllDeals = async () => {
  return Deal.find()
    .populate("offer", "offerNumber")
    .populate("property", "title price")
        .populate("assignedAgent", "name email")
    .sort({ createdAt: -1 });
};

const getMyDeals = async (agentId) => {
  return Deal.find({ assignedAgent: agentId })
    .populate("offer", "offerNumber")
    .populate("property", "title price")
    .populate("assignedAgent", "name email")
    .sort({ createdAt: -1 });
};

const getDealById = async (id, currentUser) => {
  const deal = await Deal.findById(id)
    .populate("offer")
    .populate("property", "title price")
    .populate("assignedAgent", "name email");

  if (!deal) {
    throw new AppError(
      "Deal not found.",
      404,
      "DEAL_NOT_FOUND"
    );
  }

  // Ownership check
  if (!isPlatformAdministratorRole(currentUser.role)) {
    if (
      !deal.assignedAgent ||
      deal.assignedAgent._id.toString() !==
        currentUser._id.toString()
    ) {
      throw new AppError(
        "You are not authorized to view this deal.",
        403,
        "FORBIDDEN"
      );
    }
  }

  return deal;
};

const updateDeal = async (id, data, currentUser) => {
  const deal = await Deal.findById(id);

  if (!deal) {
    throw new AppError(
      "Deal not found.",
      404,
      "DEAL_NOT_FOUND"
    );
  }

  // Ownership check
  if (!isPlatformAdministratorRole(currentUser.role)) {
    if (
      !deal.assignedAgent ||
      deal.assignedAgent.toString() !== currentUser._id.toString()
    ) {
      throw new AppError(
        "You are not authorized to update this deal.",
        403,
        "FORBIDDEN"
      );
    }
  }

  if (data.salePrice !== undefined)
    deal.salePrice = data.salePrice;

  if (data.termsOfPayment !== undefined)
    deal.termsOfPayment = data.termsOfPayment;

  if (data.nextFollowUp !== undefined)
    deal.nextFollowUp = data.nextFollowUp;

  if (data.internalNotes !== undefined)
    deal.internalNotes = data.internalNotes;

  await deal.save();

  return await Deal.findById(deal._id)
    .populate("offer", "offerNumber")
    .populate("property", "title price")
    .populate("assignedAgent", "name email");
};

const updateDealStatus = async (
  id,
  status,
  currentUser
) => {
  const deal = await Deal.findById(id);

  if (!deal) {
    throw new AppError(
      "Deal not found.",
      404,
      "DEAL_NOT_FOUND"
    );
  }

  // Ownership check
  if (!isPlatformAdministratorRole(currentUser.role)) {
    if (
      !deal.assignedAgent ||
      deal.assignedAgent.toString() !== currentUser._id.toString()
    ) {
      throw new AppError(
        "You are not authorized to update this deal.",
        403,
        "FORBIDDEN"
      );
    }
  }

  deal.status = status;

  await deal.save();

  return await Deal.findById(deal._id)
    .populate("offer", "offerNumber")
    .populate("property", "title price")
    .populate("assignedAgent", "name email");
};

const recordPayment = async (
  id,
  data,
  currentUser
) => {
  const deal = await Deal.findById(id);

  if (!deal) {
    throw new AppError(
      "Deal not found.",
      404,
      "DEAL_NOT_FOUND"
    );
  }

  // Ownership check
  if (!isPlatformAdministratorRole(currentUser.role)) {
    if (
      !deal.assignedAgent ||
      deal.assignedAgent.toString() !== currentUser._id.toString()
    ) {
      throw new AppError(
        "You are not authorized to record payments for this deal.",
        403,
        "FORBIDDEN"
      );
    }
  }

  deal.payments.push({
    amount: data.amount,
    paymentDate: data.paymentDate,
    paymentMethod: data.paymentMethod,
    referenceNumber: data.referenceNumber,
    notes: data.notes,
    recordedBy: currentUser._id,
  });

  await deal.save();

  return await Deal.findById(deal._id)
  .populate("offer", "offerNumber")
  .populate("property", "title price")
    .populate("assignedAgent", "name email")
  .populate("payments.recordedBy", "name email");
};

const updateCommission = async (
  id,
  data,
  currentUser
) => {
  const deal = await Deal.findById(id);

  if (!deal) {
    throw new AppError(
      "Deal not found.",
      404,
      "DEAL_NOT_FOUND"
    );
  }

  if (!isPlatformAdministratorRole(currentUser.role)) {
    throw new AppError(
      "Only admins can update commission.",
      403,
      "FORBIDDEN"
    );
  }

  if (data.amount !== undefined)
    deal.commission.amount = data.amount;

  if (data.percentage !== undefined)
    deal.commission.percentage = data.percentage;

  if (data.status !== undefined)
    deal.commission.status = data.status;

  if (data.paidDate !== undefined)
    deal.commission.paidDate = data.paidDate;

  if (data.notes !== undefined)
    deal.commission.notes = data.notes;

  await deal.save();

  return await Deal.findById(deal._id)
  .populate("offer", "offerNumber")
  .populate("property", "title price")
    .populate("assignedAgent", "name email")
  .populate("payments.recordedBy", "name email");
};

const closeDeal = async (id, currentUser) => {
  const deal = await Deal.findById(id)
    .populate("property");

  if (!deal) {
    throw new AppError(
      "Deal not found.",
      404,
      "DEAL_NOT_FOUND"
    );
  }

  if (!isPlatformAdministratorRole(currentUser.role)) {
    throw new AppError(
      "Only admins can close deals.",
      403,
      "FORBIDDEN"
    );
  }

  deal.status = DEAL_STATUS.COMPLETED;

  await deal.save();

  await Property.findByIdAndUpdate(
    deal.property._id,
    {
      status: "Sold",
    }
  );

  await notificationService.createNotification({
    type: "Deal",
    title: "Deal Completed",
    message: `Deal ${deal.dealNumber} has been completed.`,
    recipient: deal.assignedAgent,
    relatedDeal: deal._id,
    relatedProperty: deal.property._id,
  });

  return await Deal.findById(deal._id)
  .populate("offer", "offerNumber")
  .populate("property", "title price status")
    .populate("assignedAgent", "name email")
  .populate("payments.recordedBy", "name email");
};

const deleteDeal = async (id) => {
  const deal = await Deal.findById(id);

  if (!deal) {
    throw new AppError(
      "Deal not found.",
      404,
      "DEAL_NOT_FOUND"
    );
  }

  await deal.deleteOne();

  return;
};

module.exports = {
  createDeal,
  getAllDeals,
  getMyDeals,
  getDealById,
  updateDeal,
  updateDealStatus,
  recordPayment,
  updateCommission,
  closeDeal,
  deleteDeal,
};
