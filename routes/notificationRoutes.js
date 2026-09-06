const express = require("express");

const router = express.Router();

const {
  createNotification,
  getNotifications,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} = require("../controllers/notificationController");

const { protect, authorize } = require("../middleware/authMiddleware");
const ROLES = require("../constants/roles");
const validate = require("../middleware/validationMiddleware");
const {
  createNotificationValidator,
  notificationIdValidator,
} = require("../validators/notificationValidator");

// Get all notifications
router.get("/", protect, getNotifications);

// Get unread notifications
router.get("/unread", protect, getUnreadNotifications);

// Create notification
router.post(
  "/",
  protect,
  authorize(ROLES.ADMIN),
  createNotificationValidator,
  validate,
  createNotification
);

// Mark one notification as read
router.put(
  "/:id/read",
  protect,
  notificationIdValidator,
  validate,
  markAsRead
);

// Mark all notifications as read
router.put("/read-all", protect, markAllAsRead);

// Delete notification
router.delete(
  "/:id",
  protect,
  notificationIdValidator,
  validate,
  deleteNotification
);

module.exports = router;
