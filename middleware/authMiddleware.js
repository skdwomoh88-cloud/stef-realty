const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { normalizeRole } = require("../utils/rbac");
const { ROLES } = require("../constants/roleCatalogue");

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      const user = await User.findById(decoded.id).select("+authVersion");

      if (!user || !user.isActive || Number(decoded.version || 0) !== Number(user.authVersion || 0)) {
        return res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "User account is unavailable.",
          },
        });
      }

      req.user = user;

      next();

    } catch (error) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Not authorized. Invalid token.",
        },
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Not authorized. No token.",
      },
    });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    const currentRole = normalizeRole(req.user?.role);
    const allowedRoles = roles.map(normalizeRole).filter(Boolean);
    if (!req.user || (currentRole !== ROLES.SUPER_ADMIN && !allowedRoles.includes(currentRole))) {
      return res.status(403).json({
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action.",
        },
      });
    }

    next();
  };
};

module.exports = {
  protect,
  authorize,
};
