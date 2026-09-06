const AppError = require("../utils/AppError");
const { normalizeRole, isPlatformAdministratorRole } = require("./rbac");

const requireOwnership = (
  resource,
  field,
  currentUser,
  message = "You are not authorized to access this resource."
) => {
  if (!resource) {
    throw new AppError(
      "Resource not found.",
      404,
      "RESOURCE_NOT_FOUND"
    );
  }

  if (isPlatformAdministratorRole(currentUser.role)) {
    return true;
  }

  let ownerId = resource[field];

  // Handle populated references
  if (ownerId && ownerId._id) {
    ownerId = ownerId._id;
  }

  if (
    !ownerId ||
    ownerId.toString() !== currentUser._id.toString()
  ) {
    throw new AppError(
      message,
      403,
      "FORBIDDEN"
    );
  }

  return true;
};

const requireRole = (currentUser, allowedRoles) => {
  const normalized = normalizeRole(currentUser?.role);
  const normalizedAllowed = allowedRoles.map(normalizeRole).filter(Boolean);
  if (!currentUser || !normalized || !normalizedAllowed.includes(normalized)) {
    throw new AppError(
      "You are not authorized to perform this action.",
      403,
      "FORBIDDEN"
    );
  }

  return true;
};

module.exports = {
  requireOwnership,
  requireRole,
};
