const AppError = require("../utils/AppError");
const { hasPermission, normalizeRole, getPermissionsForRole } = require("../utils/rbac");

const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) {
    return next(new AppError("Authentication is required.", 401, "UNAUTHORIZED"));
  }
  if (!hasPermission(req.user.role, permission)) {
    return next(new AppError("You do not have permission to perform this action.", 403, "FORBIDDEN"));
  }
  req.authorization = {
    role: normalizeRole(req.user.role),
    permissions: getPermissionsForRole(req.user.role),
  };
  return next();
};

const requireAnyPermission = (...permissions) => (req, res, next) => {
  if (!req.user) return next(new AppError("Authentication is required.", 401, "UNAUTHORIZED"));
  if (!permissions.some((permission) => hasPermission(req.user.role, permission))) return next(new AppError("You do not have permission to perform this action.", 403, "FORBIDDEN"));
  req.authorization = { role: normalizeRole(req.user.role), permissions: getPermissionsForRole(req.user.role) };
  return next();
};

module.exports = { requirePermission, requireAnyPermission };
