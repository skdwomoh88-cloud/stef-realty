const asyncHandler = require("express-async-handler");
const notificationService = require("../services/notificationService");

const createNotification = asyncHandler(async (req, res) => {
  const notification = await notificationService.createNotification(req.body);

  res.status(201).json({
    success: true,
    data: notification,
  });
});

const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await notificationService.getNotifications(req.user._id);

  res.json({
    success: true,
    data: notifications,
  });
});

const getUnreadNotifications = asyncHandler(async (req, res) => {
  const notifications = await notificationService.getUnreadNotifications(
    req.user._id
  );

  res.json({
    success: true,
    data: notifications,
  });
});

const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(
  req.params.id,
  req.user._id
);

  res.json({
    success: true,
    data: notification,
  });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user._id);

  res.json({
    success: true,
    data: result,
  });
});

const deleteNotification = asyncHandler(async (req, res) => {
  await notificationService.deleteNotification(
  req.params.id,
  req.user._id
);

  res.json({
    success: true,
    message: "Notification deleted successfully.",
  });
});

module.exports = {
  createNotification,
  getNotifications,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};