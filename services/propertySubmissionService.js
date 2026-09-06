const crypto = require("crypto");
const mongoose = require("mongoose");
const PropertySubmission = require("../models/PropertySubmission");
const Property = require("../models/Property");
const notificationService = require("./notificationService");
const Location = require("../models/Location");
const AppError = require("../utils/AppError");
const { findActivePlatformAdministrators } = require("./adminRecipientService");
const User = require("../models/User");
const EmployeeProfile = require("../models/EmployeeProfile");
const Department = require("../models/Department");
const EMPLOYMENT_STATUS = require("../constants/employmentStatus");
const DEPARTMENT_CODES = require("../constants/departmentCodes");
const { ROLES } = require("../constants/roleCatalogue");
const { PERMISSIONS } = require("../constants/permissions");
const { normalizeRole, isRole, hasPermission, getStoredRoleValuesForCanonicalRole } = require("../utils/rbac");
const auditService = require("./auditService");

const PUBLIC_SUBMISSION_FIELDS = [
  "ownerName", "phone", "email", "title", "description", "askingPrice",
  "listingType", "category", "propertyType", "locationNotListed", "region", "city", "area", "exactLocation",
];

const REFERENCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const generateSubmissionReference = (date = new Date()) => {
  const random = crypto.randomBytes(6);
  const suffix = Array.from(random, (value) => REFERENCE_ALPHABET[value % REFERENCE_ALPHABET.length]).join("");
  return `SR-PS-${date.getFullYear()}-${suffix}`;
};

const isSubmissionReferenceCollision = (error) => error?.code === 11000
  && (error?.keyPattern?.submissionReference || error?.keyValue?.submissionReference);

const createSubmissionWithReference = async (safeData) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await PropertySubmission.create({
        ...safeData,
        submissionReference: generateSubmissionReference(),
      });
    } catch (error) {
      if (!isSubmissionReferenceCollision(error) || attempt === 4) throw error;
    }
  }
  throw new Error("Unable to generate a unique submission reference");
};

const createSubmission = async (submissionData, uploadedImages = []) => {
  const safeData = Object.fromEntries(
    PUBLIC_SUBMISSION_FIELDS.filter((field) => submissionData[field] !== undefined)
      .map((field) => [field, submissionData[field]])
  );
  safeData.locationNotListed = safeData.locationNotListed === true;
  if (safeData.locationNotListed) {
    safeData.region = null;
    safeData.city = null;
    safeData.area = null;
  }
  safeData.images = [...uploadedImages];
  const submission = await createSubmissionWithReference(safeData);

  const generalManagers = await User.find({ isActive: true, role: { $in: getStoredRoleValuesForCanonicalRole(ROLES.GENERAL_MANAGER) } }).select("_id");
  const recipients = generalManagers.length ? generalManagers : await findActivePlatformAdministrators();

  for (const recipient of recipients) {
    await notificationService.createNotification({
      title: "New Property Submission",
      message: `${submission.ownerName} submitted "${submission.title}" for review.`,
      type: "Property",
      recipient: recipient._id,
      relatedPropertySubmission: submission._id,
      relatedProperty: null,
    });
  }

  return submission;
};

const populateWorkflow = (query) => query
  .populate("assignedManager", "name email role isActive")
  .populate("managerAssignedBy", "name email role")
  .populate("assignedAgent", "name email role isActive")
  .populate("agentAssignedBy", "name email role")
  .populate("workflowHistory.actor", "name email role");

const managementFilter = (user) => {
  if (hasPermission(user.role, PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ALL)) return {};
  const role = normalizeRole(user.role);
  if (role === ROLES.OPERATIONS_MANAGER) return { assignedManager: user._id };
  if (role === ROLES.AGENT) return { assignedAgent: user._id };
  throw new AppError("You do not have permission to access Property Submissions.", 403, "FORBIDDEN");
};

const getSubmissions = async (query = {}, user) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const filter = managementFilter(user);
  if (query.status) filter.status = query.status;
  if (query.assignedManager && hasPermission(user.role, PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ALL)) filter.assignedManager = query.assignedManager;
  if (query.assignedAgent && hasPermission(user.role, PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ALL)) filter.assignedAgent = query.assignedAgent;
  if (query.incoming === "true" && hasPermission(user.role, PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ALL)) filter.assignedManager = null;
  if (query.search) {
    const escaped = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = ["submissionReference", "ownerName", "title", "exactLocation"].map((field) => ({ [field]: new RegExp(escaped, "i") }));
  }
  const [submissions, total] = await Promise.all([
    populateWorkflow(PropertySubmission.find(filter)).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    PropertySubmission.countDocuments(filter),
  ]);
  const totalPages = Math.ceil(total / limit);
  return { submissions, pagination: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPreviousPage: page > 1 } };
};

const getSubmissionById = async (id, user) => {
  const submission = await populateWorkflow(PropertySubmission.findOne({ _id: id, ...managementFilter(user) }));
  if (!submission) throw new AppError("Submission not found.", 404, "SUBMISSION_NOT_FOUND");
  return submission;
};

const loadActor = async (actor, session) => {
  const query = User.findById(actor?._id || actor?.id).select("name email role isActive");
  if (session) query.session(session);
  const current = await query;
  if (!current || !current.isActive) throw new AppError("Active staff authentication is required.", 403, "FORBIDDEN");
  return current;
};

const activeProfile = async (userId, session) => {
  const query = EmployeeProfile.findOne({ user: userId, employmentStatus: EMPLOYMENT_STATUS.ACTIVE }).select("user department employmentStatus");
  if (session) query.session(session);
  return query;
};

const activeOperationsDepartment = async (session) => {
  const query = Department.findOne({ code: DEPARTMENT_CODES.OPERATIONS, active: true }).select("_id code active");
  if (session) query.session(session);
  return query;
};

const activeOperationsProfile = async (userId, session) => {
  const department = await activeOperationsDepartment(session);
  if (!department) return null;
  const query = EmployeeProfile.findOne({ user: userId, department: department._id, employmentStatus: EMPLOYMENT_STATUS.ACTIVE }).select("user department employmentStatus");
  if (session) query.session(session);
  return query;
};

const workflowState = (submission) => ({ status: submission.status, assignedManager: submission.assignedManager || null, managerAssignedAt: submission.managerAssignedAt || null, assignedAgent: submission.assignedAgent || null, agentAssignedAt: submission.agentAssignedAt || null });

const listEligibleAssignees = async (kind, actor) => {
  const currentActor = await loadActor(actor);
  if (kind === "manager") {
    if (!hasPermission(currentActor.role, PERMISSIONS.PROPERTY_SUBMISSION_ASSIGN_MANAGER)) throw new AppError("You cannot assign managers.", 403, "FORBIDDEN");
    const department = await activeOperationsDepartment();
    if (!department) return [];
    const profiles = await EmployeeProfile.find({ department: department._id, employmentStatus: EMPLOYMENT_STATUS.ACTIVE }).select("user department").populate("user", "name email role isActive");
    return profiles.filter((profile) => profile.user?.isActive && normalizeRole(profile.user.role) === ROLES.OPERATIONS_MANAGER).map((profile) => ({ _id: profile.user._id, name: profile.user.name, email: profile.user.email, role: profile.user.role, department: profile.department }));
  }
  if (!hasPermission(currentActor.role, PERMISSIONS.PROPERTY_SUBMISSION_ASSIGN_AGENT)) throw new AppError("You cannot assign Agents.", 403, "FORBIDDEN");
  const actorProfile = await activeProfile(currentActor._id);
  const filter = { employmentStatus: EMPLOYMENT_STATUS.ACTIVE };
  if (!hasPermission(currentActor.role, PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ALL)) {
    if (!actorProfile) return [];
    filter.department = actorProfile.department;
  }
  const profiles = await EmployeeProfile.find(filter).select("user department").populate("user", "name email role isActive");
  return profiles.filter((profile) => profile.user?.isActive && isRole(profile.user.role, ROLES.AGENT)).map((profile) => ({ _id: profile.user._id, name: profile.user.name, email: profile.user.email, role: profile.user.role, department: profile.department }));
};

const assignManager = async (id, managerId, actor, request) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const currentActor = await loadActor(actor, session);
      if (!hasPermission(currentActor.role, PERMISSIONS.PROPERTY_SUBMISSION_ASSIGN_MANAGER)) throw new AppError("You cannot assign a Property Submission manager.", 403, "FORBIDDEN");
      const targetQuery = User.findById(managerId).select("name email role isActive").session(session);
      const target = await targetQuery;
      if (!target || !target.isActive || normalizeRole(target.role) !== ROLES.OPERATIONS_MANAGER || !(await activeOperationsProfile(target._id, session))) throw new AppError("Target must be an active eligible Operations Manager in the Operations Department.", 400, "INVALID_ASSIGNMENT_TARGET");
      const submission = await PropertySubmission.findById(id).session(session);
      if (!submission) throw new AppError("Submission not found.", 404, "SUBMISSION_NOT_FOUND");
      const before = workflowState(submission);
      const now = new Date();
      submission.assignedManager = target._id; submission.managerAssignedAt = now; submission.managerAssignedBy = currentActor._id;
      if (before.assignedManager && String(before.assignedManager) !== String(target._id)) {
        submission.assignedAgent = null; submission.agentAssignedAt = null; submission.agentAssignedBy = null;
      }
      submission.workflowHistory.push({ action: before.assignedManager ? "MANAGER_REASSIGNED" : "MANAGER_ASSIGNED", actor: currentActor._id, actorRole: normalizeRole(currentActor.role), from: { assignedManager: before.assignedManager }, to: { assignedManager: target._id } });
      await submission.save({ session });
      await auditService.recordAuditEvent({ actor: currentActor, request, action: before.assignedManager ? "PROPERTY_SUBMISSION_MANAGER_REASSIGNED" : "PROPERTY_SUBMISSION_MANAGER_ASSIGNED", entityType: "PropertySubmission", entityId: submission._id, entityReference: submission.submissionReference, before, after: workflowState(submission), session });
      await notificationService.createNotification({ recipient: target._id, type: "Property", title: "Property Submission Assigned", message: `Property Submission ${submission.submissionReference} has been assigned to you.`, relatedPropertySubmission: submission._id }, { session });
      result = submission._id;
    });
    return getSubmissionById(result, actor);
  } finally { await session.endSession(); }
};

const assignAgent = async (id, agentId, actor, request) => {
  const session = await mongoose.startSession(); let result;
  try {
    await session.withTransaction(async () => {
      const currentActor = await loadActor(actor, session);
      if (!hasPermission(currentActor.role, PERMISSIONS.PROPERTY_SUBMISSION_ASSIGN_AGENT)) throw new AppError("You cannot assign a Property Submission Agent.", 403, "FORBIDDEN");
      const submission = await PropertySubmission.findById(id).session(session);
      if (!submission) throw new AppError("Submission not found.", 404, "SUBMISSION_NOT_FOUND");
      const elevated = hasPermission(currentActor.role, PERMISSIONS.PROPERTY_SUBMISSION_VIEW_ALL);
      if (!elevated && String(submission.assignedManager || "") !== String(currentActor._id)) throw new AppError("You cannot assign an unrelated submission.", 403, "FORBIDDEN");
      const target = await User.findById(agentId).select("name email role isActive").session(session);
      const targetProfile = target ? await activeProfile(target._id, session) : null;
      const actorProfile = await activeProfile(currentActor._id, session);
      if (!target || !target.isActive || !isRole(target.role, ROLES.AGENT) || !targetProfile) throw new AppError("Target must be an active eligible Agent.", 400, "INVALID_ASSIGNMENT_TARGET");
      if (!elevated && (!actorProfile || String(actorProfile.department) !== String(targetProfile.department))) throw new AppError("Agent must belong to the assigning Manager's Department.", 400, "INVALID_ASSIGNMENT_TARGET");
      const before = workflowState(submission); const now = new Date();
      submission.assignedAgent = target._id; submission.agentAssignedAt = now; submission.agentAssignedBy = currentActor._id;
      submission.workflowHistory.push({ action: before.assignedAgent ? "AGENT_REASSIGNED" : "AGENT_ASSIGNED", actor: currentActor._id, actorRole: normalizeRole(currentActor.role), from: { assignedAgent: before.assignedAgent }, to: { assignedAgent: target._id } });
      await submission.save({ session });
      await auditService.recordAuditEvent({ actor: currentActor, request, action: before.assignedAgent ? "PROPERTY_SUBMISSION_AGENT_REASSIGNED" : "PROPERTY_SUBMISSION_AGENT_ASSIGNED", entityType: "PropertySubmission", entityId: submission._id, entityReference: submission.submissionReference, before, after: workflowState(submission), session });
      await notificationService.createNotification({ recipient: target._id, type: "Property", title: "Property Submission Assigned", message: `Property Submission ${submission.submissionReference} has been assigned to you.`, relatedPropertySubmission: submission._id }, { session });
      result = submission._id;
    });
    return getSubmissionById(result, actor);
  } finally { await session.endSession(); }
};

const updateWorkflow = async (id, data, actor, request) => {
  const session = await mongoose.startSession(); let result;
  try {
    await session.withTransaction(async () => {
      const currentActor = await loadActor(actor, session);
      if (!hasPermission(currentActor.role, PERMISSIONS.PROPERTY_SUBMISSION_UPDATE_WORKFLOW)) throw new AppError("You cannot update this workflow.", 403, "FORBIDDEN");
      const submission = await PropertySubmission.findOne({ _id: id, ...managementFilter(currentActor) }).session(session);
      if (!submission) throw new AppError("Submission not found.", 404, "SUBMISSION_NOT_FOUND");
      if (isRole(currentActor.role, ROLES.AGENT) && ["Approved", "Rejected"].includes(data.status)) throw new AppError("Agents cannot approve or reject submissions.", 403, "FORBIDDEN");
      const before = workflowState(submission);
      if (data.status !== undefined) submission.status = data.status;
      if (data.internalNotes !== undefined) submission.internalNotes = data.internalNotes;
      submission.workflowHistory.push({ action: "WORKFLOW_UPDATED", actor: currentActor._id, actorRole: normalizeRole(currentActor.role), from: { status: before.status }, to: { status: submission.status }, note: data.note || "" });
      await submission.save({ session });
      await auditService.recordAuditEvent({ actor: currentActor, request, action: "PROPERTY_SUBMISSION_WORKFLOW_UPDATED", entityType: "PropertySubmission", entityId: submission._id, entityReference: submission.submissionReference, before, after: workflowState(submission), session });
      result = submission._id;
    });
    return getSubmissionById(result, actor);
  } finally { await session.endSession(); }
};

const approveSubmission = async (id, currentUser) => {
  const submission = await PropertySubmission.findById(id);

  if (!submission) {
    throw new AppError(
      "Submission not found",
      404,
      "SUBMISSION_NOT_FOUND"
    );
  }

  if (submission.status === "Approved") {
    throw new AppError(
      "Submission has already been approved.",
      400,
      "SUBMISSION_ALREADY_APPROVED"
    );
  }

  const location = await Location.findOne({
    region: submission.region,
    city: submission.city,
    area: submission.area,
    active: true,
  });

  if (!location) {
    throw new AppError(
      "A matching active location is required before approving this submission.",
      400,
      "LOCATION_NOT_FOUND"
    );
  }

  const property = await Property.create({
    title: submission.title,
    description: submission.description,
    price: submission.askingPrice,
    location: location._id,
    category: submission.category,
    propertyType: submission.propertyType,
    listingType: submission.listingType,
    images: submission.images.map((url) => ({ url })),
    status: "Available",
    createdBy: currentUser._id,
  });

  submission.status = "Approved";
  submission.approvedProperty = property._id;

  await submission.save();

  return property;
};

const rejectSubmission = async (id) => {
  const submission = await PropertySubmission.findById(id);

  if (!submission) {
    throw new Error("Submission not found");
  }

  submission.status = "Rejected";

  await submission.save();

  return submission;
};

module.exports = {
  createSubmission,
  generateSubmissionReference,
  getSubmissions,
  getSubmissionById,
  assignManager,
  assignAgent,
  updateWorkflow,
  listEligibleAssignees,
  approveSubmission,
  rejectSubmission,
};
