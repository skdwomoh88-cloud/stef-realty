const { ROLES, ROLE_ALIASES } = require("../constants/roleCatalogue");
const { ALL_PERMISSIONS } = require("../constants/permissions");
const ROLE_PERMISSIONS = require("../constants/rolePermissions");

const normalizeRole = (role) => {
  if (typeof role !== "string") return null;
  const trimmed = role.trim();
  return ROLE_ALIASES[trimmed] || ROLE_ALIASES[trimmed.toUpperCase()] || null;
};

const isRole = (role, expectedRole) => {
  const normalized = normalizeRole(role);
  const expected = normalizeRole(expectedRole);
  return Boolean(normalized && expected && normalized === expected);
};

const getStoredRoleValuesForCanonicalRoles = (canonicalRoles) => {
  const approved = new Set(
    (Array.isArray(canonicalRoles) ? canonicalRoles : [canonicalRoles])
      .map(normalizeRole)
      .filter(Boolean)
  );
  return [...new Set(Object.entries(ROLE_ALIASES)
    .filter(([, canonical]) => approved.has(canonical))
    .map(([stored]) => stored))];
};

const getStoredRoleValuesForCanonicalRole = (canonicalRole) =>
  getStoredRoleValuesForCanonicalRoles([canonicalRole]);

const isPlatformAdministratorRole = (role) =>
  [ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(normalizeRole(role));

const getPermissionsForRole = (role) => {
  const normalized = normalizeRole(role);
  if (!normalized) return [];
  return [...(ROLE_PERMISSIONS[normalized] || [])];
};

const hasPermission = (role, permission) => {
  if (!ALL_PERMISSIONS.includes(permission)) return false;
  return getPermissionsForRole(role).includes(permission);
};

const rolesWithPermission = (permission) => Object.values(ROLES)
  .filter((role) => hasPermission(role, permission));

const INTERNAL_STAFF_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN, ROLES.GENERAL_MANAGER, ROLES.OPERATIONS_MANAGER,
  ROLES.AGENT, ROLES.CUSTOMER_RELATIONS_MANAGER,
  ROLES.CUSTOMER_RELATIONS_OFFICER, ROLES.FINANCE_MANAGER,
  ROLES.FINANCE_OFFICER, ROLES.MARKETING_MANAGER,
  ROLES.MARKETING_OFFICER, ROLES.HR_MANAGER, ROLES.HR_OFFICER,
  ROLES.AUDITOR, ROLES.ADMIN,
]);

const isInternalStaffRole = (role) => INTERNAL_STAFF_ROLES.includes(normalizeRole(role));

module.exports = {
  normalizeRole,
  isRole,
  getStoredRoleValuesForCanonicalRole,
  getStoredRoleValuesForCanonicalRoles,
  isPlatformAdministratorRole,
  getPermissionsForRole,
  hasPermission,
  rolesWithPermission,
  INTERNAL_STAFF_ROLES,
  isInternalStaffRole,
};
