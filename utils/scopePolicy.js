const AppError = require("./AppError");
const { ROLES } = require("../constants/roleCatalogue");
const { normalizeRole } = require("./rbac");

const SCOPE_LEVELS = Object.freeze({ OWN: "OWN", TEAM: "TEAM", DEPARTMENT: "DEPARTMENT", ALL: "ALL", NONE: "NONE" });

const getConceptualScope = (role) => {
  const normalized = normalizeRole(role);
  if ([ROLES.SUPER_ADMIN, ROLES.GENERAL_MANAGER].includes(normalized)) return SCOPE_LEVELS.ALL;
  if ([ROLES.OPERATIONS_MANAGER, ROLES.CUSTOMER_RELATIONS_MANAGER, ROLES.FINANCE_MANAGER, ROLES.MARKETING_MANAGER, ROLES.HR_MANAGER].includes(normalized)) return SCOPE_LEVELS.DEPARTMENT;
  if ([ROLES.AGENT, ROLES.CUSTOMER_RELATIONS_OFFICER, ROLES.FINANCE_OFFICER, ROLES.MARKETING_OFFICER, ROLES.HR_OFFICER].includes(normalized)) return SCOPE_LEVELS.OWN;
  if (normalized === ROLES.AUDITOR) return SCOPE_LEVELS.ALL;
  return SCOPE_LEVELS.NONE;
};

const getOrganizationScopeContext = async (user) => {
  const organizationService = require("../services/organizationService");
  const level = getConceptualScope(user?.role);
  const department = user?._id ? await organizationService.getDepartmentForUser(user._id) : null;
  const managedUserIds = level === SCOPE_LEVELS.DEPARTMENT && user?._id
    ? await organizationService.getManagedUserIds(user._id)
    : [];
  return { level, department, managedUserIds };
};

const DOMAIN_POLICIES = Object.freeze({
  TASK: Object.freeze({ ownerField: "assignedAgent" }),
  INQUIRY: Object.freeze({ ownerField: "assignedAgent" }),
  VIEWING_REQUEST: Object.freeze({ ownerField: "assignedAgent" }),
  OFFER: Object.freeze({ ownerField: "assignedAgent" }),
  DEAL: Object.freeze({ ownerField: "assignedAgent" }),
  CASE: Object.freeze({ ownerField: "assignedAgent", externalOwnerField: "owner" }),
  INSPECTION: Object.freeze({ ownerField: "agent" }),
});

const valueId = (value) => value?._id || value;
const sameId = (left, right) => Boolean(left && right && valueId(left).toString() === valueId(right).toString());

const scopeQuery = (domain, user) => {
  const policy = DOMAIN_POLICIES[domain];
  if (!policy || !user) return { _id: null };
  const role = normalizeRole(user.role);
  if (role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN) return {};
  if (role === ROLES.AGENT) return { [policy.ownerField]: user._id };
  if (role === ROLES.OWNER && policy.externalOwnerField) return { [policy.externalOwnerField]: user._id };
  return { _id: null };
};

const assertRecordAccess = (domain, action, record, user) => {
  const policy = DOMAIN_POLICIES[domain];
  if (!policy || !record || !user) throw new AppError("You are not authorized to access this resource.", 403, "FORBIDDEN");
  const role = normalizeRole(user.role);
  if (role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN) return true;
  if (role === ROLES.AGENT && sameId(record[policy.ownerField], user._id)) return true;
  if (role === ROLES.OWNER && policy.externalOwnerField && sameId(record[policy.externalOwnerField], user._id)) return true;
  throw new AppError("You are not authorized to access this resource.", 403, "FORBIDDEN");
};

module.exports = { SCOPE_LEVELS, DOMAIN_POLICIES, getConceptualScope, getOrganizationScopeContext, scopeQuery, assertRecordAccess };
