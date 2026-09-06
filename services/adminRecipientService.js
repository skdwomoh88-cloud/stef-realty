const User = require("../models/User");
const { ROLES } = require("../constants/roleCatalogue");
const { getStoredRoleValuesForCanonicalRoles } = require("../utils/rbac");

const PLATFORM_ADMIN_RECIPIENT_ROLES = Object.freeze([
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
]);

const findActivePlatformAdministrators = async ({ session = null } = {}) => {
  const query = User.find({
    isActive: true,
    role: { $in: getStoredRoleValuesForCanonicalRoles(PLATFORM_ADMIN_RECIPIENT_ROLES) },
  }).select("_id role");
  if (session) query.session(session);
  const users = await query;
  return [...new Map(users.map((user) => [user._id.toString(), user])).values()];
};

module.exports = {
  PLATFORM_ADMIN_RECIPIENT_ROLES,
  findActivePlatformAdministrators,
};
