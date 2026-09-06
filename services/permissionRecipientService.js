const User = require("../models/User");
const { rolesWithPermission, getStoredRoleValuesForCanonicalRoles } = require("../utils/rbac");

const storedValuesForRoles = getStoredRoleValuesForCanonicalRoles;

const findActiveRecipientsWithPermission = (permission) => User.find({
  isActive: true,
  role: { $in: storedValuesForRoles(rolesWithPermission(permission)) },
}).select("_id role");

module.exports = { findActiveRecipientsWithPermission, storedValuesForRoles };
