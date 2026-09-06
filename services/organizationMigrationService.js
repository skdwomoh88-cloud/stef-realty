const mongoose = require("mongoose");
const User = require("../models/User");
const Department = require("../models/Department");
const EmployeeProfile = require("../models/EmployeeProfile");
const AppError = require("../utils/AppError");
const { ROLES, LEGACY_ROLES } = require("../constants/roleCatalogue");
const { SAFE_CORRELATION_ID } = require("../middleware/correlationId");
const auditService = require("./auditService");

const LEGACY_AGENT_MIGRATION_ROUTE = "/internal/migrations/legacy-agent-role";
const legacyAgentConfirmation = (userId) => `MIGRATE_AGENT:${userId}`;
const queryWithSession = (query, session) => {
  if (session) query.session(session);
  return query;
};

const ADMIN_CLASSIFICATION_TARGETS = Object.freeze([
  ROLES.GENERAL_MANAGER, ROLES.OPERATIONS_MANAGER,
  ROLES.CUSTOMER_RELATIONS_MANAGER, ROLES.FINANCE_MANAGER,
  ROLES.MARKETING_MANAGER, ROLES.HR_MANAGER, ROLES.AUDITOR,
]);

const planSuperAdminBootstrap = async ({ candidateUserId } = {}) => {
  if (await User.countDocuments({ role: ROLES.SUPER_ADMIN }) > 0) {
    throw new AppError("A Super Admin already exists.", 409, "SUPER_ADMIN_ALREADY_EXISTS");
  }
  const candidates = await User.find({ role: LEGACY_ROLES.ADMIN, isActive: true }).select("_id name email role isActive");
  if (!candidateUserId && candidates.length !== 1) {
    throw new AppError("Initial Super Admin selection is ambiguous.", 400, "SUPER_ADMIN_SELECTION_AMBIGUOUS");
  }
  const candidate = candidateUserId
    ? candidates.find((user) => user._id.toString() === candidateUserId.toString())
    : candidates[0];
  if (!candidate) throw new AppError("Selected candidate is not an active legacy Admin.", 400, "INVALID_SUPER_ADMIN_CANDIDATE");
  return {
    dryRun: true,
    userId: candidate._id.toString(),
    fromRole: LEGACY_ROLES.ADMIN,
    toRole: ROLES.SUPER_ADMIN,
    confirmation: `PROMOTE:${candidate._id}`,
    rollback: { userId: candidate._id.toString(), fromRole: ROLES.SUPER_ADMIN, toRole: LEGACY_ROLES.ADMIN },
  };
};

const applySuperAdminBootstrap = async (plan, confirmation, context = {}) => {
  if (!plan || confirmation !== plan.confirmation) throw new AppError("Explicit bootstrap confirmation is required.", 400, "BOOTSTRAP_CONFIRMATION_REQUIRED");
  const existingSuperAdmins = await User.countDocuments({ role: ROLES.SUPER_ADMIN });
  if (existingSuperAdmins > 0) throw new AppError("A Super Admin already exists.", 409, "SUPER_ADMIN_ALREADY_EXISTS");
  const user = await User.findOneAndUpdate(
    { _id: plan.userId, role: LEGACY_ROLES.ADMIN, isActive: true },
    { role: ROLES.SUPER_ADMIN },
    { new: true, runValidators: true }
  ).select("_id name email role isActive");
  if (!user) throw new AppError("Bootstrap candidate changed or is unavailable.", 409, "BOOTSTRAP_CANDIDATE_CHANGED");
  await auditService.recordAuditEvent({
    actor: context.actor || user,
    request: context.request,
    action: "SUPER_ADMIN_BOOTSTRAPPED",
    entityType: "User",
    entityId: user._id,
    entityReference: user.email,
    before: { role: LEGACY_ROLES.ADMIN, isActive: user.isActive },
    after: { role: ROLES.SUPER_ADMIN, isActive: user.isActive },
    metadata: { rollback: plan.rollback },
  });
  return user;
};

const planLegacyAdminClassification = async (assignments = []) => {
  if (!Array.isArray(assignments) || assignments.length === 0) throw new AppError("Explicit Admin classifications are required.", 400, "ADMIN_CLASSIFICATION_REQUIRED");
  const ids = assignments.map(({ userId }) => userId);
  const users = await User.find({ _id: { $in: ids }, role: LEGACY_ROLES.ADMIN }).select("_id role");
  const byId = new Map(users.map((user) => [user._id.toString(), user]));
  return assignments.map(({ userId, targetRole }) => {
    if (!byId.has(userId.toString()) || !ADMIN_CLASSIFICATION_TARGETS.includes(targetRole)) {
      throw new AppError("Invalid explicit Admin classification.", 400, "INVALID_ADMIN_CLASSIFICATION");
    }
    return { userId: userId.toString(), fromRole: LEGACY_ROLES.ADMIN, toRole: targetRole };
  });
};

const planLegacyAgentMigration = async () => {
  const agents = await User.find({ role: LEGACY_ROLES.AGENT }).select("_id role");
  return agents.map((user) => ({ userId: user._id.toString(), fromRole: LEGACY_ROLES.AGENT, toRole: ROLES.AGENT, referencedRecordsUnchanged: true }));
};

const planTargetedLegacyAgentMigration = async ({ candidateUserId } = {}) => {
  if (!candidateUserId) {
    throw new AppError("An explicit legacy Agent candidate is required.", 400, "LEGACY_AGENT_CANDIDATE_REQUIRED");
  }
  const user = await User.findById(candidateUserId).select("_id role isActive");
  if (!user) throw new AppError("Legacy Agent candidate not found.", 404, "LEGACY_AGENT_CANDIDATE_NOT_FOUND");
  if (user.role === ROLES.AGENT) {
    throw new AppError("The selected Agent has already been migrated.", 409, "LEGACY_AGENT_ALREADY_MIGRATED");
  }
  if (user.role !== LEGACY_ROLES.AGENT || user.isActive !== true) {
    throw new AppError("The selected User is not an active legacy Agent.", 400, "INVALID_LEGACY_AGENT_CANDIDATE");
  }
  const employee = await EmployeeProfile.findOne({ user: user._id })
    .select("_id employeeNumber department employmentStatus");
  if (!employee || employee.employmentStatus !== "ACTIVE") {
    throw new AppError("The selected Agent requires an active EmployeeProfile.", 400, "INVALID_LEGACY_AGENT_PROFILE");
  }
  const department = await Department.findById(employee.department).select("_id code active");
  if (!department || department.active !== true) {
    throw new AppError("The selected Agent requires an active Department.", 400, "INVALID_LEGACY_AGENT_DEPARTMENT");
  }
  const userId = user._id.toString();
  return {
    dryRun: true,
    userId,
    currentRole: LEGACY_ROLES.AGENT,
    targetRole: ROLES.AGENT,
    isActive: true,
    expectedEmployeeProfile: {
      id: employee._id.toString(),
      employeeNumber: employee.employeeNumber,
      departmentId: department._id.toString(),
      departmentCode: department.code,
      employmentStatus: employee.employmentStatus,
    },
    confirmation: legacyAgentConfirmation(userId),
    rollback: {
      userId,
      currentRole: ROLES.AGENT,
      targetRole: LEGACY_ROLES.AGENT,
      action: "USER_ROLE_CHANGED",
      requiresSeparateApproval: true,
    },
  };
};

const assertTargetedPlan = (plan, confirmation) => {
  const userId = plan?.userId?.toString();
  if (!plan || plan.dryRun !== true || !userId ||
      plan.currentRole !== LEGACY_ROLES.AGENT || plan.targetRole !== ROLES.AGENT ||
      plan.isActive !== true || !plan.expectedEmployeeProfile?.id ||
      !plan.expectedEmployeeProfile?.employeeNumber || !plan.expectedEmployeeProfile?.departmentId ||
      !plan.expectedEmployeeProfile?.departmentCode ||
      plan.expectedEmployeeProfile?.employmentStatus !== "ACTIVE") {
    throw new AppError("A valid targeted legacy Agent migration plan is required.", 400, "INVALID_LEGACY_AGENT_MIGRATION_PLAN");
  }
  if (confirmation !== legacyAgentConfirmation(userId) || confirmation !== plan.confirmation) {
    throw new AppError("Explicit legacy Agent migration confirmation is required.", 400, "LEGACY_AGENT_MIGRATION_CONFIRMATION_REQUIRED");
  }
  return userId;
};

const applyLegacyAgentMigrationTransactional = async (plan, confirmation, { actor, request } = {}) => {
  const userId = assertTargetedPlan(plan, confirmation);
  if ((!actor?._id && !actor?.id) || !request?.correlationId ||
      !SAFE_CORRELATION_ID.test(request.correlationId)) {
    throw new AppError("Trusted actor and correlation ID are required.", 400, "LEGACY_AGENT_MIGRATION_CONTEXT_REQUIRED");
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const currentActor = await queryWithSession(
        User.findById(actor._id || actor.id).select("_id name email role isActive"),
        session
      );
      if (!currentActor || currentActor.role !== ROLES.SUPER_ADMIN || currentActor.isActive !== true) {
        throw new AppError("Only an active current Super Admin may migrate a legacy Agent.", 403, "LEGACY_AGENT_MIGRATION_FORBIDDEN");
      }

      const target = await queryWithSession(
        User.findById(userId).select("_id name email role isActive"),
        session
      );
      if (!target) throw new AppError("Legacy Agent candidate not found.", 404, "LEGACY_AGENT_CANDIDATE_NOT_FOUND");
      if (target.role === ROLES.AGENT) {
        throw new AppError("The selected Agent has already been migrated.", 409, "LEGACY_AGENT_ALREADY_MIGRATED");
      }
      if (target.role !== LEGACY_ROLES.AGENT || target.isActive !== true) {
        throw new AppError("The migration plan is stale.", 409, "LEGACY_AGENT_MIGRATION_STALE");
      }

      const employee = await queryWithSession(
        EmployeeProfile.findOne({ user: target._id }).select("_id employeeNumber department employmentStatus"),
        session
      );
      const expected = plan.expectedEmployeeProfile;
      if (!employee || employee._id.toString() !== expected.id.toString() ||
          employee.employeeNumber !== expected.employeeNumber ||
          employee.department.toString() !== expected.departmentId.toString() ||
          employee.employmentStatus !== "ACTIVE") {
        throw new AppError("The Agent EmployeeProfile no longer matches the approved plan.", 409, "LEGACY_AGENT_PROFILE_CHANGED");
      }

      const department = await queryWithSession(
        Department.findById(employee.department).select("_id code active"),
        session
      );
      if (!department || department._id.toString() !== expected.departmentId.toString() ||
          department.code !== expected.departmentCode || department.active !== true) {
        throw new AppError("The Agent Department no longer matches the approved plan.", 409, "LEGACY_AGENT_DEPARTMENT_CHANGED");
      }

      const updateResult = await User.updateOne(
        { _id: target._id, role: LEGACY_ROLES.AGENT, isActive: true },
        { $set: { role: ROLES.AGENT } },
        { session, runValidators: true }
      );
      if (updateResult.matchedCount !== 1 || updateResult.modifiedCount !== 1) {
        throw new AppError("The conditional legacy Agent role update did not match.", 409, "LEGACY_AGENT_CONDITIONAL_UPDATE_FAILED");
      }

      const operationRequest = {
        correlationId: request.correlationId,
        originalUrl: LEGACY_AGENT_MIGRATION_ROUTE,
        method: "MIGRATE",
      };
      const auditEvent = await auditService.recordAuditEvent({
        actor: currentActor,
        request: operationRequest,
        action: "USER_ROLE_CHANGED",
        entityType: "User",
        entityId: target._id,
        entityReference: target.email,
        before: { role: LEGACY_ROLES.AGENT },
        after: { role: ROLES.AGENT },
        outcome: "SUCCESS",
        session,
      });
      result = {
        user: { _id: target._id, name: target.name, email: target.email, role: ROLES.AGENT, isActive: target.isActive },
        employee,
        department,
        auditEvent,
      };
    });
    return result;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  ADMIN_CLASSIFICATION_TARGETS,
  LEGACY_AGENT_MIGRATION_ROUTE,
  legacyAgentConfirmation,
  planSuperAdminBootstrap,
  applySuperAdminBootstrap,
  planLegacyAdminClassification,
  planLegacyAgentMigration,
  planTargetedLegacyAgentMigration,
  applyLegacyAgentMigrationTransactional,
};
