const express = require("express");

const router = express.Router();

const {
  getUsers,
  updateUserRole,
  toggleUserStatus,
} = require("../controllers/userController");

const {
  protect,
  adminOnly,
} = require("../middleware/authMiddleware");

router.get(
  "/",
  protect,
  adminOnly,
  getUsers
);

router.put(
  "/:id/role",
  protect,
  adminOnly,
  updateUserRole
);

router.put(
  "/:id/status",
  protect,
  adminOnly,
  toggleUserStatus
);

module.exports = router;