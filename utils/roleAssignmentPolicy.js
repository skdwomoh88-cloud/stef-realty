const AppError = require("./AppError");
const { ROLES, LEGACY_ROLES } = require("../constants/roleCatalogue");
const { normalizeRole, hasPermission } = require("./rbac");
const { PERMISSIONS } = require("../constants/permissions");

const CANONICAL_STAFF_ASSIGNABLE = Object.freeze([
  ROLES.GENERAL_MANAGER, ROLES.OPERATIONS_MANAGER, ROLES.AGENT,
  ROLES.CUSTOMER_RELATIONS_MANAGER, ROLES.CUSTOMER_RELATIONS_OFFICER,
  ROLES.FINANCE_MANAGER, ROLES.FINANCE_OFFICER, ROLES.MARKETING_MANAGER,
  ROLES.MARKETING_OFFICER, ROLES.HR_MANAGER, ROLES.HR_OFFICER, ROLES.AUDITOR,
]);
const LEGACY_ASSIGNABLE = Object.freeze([LEGACY_ROLES.AGENT, LEGACY_ROLES.OWNER, LEGACY_ROLES.CUSTOMER]);

const assertRoleAssignmentAllowed = (actor, requestedRole) => {
  const actorRole = normalizeRole(actor?.role);
  if (!actorRole || !hasPermission(actor.role, PERMISSIONS.USER_ROLE_MANAGE)) {
    throw new AppError("You are not authorized to manage security roles.", 403, "USER_ROLE_MANAGE_FORBIDDEN");
  }
  if (actorRole === ROLES.SUPER_ADMIN) {
    if (requestedRole === ROLES.SUPER_ADMIN || CANONICAL_STAFF_ASSIGNABLE.includes(requestedRole)) return true;
    throw new AppError("The requested role is not assignable.", 400, "ROLE_NOT_ASSIGNABLE");
  }
  if (actorRole === ROLES.ADMIN && LEGACY_ASSIGNABLE.includes(requestedRole)) return true;
  throw new AppError("You are not authorized to assign this role.", 403, "ROLE_ASSIGNMENT_FORBIDDEN");
};

module.exports = { CANONICAL_STAFF_ASSIGNABLE, LEGACY_ASSIGNABLE, assertRoleAssignmentAllowed };
