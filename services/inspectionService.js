const Inspection = require("../models/Inspection");
const Case = require("../models/Case");
const CASE_STATUS = require("../constants/caseStatus");
const INSPECTION_STATUS = require("../constants/inspectionStatus");
const { canTransition } = require("../utils/caseWorkflow");
const AppError = require("../utils/AppError");
const { requireOwnership } = require("../utils/authorization");
const { requireActiveAgent } = require("../utils/assignment");
const { ROLES } = require("../constants/roleCatalogue");
const { isRole } = require("../utils/rbac");

const scheduleInspection = async ({
  caseId,
  property,
  agent,
  scheduledDate,
  notes,
  currentUser,
}) => {
  const existingCase = await Case.findById(caseId);

if (!existingCase) {
  throw new AppError("Case not found", 404, "CASE_NOT_FOUND");
}

requireOwnership(
  existingCase,
  "assignedAgent",
  currentUser,
  "You are not authorized to schedule an inspection for this case."
);

requireOwnership(
  { agent },
  "agent",
  currentUser,
  "Agents can only schedule inspections assigned to themselves."
);

await requireActiveAgent(agent);

  const inspection = await Inspection.create({
    case: caseId,
    property,
    agent,
    scheduledDate,
    notes,
  });

existingCase.status = CASE_STATUS.INSPECTION_SCHEDULED;

  existingCase.history.push({
    status: CASE_STATUS.INSPECTION_SCHEDULED,
    changedBy: currentUser._id,
    notes: "Inspection scheduled",
  });

  await existingCase.save();

  return inspection;
};

const completeInspection = async (
  inspectionId,
  notes,
  currentUser
) => {
  const inspection = await Inspection.findById(inspectionId);

if (!inspection) {
  throw new AppError("Inspection not found", 404, "INSPECTION_NOT_FOUND");
}

requireOwnership(
  inspection,
  "agent",
  currentUser,
  "You are not authorized to complete this inspection."
);

if (inspection.status !== INSPECTION_STATUS.SCHEDULED) {
  throw new Error(
    `Inspection must be "${INSPECTION_STATUS.SCHEDULED}" before it can be completed.`
  );
}

const existingCase = await Case.findById(inspection.case);

if (!existingCase) {
  throw new Error("Case not found");
}

if (
  !canTransition(
    existingCase.status,
    CASE_STATUS.INSPECTION_COMPLETED
  )
) {
  throw new Error(
    `Cannot move case from "${existingCase.status}" to "${CASE_STATUS.INSPECTION_COMPLETED}".`
  );
}

inspection.status = INSPECTION_STATUS.COMPLETED;
inspection.notes = notes;

await inspection.save();

existingCase.status = CASE_STATUS.INSPECTION_COMPLETED;

existingCase.history.push({
  status: CASE_STATUS.INSPECTION_COMPLETED,
  changedBy: currentUser._id,
  notes: "Inspection completed",
});

await existingCase.save();

return inspection;
};

const listInspections = async (query = {}, currentUser) => {
  let { page = 1, limit = 20, sortBy = "scheduledDate", sortOrder = "desc" } = query;
  page = Math.max(Number(page) || 1, 1);
  limit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const filter = {};
  for (const field of ["status", "case", "property", "agent"]) {
    if (query[field] !== undefined) filter[field] = query[field];
  }
  if (query.dateFrom || query.dateTo) {
    filter.scheduledDate = {};
    if (query.dateFrom) filter.scheduledDate.$gte = new Date(query.dateFrom);
    if (query.dateTo) filter.scheduledDate.$lte = new Date(query.dateTo);
  }
  if (isRole(currentUser.role, ROLES.AGENT)) filter.agent = currentUser._id;
  const skip = (page - 1) * limit;
  const direction = sortOrder === "asc" ? 1 : -1;
  const [inspections, total] = await Promise.all([
    Inspection.find(filter)
      .populate("case", "caseNumber status").populate("property", "title status")
      .populate("agent", "name email")
      .sort({ [sortBy]: direction }).skip(skip).limit(limit),
    Inspection.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limit);
  return { inspections, pagination: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
};

module.exports = {
  scheduleInspection,
  completeInspection,
  listInspections,
};
