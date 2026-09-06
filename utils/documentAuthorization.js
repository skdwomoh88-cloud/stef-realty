const { ROLES } = require("../constants/roleCatalogue");
const { isRole, isPlatformAdministratorRole } = require("./rbac");
const AppError = require("./AppError");
const Property = require("../models/Property");
const Inquiry = require("../models/Inquiry");
const ViewingRequest = require("../models/ViewingRequest");
const Offer = require("../models/Offer");
const Deal = require("../models/Deal");
const Task = require("../models/Task");
const Case = require("../models/Case");
const Inspection = require("../models/Inspection");
const ListingDraft = require("../models/ListingDraft");

const RELATED_RESOURCES = Object.freeze({
  relatedProperty: { model: Property, ownership: ["createdBy", "assignedAgent"] },
  relatedInquiry: { model: Inquiry, ownership: ["assignedAgent"] },
  relatedViewingRequest: { model: ViewingRequest, ownership: ["assignedAgent"] },
  relatedOffer: { model: Offer, ownership: ["assignedAgent"] },
  relatedDeal: { model: Deal, ownership: ["assignedAgent"] },
  relatedTask: { model: Task, ownership: ["assignedAgent"] },
  relatedCase: { model: Case, ownership: ["assignedAgent"] },
  relatedInspection: { model: Inspection, ownership: ["agent"] },
  relatedListingDraft: { model: ListingDraft, ownership: ["createdBy"], viaCase: true },
});

const valueId = (value) => value?._id || value;
const equalsUser = (value, userId) => value && valueId(value).toString() === userId.toString();

const requireRelatedRecordAccess = async (field, id, currentUser) => {
  const config = RELATED_RESOURCES[field];
  const record = await config.model.findById(id);
  if (!record) {
    throw new AppError("Related record not found.", 404, "RELATED_RECORD_NOT_FOUND");
  }

  if (isPlatformAdministratorRole(currentUser.role)) return record;
  if (!isRole(currentUser.role, ROLES.AGENT)) {
    throw new AppError("Document access is restricted.", 403, "DOCUMENT_FORBIDDEN");
  }

  let authorized = config.ownership.some((ownerField) =>
    equalsUser(record[ownerField], currentUser._id)
  );

  if (config.viaCase) {
    const relatedCase = await Case.findById(valueId(record.case));
    authorized = Boolean(relatedCase) && equalsUser(relatedCase.assignedAgent, currentUser._id);
  }

  if (!authorized) {
    throw new AppError(
      "You are not authorized to access documents for this record.",
      403,
      "DOCUMENT_FORBIDDEN"
    );
  }
  return record;
};

const requireDocumentRelationshipAccess = async (document, currentUser) => {
  if (!isPlatformAdministratorRole(currentUser.role) && !isRole(currentUser.role, ROLES.AGENT)) {
    throw new AppError("Document access is restricted.", 403, "DOCUMENT_FORBIDDEN");
  }

  const supplied = Object.keys(RELATED_RESOURCES).filter((field) => document[field]);
  if (supplied.length === 0 && !isPlatformAdministratorRole(currentUser.role)) {
    throw new AppError("Document access is restricted.", 403, "DOCUMENT_FORBIDDEN");
  }
  for (const field of supplied) {
    await requireRelatedRecordAccess(field, valueId(document[field]), currentUser);
  }
  return true;
};

const buildAgentDocumentScope = async (agentId) => {
  const owner = agentId;
  const [properties, inquiries, viewings, offers, deals, tasks, cases, inspections] =
    await Promise.all([
      Property.distinct("_id", { $or: [{ createdBy: owner }, { assignedAgent: owner }] }),
      Inquiry.distinct("_id", { assignedAgent: owner }),
      ViewingRequest.distinct("_id", { assignedAgent: owner }),
      Offer.distinct("_id", { assignedAgent: owner }),
      Deal.distinct("_id", { assignedAgent: owner }),
      Task.distinct("_id", { assignedAgent: owner }),
      Case.distinct("_id", { assignedAgent: owner }),
      Inspection.distinct("_id", { agent: owner }),
    ]);
  const drafts = await ListingDraft.distinct("_id", { case: { $in: cases } });
  const ids = {
    relatedProperty: properties,
    relatedInquiry: inquiries,
    relatedViewingRequest: viewings,
    relatedOffer: offers,
    relatedDeal: deals,
    relatedTask: tasks,
    relatedCase: cases,
    relatedInspection: inspections,
    relatedListingDraft: drafts,
  };

  return {
    $and: [
      ...Object.entries(ids).map(([field, allowed]) => ({
        $or: [{ [field]: null }, { [field]: { $in: allowed } }],
      })),
      { $or: Object.entries(ids).map(([field, allowed]) => ({ [field]: { $in: allowed } })) },
    ],
  };
};

module.exports = {
  RELATED_RESOURCES,
  requireDocumentRelationshipAccess,
  buildAgentDocumentScope,
};
