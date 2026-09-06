const ListingDraft = require("../models/ListingDraft");
const Case = require("../models/Case");

const CASE_STATUS = require("../constants/caseStatus");
const LISTING_DRAFT_STATUS = require("../constants/listingDraftStatus");

const { canTransition } = require("../utils/caseWorkflow");
const AppError = require("../utils/AppError");
const { ROLES } = require("../constants/roleCatalogue");
const { isRole } = require("../utils/rbac");

const Property = require("../models/Property");
const PROPERTY_VERIFICATION_STATUS = require("../constants/propertyVerificationStatus");

const mongoose = require("mongoose");
const { requireOwnership } = require("../utils/authorization");

const createListingDraft = async (data, currentUser) => {
  const existingCase = await Case.findById(data.case);

  if (!existingCase) {
    throw new AppError("Case not found", 404);
  }

  requireOwnership(
    existingCase,
    "assignedAgent",
    currentUser,
    "You are not authorized to create a listing draft for this case."
  );

  if (
    !canTransition(
      existingCase.status,
      CASE_STATUS.LISTING_DRAFT
    )
  ) {
    throw new AppError(
      `Cannot move case from "${existingCase.status}" to "${CASE_STATUS.LISTING_DRAFT}".`,
      400
    );
  }

  const draftExists = await ListingDraft.findOne({
    case: data.case,
  });

  if (draftExists) {
    throw new AppError(
      "A listing draft already exists for this case.",
      400
    );
  }

  const draft = await ListingDraft.create({
    ...data,
    createdBy: currentUser._id,
    status: LISTING_DRAFT_STATUS.DRAFT,
  });

  existingCase.status = CASE_STATUS.LISTING_DRAFT;

  existingCase.history.push({
    status: CASE_STATUS.LISTING_DRAFT,
    changedBy: currentUser._id,
    notes: "Listing draft created",
  });

  await existingCase.save();

  return draft;
};

const submitForApproval = async (draftId, currentUser) => {
  const draft = await ListingDraft.findById(draftId);

  if (!draft) {
    throw new AppError("Listing draft not found", 404);
  }

  if (draft.status !== LISTING_DRAFT_STATUS.DRAFT) {
    throw new AppError(
      "Only draft listings can be submitted for approval.",
      400
    );
  }

  const existingCase = await Case.findById(draft.case);

  if (!existingCase) {
    throw new AppError("Case not found", 404);
  }

  requireOwnership(
    existingCase,
    "assignedAgent",
    currentUser,
    "You are not authorized to submit this listing draft."
  );

  if (
    !canTransition(
      existingCase.status,
      CASE_STATUS.PENDING_APPROVAL
    )
  ) {
    throw new AppError(
      `Cannot move case from "${existingCase.status}" to "${CASE_STATUS.PENDING_APPROVAL}".`,
      400
    );
  }

  draft.status = LISTING_DRAFT_STATUS.PENDING_APPROVAL;
  await draft.save();

  existingCase.status = CASE_STATUS.PENDING_APPROVAL;

  existingCase.history.push({
    status: CASE_STATUS.PENDING_APPROVAL,
    changedBy: currentUser._id,
    notes: "Listing submitted for approval",
  });

  await existingCase.save();

  return draft;
};

const approveListing = async (draftId, userId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const draft = await ListingDraft.findById(draftId).session(session);

    if (!draft) {
      throw new AppError("Listing draft not found", 404);
    }

    if (
      draft.status !== LISTING_DRAFT_STATUS.PENDING_APPROVAL
    ) {
      throw new AppError(
        "Listing is not pending approval.",
        400
      );
    }

    const existingCase = await Case.findById(draft.case).session(session);

    if (!existingCase) {
      throw new AppError("Case not found", 404);
    }

    const property = await Property.findById(draft.property).session(session);

    if (!property) {
      throw new AppError("Property not found", 404);
    }

    draft.status = LISTING_DRAFT_STATUS.APPROVED;
    await draft.save({ session });

    property.verificationStatus =
      PROPERTY_VERIFICATION_STATUS.VERIFIED;
    await property.save({ session });

    existingCase.status = CASE_STATUS.PUBLISHED;

    existingCase.history.push({
      status: CASE_STATUS.PUBLISHED,
      changedBy: userId,
      notes: "Listing approved and published",
    });

    await existingCase.save({ session });

    await session.commitTransaction();

    return draft;

  } catch (error) {

    await session.abortTransaction();
    throw error;

  } finally {

    session.endSession();

  }
};

const getListingDraft = async (draftId, currentUser) => {
  const draft = await ListingDraft.findById(draftId)
    .populate("property")
    .populate("case")
    .populate("createdBy", "name email");

  if (!draft) {
    throw new AppError("Listing draft not found", 404);
  }

  requireOwnership(
    draft.case,
    "assignedAgent",
    currentUser,
    "You are not authorized to view this listing draft."
  );

  return draft;
};

const listListingDrafts = async (query = {}, currentUser) => {
  let { page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc" } = query;
  page = Math.max(Number(page) || 1, 1);
  limit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const conditions = [];
  const baseFilter = {};
  if (query.status) baseFilter.status = query.status;
  if (query.property) baseFilter.property = query.property;
  if (query.case) baseFilter.case = query.case;
  conditions.push(baseFilter);

  if (isRole(currentUser.role, ROLES.AGENT)) {
    const assignedCaseIds = await Case.distinct("_id", { assignedAgent: currentUser._id });
    conditions.push({ case: { $in: assignedCaseIds } });
  }
  const filter = conditions.length === 1 ? conditions[0] : { $and: conditions };
  const skip = (page - 1) * limit;
  const direction = sortOrder === "asc" ? 1 : -1;
  const [drafts, total] = await Promise.all([
    ListingDraft.find(filter)
      .populate({ path: "case", select: "caseNumber status assignedAgent", populate: { path: "assignedAgent", select: "name email" } })
      .populate("property", "title status verificationStatus")
      .populate("createdBy", "name email")
      .sort({ [sortBy]: direction }).skip(skip).limit(limit),
    ListingDraft.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limit);
  return { drafts, pagination: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
};

module.exports = {
  createListingDraft,
  submitForApproval,
  approveListing,
  getListingDraft,
  listListingDrafts,
};
