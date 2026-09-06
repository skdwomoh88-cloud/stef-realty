const crypto = require("crypto");
const mongoose = require("mongoose");
const Department = require("../models/Department");
const User = require("../models/User");
const DEPARTMENT_CODES = require("../constants/departmentCodes");
const { ROLES } = require("../constants/roleCatalogue");
const { normalizeRole } = require("../utils/rbac");
const AppError = require("../utils/AppError");
const auditService = require("./auditService");
const { SAFE_CORRELATION_ID } = require("../middleware/correlationId");

const INITIAL_DEPARTMENTS = Object.freeze([
  { code: DEPARTMENT_CODES.EXECUTIVE, name: "Executive", parentCode: null, active: true, manager: null },
  { code: DEPARTMENT_CODES.OPERATIONS, name: "Operations", parentCode: DEPARTMENT_CODES.EXECUTIVE, active: true, manager: null },
  { code: DEPARTMENT_CODES.CUSTOMER_RELATIONS, name: "Customer Relations", parentCode: DEPARTMENT_CODES.EXECUTIVE, active: true, manager: null },
  { code: DEPARTMENT_CODES.FINANCE, name: "Finance", parentCode: DEPARTMENT_CODES.EXECUTIVE, active: true, manager: null },
  { code: DEPARTMENT_CODES.MARKETING, name: "Marketing", parentCode: DEPARTMENT_CODES.EXECUTIVE, active: true, manager: null },
  { code: DEPARTMENT_CODES.HUMAN_RESOURCES, name: "Human Resources", parentCode: DEPARTMENT_CODES.EXECUTIVE, active: true, manager: null },
  { code: DEPARTMENT_CODES.AUDIT, name: "Audit", parentCode: DEPARTMENT_CODES.EXECUTIVE, active: true, manager: null },
  { code: DEPARTMENT_CODES.TRANSPORT, name: "Transport", parentCode: DEPARTMENT_CODES.EXECUTIVE, active: true, manager: null },
]);

const sameId = (left, right) => String(left || "") === String(right || "");

const buildActions = (existing) => {
  const byCode = new Map(existing.map((department) => [department.code, department]));
  return {
    byCode,
    actions: INITIAL_DEPARTMENTS.map((definition) => {
      const current = byCode.get(definition.code);
      let action = "create";
      if (current) {
        const expectedParent = definition.parentCode ? byCode.get(definition.parentCode)?._id : null;
        const matches = current.name === definition.name &&
          sameId(current.parentDepartment, expectedParent) &&
          current.active === definition.active;
        action = matches ? "unchanged" : "conflict";
      }
      return { action, ...definition };
    }),
  };
};

const seedQuery = (session = null) => {
  const query = Department.find({
    code: { $in: INITIAL_DEPARTMENTS.map(({ code }) => code) },
  }).select("_id code name parentDepartment active manager");
  if (session) query.session(session);
  return query;
};

const validateExecutionContext = async ({ actor, request, session }) => {
  if (!actor?._id && !actor?.id) {
    throw new AppError("A trusted seed actor is required.", 400, "SEED_AUDIT_CONTEXT_REQUIRED");
  }
  if (!request?.correlationId || !SAFE_CORRELATION_ID.test(request.correlationId)) {
    throw new AppError("A valid seed operation correlation ID is required.", 400, "SEED_AUDIT_CONTEXT_REQUIRED");
  }
  const query = User.findById(actor._id || actor.id).select("_id name email role isActive");
  if (session) query.session(session);
  const currentActor = await query;
  if (!currentActor || currentActor.isActive !== true || normalizeRole(currentActor.role) !== ROLES.SUPER_ADMIN) {
    throw new AppError("Only an active Super Admin may initialize Departments.", 403, "DEPARTMENT_SEED_FORBIDDEN");
  }
  return currentActor;
};

const createInSession = async (data, session) => {
  const department = new Department(data);
  department.$session(session);
  await department.save({ session });
  return department;
};

const initializeDepartments = async ({ dryRun = true, actor, request } = {}) => {
  if (dryRun) {
    const existing = await seedQuery();
    const { actions } = buildActions(existing);
    return {
      dryRun: true,
      actions,
      creates: actions.filter(({ action }) => action === "create").length,
      unchanged: actions.filter(({ action }) => action === "unchanged").length,
      conflicts: actions.filter(({ action }) => action === "conflict").length,
    };
  }

  if ((!actor?._id && !actor?.id) || !request?.correlationId) {
    throw new AppError("Trusted actor and operation context are required for Department initialization.", 400, "SEED_AUDIT_CONTEXT_REQUIRED");
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const currentActor = await validateExecutionContext({ actor, request, session });
      const existing = await seedQuery(session);
      const { actions, byCode } = buildActions(existing);
      if (actions.some(({ action }) => action === "conflict")) {
        throw new AppError("Existing Department definitions conflict with the approved initializer.", 409, "DEPARTMENT_SEED_CONFLICT");
      }
      const operationRequest = {
        correlationId: request.correlationId,
        originalUrl: "/internal/seed/departments",
        method: "SEED",
      };

      for (const action of actions.filter(({ action: value }) => value === "create")) {
        const department = await createInSession({
          code: action.code,
          name: action.name,
          parentDepartment: action.parentCode ? byCode.get(action.parentCode)?._id || null : null,
          manager: action.manager,
          active: action.active,
        }, session);
        byCode.set(department.code, department);
        await auditService.recordAuditEvent({
          actor: currentActor,
          request: operationRequest,
          action: "DEPARTMENT_CREATED",
          entityType: "Department",
          entityId: department._id,
          entityReference: department.code,
          outcome: "SUCCESS",
          after: {
            code: department.code,
            name: department.name,
            parentDepartment: department.parentDepartment,
            active: department.active,
            manager: department.manager,
          },
          metadata: { operation: "INITIAL_DEPARTMENT_SEED" },
          session,
        });
      }
      result = {
        dryRun: false,
        actions,
        creates: actions.filter(({ action }) => action === "create").length,
        unchanged: actions.filter(({ action }) => action === "unchanged").length,
        conflicts: 0,
      };
    });
    return result;
  } finally {
    await session.endSession();
  }
};

const createSeedOperationContext = (actor) => ({
  actor,
  request: {
    correlationId: `department-seed-${crypto.randomUUID()}`,
    originalUrl: "/internal/seed/departments",
    method: "SEED",
  },
});

module.exports = { INITIAL_DEPARTMENTS, initializeDepartments, createSeedOperationContext };
