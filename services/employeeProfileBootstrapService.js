const mongoose = require("mongoose");
const User = require("../models/User");
const Department = require("../models/Department");
const EmployeeProfile = require("../models/EmployeeProfile");
const AppError = require("../utils/AppError");
const { ROLES } = require("../constants/roleCatalogue");
const { normalizeRole, isInternalStaffRole } = require("../utils/rbac");
const { SAFE_CORRELATION_ID } = require("../middleware/correlationId");
const sequenceService = require("./sequenceService");
const auditService = require("./auditService");

const EMPLOYEE_SEQUENCE_NAME = "employee";
const FIRST_EMPLOYEE_SEQUENCE = 1;
const formatEmployeeNumber = (value) => `EMP-${String(value).padStart(6, "0")}`;
const GENERAL_EMPLOYEE_PROFILE_ROUTE = "/internal/organization/employee-profiles";

const queryWithSession = (query, session) => {
  if (session) query.session(session);
  return query;
};

const assertContext = ({ actor, request }) => {
  if ((!actor?._id && !actor?.id) || !request?.correlationId || !SAFE_CORRELATION_ID.test(request.correlationId)) {
    throw new AppError("Trusted actor and operation correlation ID are required.", 400, "EMPLOYEE_BOOTSTRAP_CONTEXT_REQUIRED");
  }
};

const createFirstEmployeeProfile = async ({ actor, request, userId, departmentId, profile }) => {
  assertContext({ actor, request });
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const currentActor = await queryWithSession(
        User.findById(actor._id || actor.id).select("_id name email role isActive"),
        session
      );
      if (!currentActor || currentActor.isActive !== true || normalizeRole(currentActor.role) !== ROLES.SUPER_ADMIN) {
        throw new AppError("Only an active Super Admin may bootstrap an EmployeeProfile.", 403, "EMPLOYEE_BOOTSTRAP_FORBIDDEN");
      }

      const targetUser = await queryWithSession(
        User.findById(userId).select("_id name email role isActive"),
        session
      );
      if (!targetUser || targetUser.isActive !== true || !isInternalStaffRole(targetUser.role)) {
        throw new AppError("The target must be an active internal staff User.", 400, "INVALID_EMPLOYEE_USER");
      }

      const department = await queryWithSession(
        Department.findById(departmentId).select("_id code name active"),
        session
      );
      if (!department || department.active !== true) {
        throw new AppError("The target Department must be active.", 400, "INVALID_EMPLOYEE_DEPARTMENT");
      }

      const existingForUser = await queryWithSession(
        EmployeeProfile.findOne({ user: targetUser._id }).select("_id employeeNumber"),
        session
      );
      if (existingForUser) {
        throw new AppError("An EmployeeProfile already exists for this User.", 409, "EMPLOYEE_PROFILE_ALREADY_EXISTS");
      }

      const approvedEmployeeNumber = formatEmployeeNumber(FIRST_EMPLOYEE_SEQUENCE);
      const existingNumber = await queryWithSession(
        EmployeeProfile.findOne({ employeeNumber: approvedEmployeeNumber }).select("_id user"),
        session
      );
      if (existingNumber) {
        throw new AppError("The approved employee number is already assigned.", 409, "EMPLOYEE_NUMBER_ALREADY_EXISTS");
      }

      const nextSequence = await sequenceService.getNextSequence(EMPLOYEE_SEQUENCE_NAME, { session });
      if (nextSequence !== FIRST_EMPLOYEE_SEQUENCE) {
        throw new AppError("The first employee sequence value is no longer available.", 409, "EMPLOYEE_SEQUENCE_MISMATCH");
      }

      const employee = new EmployeeProfile({
        user: targetUser._id,
        employeeNumber: approvedEmployeeNumber,
        department: department._id,
        jobTitle: profile.jobTitle,
        reportsTo: profile.reportsTo ?? null,
        employmentType: profile.employmentType,
        startDate: profile.startDate,
        endDate: profile.endDate ?? null,
        employmentStatus: profile.employmentStatus,
      });
      employee.$session(session);
      await employee.save({ session });

      const operationRequest = {
        correlationId: request.correlationId,
        originalUrl: "/internal/bootstrap/employee-profiles",
        method: "CREATE",
      };
      const safeAfter = {
        user: employee.user,
        employeeNumber: employee.employeeNumber,
        department: employee.department,
        jobTitle: employee.jobTitle,
        reportsTo: employee.reportsTo,
        employmentType: employee.employmentType,
        startDate: employee.startDate,
        endDate: employee.endDate,
        employmentStatus: employee.employmentStatus,
      };
      const auditEvent = await auditService.recordAuditEvent({
        actor: currentActor,
        request: operationRequest,
        action: "EMPLOYEE_PROFILE_CREATED",
        entityType: "EmployeeProfile",
        entityId: employee._id,
        entityReference: employee.employeeNumber,
        outcome: "SUCCESS",
        after: safeAfter,
        metadata: { operation: "FIRST_EMPLOYEE_PROFILE_BOOTSTRAP" },
        session,
      });
      result = { employee, auditEvent };
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const createEmployeeProfileTransactional = async ({
  actor,
  request,
  userId,
  departmentId,
  profile = {},
  expectedNextSequenceValue,
}) => {
  assertContext({ actor, request });
  if (expectedNextSequenceValue !== undefined &&
      (!Number.isSafeInteger(expectedNextSequenceValue) || expectedNextSequenceValue < 1)) {
    throw new AppError(
      "Expected employee sequence value must be a positive integer.",
      400,
      "INVALID_EXPECTED_EMPLOYEE_SEQUENCE"
    );
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const currentActor = await queryWithSession(
        User.findById(actor._id || actor.id).select("_id name email role isActive"),
        session
      );
      if (!currentActor || currentActor.isActive !== true || normalizeRole(currentActor.role) !== ROLES.SUPER_ADMIN) {
        throw new AppError(
          "Only an active Super Admin may create an EmployeeProfile.",
          403,
          "EMPLOYEE_PROFILE_CREATE_FORBIDDEN"
        );
      }

      const targetUser = await queryWithSession(
        User.findById(userId).select("_id name email role isActive"),
        session
      );
      if (!targetUser || targetUser.isActive !== true || !isInternalStaffRole(targetUser.role)) {
        throw new AppError(
          "The target must be an active internal staff User.",
          400,
          "INVALID_EMPLOYEE_USER"
        );
      }

      const department = await queryWithSession(
        Department.findById(departmentId).select("_id code name active manager"),
        session
      );
      if (!department || department.active !== true) {
        throw new AppError(
          "The target Department must be active.",
          400,
          "INVALID_EMPLOYEE_DEPARTMENT"
        );
      }

      const existingForUser = await queryWithSession(
        EmployeeProfile.findOne({ user: targetUser._id }).select("_id employeeNumber"),
        session
      );
      if (existingForUser) {
        throw new AppError(
          "An EmployeeProfile already exists for this User.",
          409,
          "EMPLOYEE_PROFILE_ALREADY_EXISTS"
        );
      }

      const employee = new EmployeeProfile({
        user: targetUser._id,
        employeeNumber: "EMP-000000",
        department: department._id,
        jobTitle: profile.jobTitle,
        reportsTo: profile.reportsTo ?? null,
        employmentType: profile.employmentType,
        startDate: profile.startDate,
        endDate: profile.endDate ?? null,
        employmentStatus: profile.employmentStatus,
      });
      employee.$session(session);
      await employee.validate();

      const nextSequence = await sequenceService.getNextSequence(EMPLOYEE_SEQUENCE_NAME, { session });
      if (expectedNextSequenceValue !== undefined && nextSequence !== expectedNextSequenceValue) {
        throw new AppError(
          "The employee sequence did not match the approved next value.",
          409,
          "EMPLOYEE_SEQUENCE_MISMATCH"
        );
      }
      if (!Number.isSafeInteger(nextSequence) || nextSequence < 1) {
        throw new AppError(
          "The employee sequence returned an invalid value.",
          500,
          "EMPLOYEE_SEQUENCE_INVALID"
        );
      }

      employee.employeeNumber = formatEmployeeNumber(nextSequence);
      await employee.save({ session });

      const operationRequest = {
        correlationId: request.correlationId,
        originalUrl: GENERAL_EMPLOYEE_PROFILE_ROUTE,
        method: "CREATE",
      };
      const safeAfter = {
        user: employee.user,
        employeeNumber: employee.employeeNumber,
        department: employee.department,
        jobTitle: employee.jobTitle,
        reportsTo: employee.reportsTo,
        employmentType: employee.employmentType,
        startDate: employee.startDate,
        endDate: employee.endDate,
        employmentStatus: employee.employmentStatus,
      };
      const auditEvent = await auditService.recordAuditEvent({
        actor: currentActor,
        request: operationRequest,
        action: "EMPLOYEE_PROFILE_CREATED",
        entityType: "EmployeeProfile",
        entityId: employee._id,
        entityReference: employee.employeeNumber,
        outcome: "SUCCESS",
        after: safeAfter,
        metadata: { operation: "EMPLOYEE_PROFILE_TRANSACTIONAL_CREATE" },
        session,
      });
      result = { employee, auditEvent };
    });
    return result;
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError(
        "An EmployeeProfile or employee number already exists.",
        409,
        "EMPLOYEE_PROFILE_DUPLICATE"
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  EMPLOYEE_SEQUENCE_NAME,
  FIRST_EMPLOYEE_SEQUENCE,
  GENERAL_EMPLOYEE_PROFILE_ROUTE,
  formatEmployeeNumber,
  createFirstEmployeeProfile,
  createEmployeeProfileTransactional,
};
