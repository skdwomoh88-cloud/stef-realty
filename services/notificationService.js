const Notification = require("../models/Notification");
const AppError = require("../utils/AppError");

const createNotification = async (notificationData, options = {}) => {
  if (options.session) {
    const notifications = await Notification.create([notificationData], options);
    return notifications[0];
  }
  return await Notification.create(notificationData);
};

const getNotifications = async (userId) => {
  return await Notification.find({
    recipient: userId,
  })
    .sort({ createdAt: -1 })
    .populate("relatedProperty", "title")
    .populate("relatedInquiry")
    .populate("relatedViewingRequest")
    .populate("relatedTask")
    .populate("relatedPropertySubmission", "submissionReference title status assignedManager assignedAgent")
    .populate("relatedPropertyRequest", "requestNumber fullName status priority");

};

const getUnreadNotifications = async (userId) => {
  return await Notification.find({
    recipient: userId,
    isRead: false,
  })
    .sort({ createdAt: -1 })
    .populate("relatedProperty", "title")
    .populate("relatedInquiry")
    .populate("relatedViewingRequest")
    .populate("relatedTask")
    .populate("relatedPropertySubmission", "submissionReference title status assignedManager assignedAgent")
    .populate("relatedPropertyRequest", "requestNumber fullName status priority");
};

const markAsRead = async (notificationId, userId) => {
  const notification = await Notification.findOneAndUpdate(
    {
      _id: notificationId,
      recipient: userId,
    },
    {
      isRead: true,
    },
    {
      new: true,
    }
  );

  if (!notification) {
    throw new AppError(
      "Notification not found.",
      404,
      "NOTIFICATION_NOT_FOUND"
    );
  }

  return notification;
};

const markAllAsRead = async (userId) => {
  await Notification.updateMany(
    {
      recipient: userId,
      isRead: false,
    },
    {
      isRead: true,
    }
  );

  return { message: "All notifications marked as read." };
};

const deleteNotification = async (
  notificationId,
  userId
) => {
  const notification =
    await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: userId,
    });

  if (!notification) {
    throw new AppError(
      "Notification not found.",
      404,
      "NOTIFICATION_NOT_FOUND"
    );
  }

  return notification;
};

module.exports = {
  createNotification,
  getNotifications,
  getUnreadNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};
