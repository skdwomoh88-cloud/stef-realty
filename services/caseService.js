const Case = require("../models/Case");
const CASE_STATUS = require("../constants/caseStatus");
const generateCaseNumber = require("../utils/generateCaseNumber");
const AppError = require("../utils/AppError");
const { ROLES } = require("../constants/roleCatalogue");
const { isRole } = require("../utils/rbac");
const { requireOwnership } = require("../utils/authorization");
const { requireActiveAgent } = require("../utils/assignment");

const createCase = async ({
  owner,
  property,
  createdBy,
  assignedAgent = null,
  priority,
  source,
  notes,
}) => {
  if (isRole(createdBy.role, ROLES.OWNER)) {
    owner = createdBy._id;
  }

  if (assignedAgent) {
    await requireActiveAgent(assignedAgent);
  }

  const caseNumber = await generateCaseNumber(Case);

  const newCase = await Case.create({
    caseNumber,
    owner,
    property,
    createdBy: createdBy._id,
    assignedAgent,
    priority,
    source,
    notes,

    history: [
      {
        status: CASE_STATUS.NEW_LEAD,
        changedBy: createdBy._id,
        notes: "Case created",
      },
    ],
  });

  return newCase;
};

const getCase = async (caseId, currentUser) => {
  const existingCase = await Case.findById(caseId)
    .populate("owner", "name email")
    .populate("assignedAgent", "name email")
    .populate("property");

  if (!existingCase) {
    throw new AppError("Case not found", 404, "CASE_NOT_FOUND");
  }

  if (isRole(currentUser.role, ROLES.AGENT)) {
    requireOwnership(existingCase, "assignedAgent", currentUser);
  } else if (isRole(currentUser.role, ROLES.OWNER)) {
    requireOwnership(existingCase, "owner", currentUser);
  }

  return existingCase;
};

const assignAgent = async (caseId, agentId, userId) => {
  const existingCase = await Case.findById(caseId);

  if (!existingCase) {
    throw new Error("Case not found");
  }

  await requireActiveAgent(agentId);

  existingCase.assignedAgent = agentId;
  existingCase.status = CASE_STATUS.OWNER_CONTACTED;

  existingCase.history.push({
    status: CASE_STATUS.OWNER_CONTACTED,
    changedBy: userId,
    notes: "Agent assigned",
  });

  await existingCase.save();

  return existingCase;
};

const listCases = async (query = {}, currentUser) => {
  let { page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc" } = query;
  page = Math.max(Number(page) || 1, 1);
  limit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const filter = {};
  for (const field of ["status", "priority", "assignedAgent", "owner", "property"]) {
    if (query[field] !== undefined) filter[field] = query[field];
  }
  if (isRole(currentUser.role, ROLES.AGENT)) filter.assignedAgent = currentUser._id;
  if (isRole(currentUser.role, ROLES.OWNER)) filter.owner = currentUser._id;
  const skip = (page - 1) * limit;
  const direction = sortOrder === "asc" ? 1 : -1;
  const [cases, total] = await Promise.all([
    Case.find(filter).select("-history")
      .populate("owner", "name email").populate("assignedAgent", "name email")
      .populate("property", "title status verificationStatus")
      .sort({ [sortBy]: direction }).skip(skip).limit(limit),
    Case.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limit);
  return { cases, pagination: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
};

module.exports = {
  createCase,
  getCase,
  assignAgent,
  listCases,
};
