const express = require("express");

const router = express.Router();

const {
  getUsers,
  updateUserRole,
  toggleUserStatus,
} = require("../controllers/userController");

const {
  protect,
  authorize,
} = require("../middleware/authMiddleware");

router.get(
  "/",
  protect,
  authorize("Admin"),
  getUsers
);

router.put(
  "/:id/role",
  protect,
  authorize("Admin"),
  updateUserRole
);

router.put(
  "/:id/status",
  protect,
  authorize("Admin"),
  toggleUserStatus
);

module.exports = router;