const Notification = require("../models/Notification");

const createNotification = async ({
  recipient,
  title,
  message,
  type = "System",
  link = "",
  createdBy = null,
}) => {
  try {
    await Notification.create({
      recipient,
      title,
      message,
      type,
      link,
      createdBy,
    });
  } catch (error) {
    console.error("Notification Error:", error.message);
  }
};

module.exports = {
  createNotification,
};