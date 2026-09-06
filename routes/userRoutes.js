const express = require("express");

const router = express.Router();

const {
  getUsers,
  updateUserRole,
  updateUserStatus,
  getRoleDirectory,
} = require("../controllers/userController");

const { protect } = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../constants/permissions");
const validate = require("../middleware/validationMiddleware");
const {
  updateUserRoleValidator,
  updateUserStatusValidator,
} = require("../validators/userValidator");

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.USER_VIEW),
  getUsers
);

router.get("/roles", protect, requirePermission(PERMISSIONS.USER_ROLE_MANAGE), getRoleDirectory);

router.put(
  "/:id/role",
  protect,
  requirePermission(PERMISSIONS.USER_ROLE_MANAGE),
  updateUserRoleValidator,
  validate,
  updateUserRole
);

router.put(
  "/:id/status",
  protect,
  requirePermission(PERMISSIONS.USER_STATUS_MANAGE),
  updateUserStatusValidator,
  validate,
  updateUserStatus
);

module.exports = router;
