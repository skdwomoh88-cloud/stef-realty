const User = require("../models/User");
const AppError = require("../utils/AppError");
const auditService = require("./auditService");
const { ROLES } = require("../constants/roleCatalogue");
const { normalizeRole } = require("../utils/rbac");
const { assertRoleAssignmentAllowed } = require("../utils/roleAssignmentPolicy");
const { CANONICAL_STAFF_ASSIGNABLE } = require("../utils/roleAssignmentPolicy");

const safeUser = (user) => ({ _id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive });

const activeSuperAdminCount = () => User.countDocuments({ role: ROLES.SUPER_ADMIN, isActive: true });

const assertNotRemovingLastActiveSuperAdmin = async (user, { nextRole = user.role, nextActive = user.isActive } = {}) => {
  const currentlyActiveSuperAdmin = user.role === ROLES.SUPER_ADMIN && user.isActive === true;
  const remainsActiveSuperAdmin = nextRole === ROLES.SUPER_ADMIN && nextActive === true;
  if (currentlyActiveSuperAdmin && !remainsActiveSuperAdmin && await activeSuperAdminCount() <= 1) {
    throw new AppError("The last active Super Admin cannot be demoted, deactivated, or deleted.", 409, "LAST_SUPER_ADMIN_PROTECTED");
  }
};

const auditSafely = async (event) => {
  try { await auditService.recordAuditEvent(event); } catch (error) {
    if (process.env.NODE_ENV !== "test") console.error(`Audit recording failed: ${error.message}`);
  }
};

const updateRole = async ({ targetUserId, requestedRole, actor, request }) => {
  const user = await User.findById(targetUserId);
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  const before = safeUser(user);
  try {
    if ((actor._id || actor.id).toString() === user._id.toString()) {
      throw new AppError("You cannot change your own role.", 400, "SELF_ROLE_CHANGE_FORBIDDEN");
    }
    assertRoleAssignmentAllowed(actor, requestedRole);
    await assertNotRemovingLastActiveSuperAdmin(user, { nextRole: requestedRole });
    user.role = requestedRole;
    await user.save();
    await auditSafely({ actor, request, action: "USER_ROLE_CHANGED", entityType: "User", entityId: user._id, entityReference: user.email, before: { role: before.role }, after: { role: user.role } });
    return user;
  } catch (error) {
    if (["ROLE_ASSIGNMENT_FORBIDDEN", "USER_ROLE_MANAGE_FORBIDDEN", "LAST_SUPER_ADMIN_PROTECTED"].includes(error.code)) {
      await auditSafely({ actor, request, action: "USER_ROLE_CHANGE_REJECTED", entityType: "User", entityId: user._id, entityReference: user.email, before: { role: before.role }, after: { requestedRole }, outcome: "FAILURE", metadata: { errorCode: error.code } });
    }
    throw error;
  }
};

const updateStatus = async ({ targetUserId, isActive, actor, request }) => {
  const user = await User.findById(targetUserId);
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  const before = { isActive: user.isActive };
  try {
    if ((actor._id || actor.id).toString() === user._id.toString() && isActive === false) {
      throw new AppError("You cannot deactivate your own account.", 400, "SELF_DEACTIVATION_FORBIDDEN");
    }
    await assertNotRemovingLastActiveSuperAdmin(user, { nextActive: isActive });
    user.isActive = isActive;
    await user.save();
    await auditSafely({ actor, request, action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED", entityType: "User", entityId: user._id, entityReference: user.email, before, after: { isActive: user.isActive } });
    return user;
  } catch (error) {
    if (["SELF_DEACTIVATION_FORBIDDEN", "LAST_SUPER_ADMIN_PROTECTED"].includes(error.code)) {
      await auditSafely({ actor, request, action: "USER_STATUS_CHANGE_REJECTED", entityType: "User", entityId: user._id, entityReference: user.email, before, after: { requestedIsActive: isActive }, outcome: "FAILURE", metadata: { errorCode: error.code } });
    }
    throw error;
  }
};

const getRoleDirectory = (actor) => {
  const actorRole = normalizeRole(actor?.role);
  const labels = {
    [ROLES.SUPER_ADMIN]: "Super Admin", [ROLES.GENERAL_MANAGER]: "General Manager",
    [ROLES.OPERATIONS_MANAGER]: "Operations Manager", [ROLES.AGENT]: "Agent",
    [ROLES.CUSTOMER_RELATIONS_MANAGER]: "Customer Relations Manager", [ROLES.CUSTOMER_RELATIONS_OFFICER]: "Customer Relations Officer",
    [ROLES.FINANCE_MANAGER]: "Finance Manager", [ROLES.FINANCE_OFFICER]: "Finance Officer",
    [ROLES.MARKETING_MANAGER]: "Marketing Manager", [ROLES.MARKETING_OFFICER]: "Marketing Officer",
    [ROLES.HR_MANAGER]: "HR Manager", [ROLES.HR_OFFICER]: "HR Officer", [ROLES.AUDITOR]: "Auditor",
    [ROLES.OWNER]: "Owner", [ROLES.CUSTOMER]: "Customer", [ROLES.ADMIN]: "Legacy Admin",
  };
  return Object.values(ROLES).map((role) => ({
    role,
    label: labels[role] || role,
    assignable: actorRole === ROLES.SUPER_ADMIN && (role === ROLES.SUPER_ADMIN || CANONICAL_STAFF_ASSIGNABLE.includes(role)),
    transitional: role === ROLES.ADMIN,
  }));
};

module.exports = { safeUser, activeSuperAdminCount, assertNotRemovingLastActiveSuperAdmin, updateRole, updateStatus, getRoleDirectory };
